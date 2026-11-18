/**
 * aiAnalyzer.js
 *
 * Real AI viral-clip selection using Google AI Studio (Gemini).
 *
 * Replaces NVIDIA MiniMax with Google Gemini:
 *   - Uses Google AI Studio Gemini API with fast flash-lite / flash models.
 *   - Supports full video transcript analysis with word timestamps.
 *   - Auto-detects viral hooks, high-retention stories, controversial takes,
 *     funny moments, and actionable advice for YouTube Shorts / Reels / TikTok.
 *   - Resilient multi-model fallback cascade for 100% uptime:
 *     gemini-flash-lite-latest -> gemini-3.1-flash-lite -> gemini-3.5-flash-lite -> gemini-3-flash-preview
 *   - Supports metadata fallback (chapters, title, description) when transcripts
 *     are short or unavailable.
 */

const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

// Supported fast Gemini models in order of priority
const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
]

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || ""

const MIN_CLIP   = 15   // minimum seconds for a short
const MAX_CLIP   = 60   // maximum seconds for a short (ideal for Shorts/Reels)
const WINDOW_SEC = 900  // 15 min per transcript analysis window

const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, "0")}`
}

// Build a readable transcript with a [m:ss] marker roughly every ~10 words
const buildTranscriptText = (words) => {
  if (!Array.isArray(words)) return ""
  const parts = []
  let sinceMarker = 99
  for (const w of words) {
    if (sinceMarker >= 10 && w.start !== undefined) {
      parts.push(`[${fmtTime(w.start)}]`)
      sinceMarker = 0
    }
    parts.push(w.word || "")
    sinceMarker++
  }
  return parts.join(" ")
}

// Robustly pull a JSON array out of Gemini's response
const extractJsonArray = (text) => {
  if (!text) return null
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()

  const sanitizeTimestamps = (str) => {
    // Quote unquoted mm:ss or hh:mm:ss timestamps like "start": 35:54 or "end": 1:05:22
    let s = str.replace(/:\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*([,}])/g, ': "$1"$2')
    // Remove trailing commas before ] or }
    s = s.replace(/,\s*([\]}])/g, "$1")
    return s
  }

  // First check if root is JSON array
  const start = t.indexOf("[")
  const end   = t.lastIndexOf("]")
  if (start !== -1 && end > start) {
    let slice = t.slice(start, end + 1)
    try { return JSON.parse(slice) } catch {}
    try { return JSON.parse(sanitizeTimestamps(slice)) } catch {}
  }

  // Check if root is JSON object containing array (e.g. { "clips": [...] } or { "moments": [...] })
  try {
    const sanitized = sanitizeTimestamps(t)
    const obj = JSON.parse(sanitized)
    if (Array.isArray(obj)) return obj
    for (const key of ["clips", "moments", "results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key]
    }
  } catch {}

  return null
}

// Accept either raw seconds (123) or an "m:ss" / "h:mm:ss" string
const toSeconds = (v) => {
  if (typeof v === "number") return v
  if (typeof v === "string") {
    if (/^\d+(\.\d+)?$/.test(v.trim())) return parseFloat(v)
    const parts = v.trim().split(":").map(Number)
    if (parts.some(isNaN)) return NaN
    return parts.reduce((acc, p) => acc * 60 + p, 0)
  }
  return NaN
}

/**
 * Call Google AI Studio (Gemini) with automatic multi-model failover
 */
const callGemini = async (prompt, systemPromptOrOpts = SYSTEM_PROMPT) => {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    DEFAULT_API_KEY

  if (!apiKey) throw new Error("Google AI Studio GEMINI_API_KEY not set")

  let systemPrompt = SYSTEM_PROMPT
  let temperature = 0.35
  let maxOutputTokens = 8192
  let responseMimeType = "application/json"

  if (typeof systemPromptOrOpts === "string") {
    systemPrompt = systemPromptOrOpts
  } else if (typeof systemPromptOrOpts === "object" && systemPromptOrOpts !== null) {
    if (systemPromptOrOpts.systemPrompt) systemPrompt = systemPromptOrOpts.systemPrompt
    if (systemPromptOrOpts.temperature !== undefined) temperature = systemPromptOrOpts.temperature
    if (systemPromptOrOpts.maxTokens !== undefined) maxOutputTokens = systemPromptOrOpts.maxTokens
    if (systemPromptOrOpts.responseMimeType !== undefined) responseMimeType = systemPromptOrOpts.responseMimeType
  }

  let lastError = null
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType,
          temperature,
          maxOutputTokens,
        },
      }

      const res = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 25000,
      })

      const content = res.data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (content) {
        console.log(`[ai] ✅ Gemini (${model}) responded successfully`)
        return content
      }
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message
      console.warn(`[ai] Gemini model '${model}' failed: ${errMsg} — trying fallback model...`)
      lastError = err
    }
  }

  throw lastError || new Error("All Gemini models failed to respond")
}

const SYSTEM_PROMPT =
  "You are an elite short-form video editor and viral content strategist. Your goal is to analyze long YouTube video content " +
  "and identify the most viral, hook-driven, high-retention short clips (15 to 60 seconds each) for YouTube Shorts, TikTok, and Instagram Reels.\n" +
  "What makes a clip viral:\n" +
  "1. Powerful Hook in the first 2-3 seconds (provocative question, shocking statement, surprising fact, emotional trigger).\n" +
  "2. High Retention & Standalone completeness: The viewer should understand the full context without seeing the whole video.\n" +
  "3. Satisfying Payoff / Punchline / Actionable insight before the clip ends.\n" +
  "4. No awkward cuts mid-sentence or rambling filler.\n" +
  "You ALWAYS output STRICT JSON ONLY."

// Analyze one transcript window and return parsed clips
const analyzeWindow = async (windowWords, opts, wantClips) => {
  const transcript = buildTranscriptText(windowWords)
  const winStart = windowWords[0].start
  const winEnd   = windowWords[windowWords.length - 1].end

  const userPrompt =
`Video title: ${opts.title || "Untitled"}
Video type: ${opts.videoType || "general"}
Target language: ${opts.language || "auto"}
This segment covers timestamp ${fmtTime(winStart)} to ${fmtTime(winEnd)} (timestamps in [m:ss] are absolute seconds into the FULL video).

Transcript segment:
${transcript}

Task: Find the top ${wantClips} BEST standalone viral short moments from this segment.

Rules:
- Each clip must be ${MIN_CLIP}-${MAX_CLIP} seconds long.
- Cover diverse themes across the segment: controversial statements, surprising truths, emotional revelations, life lessons, humor, and high-energy debate hooks.
- Start and end on natural sentence boundaries (do not cut mid-word or mid-sentence).
- "start" and "end" MUST be integers (absolute seconds into the video, e.g. 120, 2154) or quoted strings in "m:ss" (e.g. "35:54").
- "score": viral rating from 1 to 100 based on hook strength, emotional intensity, and retention value.
- "title": punchy YouTube-Shorts/Reels title (under 70 characters), include 1 relevant emoji.
- "reason": 1 sentence explaining why this moment will hook viewers and go viral.
- "description": 1-2 sentence compelling social caption.
- "hashtags": array of 4-6 trending hashtags (WITHOUT the # symbol).
- For Hindi and Gujarati videos, ALWAYS write "title", "reason", and "description" in Hinglish or Gujlish (modern Latin / Roman alphabet, e.g. "Old Age Home Ka Sach 🏠", "Har Ladke Ko Ye 3 Jagah Jana Chahiye 🏛️", "Pyaar Jaisi Koi Cheez Nahi Hoti 💔"). NEVER use Devanagari or Gujarati native script. For English videos, use English.

Respond ONLY with a JSON array:
[{"start": 120, "end": 165, "score": 92, "title": "...", "reason": "...", "description": "...", "hashtags": ["...","..."]}]`

  const content = await callGemini(userPrompt, { temperature: 0.7 })
  const arr = extractJsonArray(content)

  if (!Array.isArray(arr)) {
    console.warn("[ai] Gemini window returned unparseable content:", (content || "").slice(0, 200))
    return []
  }

  const out = []
  for (const c of arr) {
    let start = toSeconds(c.start)
    let end   = toSeconds(c.end)
    if (!isFinite(start) || !isFinite(end)) continue
    if (end < start) [start, end] = [end, start]

    start = Math.max(winStart, start)
    end   = Math.min(winEnd, end)
    let dur = end - start
    if (dur < MIN_CLIP) { end = Math.min(winEnd, start + MIN_CLIP); dur = end - start }
    if (dur > MAX_CLIP) { end = start + MAX_CLIP; dur = MAX_CLIP }
    if (dur < MIN_CLIP - 2) continue

    const score = Math.max(1, Math.min(100, Math.round(Number(c.score) || 75)))
    out.push({
      startTime: Math.round(start),
      endTime:   Math.round(end),
      duration:  Math.round(dur),
      viralScore: score,
      title:  (c.title  || "Viral Moment").toString().slice(0, 120),
      reason: (c.reason || "AI-selected highlight").toString().slice(0, 200),
      description: (c.description || "").toString().slice(0, 300),
      hashtags: Array.isArray(c.hashtags)
        ? c.hashtags.map(h => String(h).replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
        : [],
    })
  }
  return out
}

/**
 * Fallback when transcript is missing or too short:
 * Analyze video title, description, duration, and chapters using Gemini.
 */
const analyzeMetadataWithGemini = async (opts = {}, targetClips = 10) => {
  const duration = opts.duration || 300
  const chaptersText = Array.isArray(opts.chapters) && opts.chapters.length
    ? opts.chapters.map(c => `[${fmtTime(c.start_time || 0)}] ${c.title || ""}`).join("\n")
    : "No chapters provided"

  const userPrompt =
`Video Title: ${opts.title || "Untitled"}
Duration: ${Math.round(duration)} seconds (${fmtTime(duration)})
Category / Type: ${opts.videoType || "general"}
Description: ${(opts.description || "").slice(0, 1000)}
Chapters:
${chaptersText}

Task: Predict and select the top ${targetClips} BEST potential viral short clip timestamps for this video.
Rules:
- Each clip must be ${MIN_CLIP}-${MAX_CLIP} seconds long.
- "start" and "end" in absolute seconds (between 0 and ${Math.round(duration)}).
- Focus on high-interest points: introduction hooks, chapter beginnings, climactic moments, strong takeaways.
- "score": 1-100 rating.
- "title": punchy title with 1 emoji (in modern Hinglish/Gujlish for Hindi/Gujarati content, Latin alphabet only).
- For Hindi/Gujarati videos, ALWAYS write "title", "reason", and "description" in Hinglish/Gujlish (Latin/Roman alphabet). Never use native Devanagari or Gujarati script.
- "reason": why this segment is likely a viral highlight.
- "description": social caption.
- "hashtags": 4-6 hashtags without #.

Respond with ONLY a JSON array:
[{"start": 30, "end": 75, "score": 88, "title": "...", "reason": "...", "description": "...", "hashtags": ["..."]}]`

  try {
    const content = await callGemini(userPrompt)
    const arr = extractJsonArray(content)
    if (!Array.isArray(arr)) return []
    const out = []
    for (const c of arr) {
      let start = toSeconds(c.start)
      let end   = toSeconds(c.end)
      if (!isFinite(start) || !isFinite(end)) continue
      if (end < start) [start, end] = [end, start]
      start = Math.max(0, Math.min(duration - MIN_CLIP, start))
      end   = Math.min(duration, Math.max(start + MIN_CLIP, end))
      const dur = end - start
      if (dur < MIN_CLIP - 2) continue
      out.push({
        startTime: Math.round(start),
        endTime:   Math.round(end),
        duration:  Math.round(dur),
        viralScore: Math.max(1, Math.min(100, Math.round(Number(c.score) || 75))),
        title: (c.title || "Viral Highlight").toString().slice(0, 120),
        reason: (c.reason || "AI predicted highlight").toString().slice(0, 200),
        description: (c.description || "").toString().slice(0, 300),
        hashtags: Array.isArray(c.hashtags) ? c.hashtags.map(h => String(h).replace(/^#/, "").trim()).filter(Boolean) : [],
      })
    }
    return out
  } catch (err) {
    console.warn("[ai] Metadata analysis with Gemini failed:", err.message)
    return []
  }
}

// Remove clips that overlap heavily (keep the higher-scored one)
const dedupeOverlaps = (clips, minGap = 8) => {
  const sorted = [...clips].sort((a, b) => b.viralScore - a.viralScore)
  const kept = []
  for (const c of sorted) {
    const clash = kept.some(k =>
      Math.abs(k.startTime - c.startTime) < minGap ||
      (c.startTime < k.endTime && c.endTime > k.startTime &&
        Math.min(c.endTime, k.endTime) - Math.max(c.startTime, k.startTime) > c.duration * 0.5)
    )
    if (!clash) kept.push(c)
  }
  return kept
}

/**
 * Main entry point: Analyzes YouTube video transcript / content and produces viral clips.
 *
 * @param {Array} words   full-video word list [{word,start,end}]
 * @param {Object} opts   { title, videoType, language, duration, targetClips, description, chapters }
 * @returns {Array} moment objects compatible with processClipsInParallel, or null on hard failure
 */
const analyzeTranscriptForClips = async (words, opts = {}) => {
  const duration    = opts.duration || (words && words.length ? words[words.length - 1].end : 300)
  const durationMin = duration / 60
  let targetClips
  if (opts.targetClips && opts.targetClips !== 30) {
    targetClips = Math.max(3, Math.min(40, opts.targetClips))
  } else if (durationMin <= 5) {
    targetClips = 4
  } else if (durationMin <= 12) {
    targetClips = 8
  } else if (durationMin <= 30) {
    targetClips = 14
  } else if (durationMin <= 60) {
    targetClips = 20
  } else {
    // Dynamic clip count for long podcasts/videos (>60m, e.g. 87 min): 22 - 30 clips
    targetClips = Math.min(32, Math.max(20, Math.round(durationMin / 3.4)))
  }

  console.log(`[ai] 🎬 Google AI Studio (Gemini) analyzing: "${opts.title || "Video"}" (${Math.round(duration)}s)`)

  let rawClips = []

  // If transcript is available and has words, use deep transcript analysis
  if (Array.isArray(words) && words.length >= 20) {
    // Split transcript words into time windows (e.g. 15 minutes each)
    const windows = []
    let cur = []
    let winStart = words[0].start || 0
    for (const w of words) {
      if (w.start - winStart > WINDOW_SEC && cur.length > 30) {
        windows.push(cur)
        cur = []
        winStart = w.start
      }
      cur.push(w)
    }
    if (cur.length) windows.push(cur)

    const perWindow = Math.max(5, Math.ceil(targetClips / windows.length) + 1)
    console.log(`[ai] Analyzing ${words.length} words across ${windows.length} window(s) (~${perWindow} clips/window, target=${targetClips})...`)

    // Analyze windows in parallel
    const settled = await Promise.all(windows.map(async (win, i) => {
      try {
        const clips = await analyzeWindow(win, opts, perWindow)
        console.log(`[ai] Window ${i + 1}/${windows.length} → ${clips.length} clips identified`)
        return clips
      } catch (e) {
        console.error(`[ai] Window ${i + 1} analysis error:`, e.message)
        return []
      }
    }))
    rawClips = settled.flat()
  } else {
    console.log(`[ai] Transcript sparse or unavailable — using Gemini metadata & chapter analysis...`)
    rawClips = await analyzeMetadataWithGemini(opts, targetClips)
  }

  if (!rawClips.length) {
    console.warn("[ai] Gemini returned no clips — falling back to heuristic planner")
    return null
  }

  const deduped = dedupeOverlaps(rawClips)
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, targetClips)

  // Shape into full moment objects expected by the shorts processing pipeline
  const moments = deduped.map(c => ({
    id: uuidv4(),
    startTime: c.startTime,
    endTime:   c.endTime,
    duration:  c.duration,
    viralScore: c.viralScore,
    title:  c.title,
    reason: c.reason,
    description: c.description,
    hashtags: c.hashtags,
    pattern: "ai",
    quality: "1080p",
    videoType: opts.videoType || "general",
    language:  opts.language  || "english",
    minStartTime: 0,
    maxEndTime:   duration,
    originalStart: c.startTime,
    originalEnd:   c.endTime,
  }))

  moments.sort((a, b) => b.viralScore - a.viralScore)
  console.log(`[ai] ✅ Google AI Studio selected ${moments.length} viral clips! Top score: ${moments[0]?.viralScore || 0}`)
  return moments
}

const transliterateWordsWithGemini = async (words, targetLanguage = "hinglish") => {
  if (!Array.isArray(words) || !words.length) return words
  try {
    const rawTokens = words.map(w => w.word)
    const prompt = `You are an expert multilingual linguist. Transliterate the following array of ${targetLanguage === "gujlish" ? "Gujarati" : "Hindi"} words/phrases into clean, modern phonetic Latin/Roman script (${targetLanguage === "gujlish" ? "Gujlish" : "Hinglish"}) as used on social media shorts/reels.
CRITICAL RULES:
1. Return EXACTLY the same number of words in the exact same array order.
2. Do not translate the meaning, ONLY transliterate phonetic pronunciation into Latin alphabet.
3. Return ONLY a valid JSON array of strings: ["word1", "word2", ...].

Input words array:
${JSON.stringify(rawTokens)}`

    const response = await callGemini(prompt, { temperature: 0.2, maxTokens: 4096 })
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const transliterated = JSON.parse(jsonMatch[0])
      if (Array.isArray(transliterated) && transliterated.length === words.length) {
        console.log(`[ai] ✅ Successfully transliterated ${words.length} words to ${targetLanguage}`)
        return words.map((w, idx) => ({
          ...w,
          word: transliterated[idx] || w.word,
          originalWord: w.word
        }))
      }
    }
  } catch (err) {
    console.warn("[ai] Transliteration failed:", err.message)
  }
  return words
}

module.exports = {
  analyzeTranscriptForClips,
  callGemini,
  transliterateWordsWithGemini,
}
