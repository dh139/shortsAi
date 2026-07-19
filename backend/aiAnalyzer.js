/**
 * aiAnalyzer.js
 *
 * Real AI viral-clip selection using NVIDIA MiniMax-M3 (chat/completions).
 *
 * Approach (transcript-based):
 *   1. Whisper produces word-level timestamps for the whole video.
 *   2. We build a compact, timestamped transcript and send it to MiniMax-M3.
 *   3. The model returns the best standalone viral moments with:
 *        start, end, score, title, reason, description, hashtags
 *   4. For long videos we split the transcript into time windows and ask each
 *      window for a share of the target clips, then merge + dedupe + rank.
 *
 * If NVIDIA_API_KEY is missing or the API fails, callers fall back to the
 * existing heuristic planner (detectSmartMoments).
 */

const axios = require("axios")
const { v4: uuidv4 } = require("uuid")

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
const MODEL      = "minimaxai/minimax-m3"

const MIN_CLIP   = 12   // seconds
const MAX_CLIP   = 60   // seconds
const WINDOW_SEC = 900  // 15 min per analysis window

const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, "0")}`
}

// Build a readable transcript with a [m:ss] marker roughly every ~10 words.
const buildTranscriptText = (words) => {
  const parts = []
  let sinceMarker = 99
  for (const w of words) {
    if (sinceMarker >= 10) {
      parts.push(`[${fmtTime(w.start)}]`)
      sinceMarker = 0
    }
    parts.push(w.word)
    sinceMarker++
  }
  return parts.join(" ")
}

// Robustly pull a JSON array out of an LLM response (handles ```json fences,
// leading prose, trailing commentary).
const extractJsonArray = (text) => {
  if (!text) return null
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf("[")
  const end   = t.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return null
  const slice = t.slice(start, end + 1)
  try { return JSON.parse(slice) } catch {}
  // second chance: strip trailing commas
  try { return JSON.parse(slice.replace(/,\s*([\]}])/g, "$1")) } catch {}
  return null
}

// Accept either raw seconds (123) or an "m:ss" / "h:mm:ss" string.
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

const callMiniMax = async (messages, maxTokens = 8192) => {
  const key = process.env.NVIDIA_API_KEY
  if (!key) throw new Error("NVIDIA_API_KEY not set")
  const res = await axios.post(
    NVIDIA_URL,
    {
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.6,
      top_p: 0.95,
      stream: false,
    },
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      timeout: 180000,
    }
  )
  return res.data?.choices?.[0]?.message?.content || ""
}

const SYSTEM_PROMPT =
  "You are an expert short-form video editor who finds viral moments in long videos " +
  "(podcasts, interviews, vlogs, tutorials). You pick self-contained clips that hook a " +
  "viewer in the first 2 seconds: strong opinions, surprising facts, emotional beats, " +
  "punchlines, actionable advice, or story climaxes. You never pick filler, rambling, or " +
  "moments that only make sense with missing context. You respond with STRICT JSON ONLY."

// Analyze one transcript window and return an array of raw clip objects.
const analyzeWindow = async (windowWords, opts, wantClips) => {
  const transcript = buildTranscriptText(windowWords)
  const winStart = windowWords[0].start
  const winEnd   = windowWords[windowWords.length - 1].end

  const user =
`Video title: ${opts.title || "Untitled"}
Video type: ${opts.videoType || "general"}
This segment covers ${fmtTime(winStart)} to ${fmtTime(winEnd)} (timestamps in [m:ss] are absolute seconds into the FULL video).

Transcript:
${transcript}

Task: Select the ${wantClips} BEST viral short-form moments from this segment.

Rules:
- Each clip must be ${MIN_CLIP}-${MAX_CLIP} seconds long and start on a natural sentence boundary.
- "start" and "end" are absolute seconds into the full video, taken from the [m:ss] markers (convert m:ss to total seconds).
- Rank by real viral potential. "score" is 0-100 (be honest; reserve 90+ for truly exceptional hooks).
- Write "title", "reason" and "description" in the SAME language as the transcript.
- "title": punchy YouTube-Shorts/Reels title (<= 70 chars), may include 1 emoji.
- "description": 1-2 sentence caption for the post.
- "hashtags": 4-6 relevant hashtags as an array of strings WITHOUT the # symbol.

Respond with ONLY a JSON array, no prose:
[{"start": 123, "end": 152, "score": 88, "title": "...", "reason": "...", "description": "...", "hashtags": ["...","..."]}]`

  const content = await callMiniMax([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: user },
  ])

  const arr = extractJsonArray(content)
  if (!Array.isArray(arr)) {
    console.warn("[ai] window returned unparseable content:", content.slice(0, 200))
    return []
  }

  const out = []
  for (const c of arr) {
    let start = toSeconds(c.start)
    let end   = toSeconds(c.end)
    if (!isFinite(start) || !isFinite(end)) continue
    if (end < start) [start, end] = [end, start]
    // clamp inside window bounds and enforce clip length limits
    start = Math.max(winStart, start)
    end   = Math.min(winEnd, end)
    let dur = end - start
    if (dur < MIN_CLIP) { end = Math.min(winEnd, start + MIN_CLIP); dur = end - start }
    if (dur > MAX_CLIP) { end = start + MAX_CLIP; dur = MAX_CLIP }
    if (dur < MIN_CLIP - 2) continue
    const score = Math.max(1, Math.min(100, Math.round(Number(c.score) || 70)))
    out.push({
      startTime: Math.round(start),
      endTime:   Math.round(end),
      duration:  Math.round(dur),
      viralScore: score,
      title:  (c.title  || "Viral Moment").toString().slice(0, 120),
      reason: (c.reason || "AI-selected highlight").toString().slice(0, 160),
      description: (c.description || "").toString().slice(0, 300),
      hashtags: Array.isArray(c.hashtags)
        ? c.hashtags.map(h => String(h).replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
        : [],
    })
  }
  return out
}

// Remove clips that overlap heavily (keep the higher-scored one).
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
 * Main entry point.
 * @param {Array} words   full-video word list [{word,start,end}]
 * @param {Object} opts   { title, videoType, language, duration, targetClips }
 * @returns {Array} moment objects compatible with processClipsInParallel, or null on hard failure
 */
const analyzeTranscriptForClips = async (words, opts = {}) => {
  if (!process.env.NVIDIA_API_KEY) { console.warn("[ai] NVIDIA_API_KEY missing — skipping AI analysis"); return null }
  if (!words || words.length < 20)  { console.warn("[ai] transcript too short for AI analysis"); return null }

  const duration    = opts.duration || words[words.length - 1].end
  const targetClips = Math.max(20, Math.min(45, opts.targetClips || 42))

  // Split words into time windows.
  const windows = []
  let cur = []
  let winStart = words[0].start
  for (const w of words) {
    if (w.start - winStart > WINDOW_SEC && cur.length > 30) {
      windows.push(cur); cur = []; winStart = w.start
    }
    cur.push(w)
  }
  if (cur.length) windows.push(cur)

  const perWindow = Math.ceil(targetClips / windows.length) + 2
  console.log(`[ai] Analyzing ${words.length} words in ${windows.length} window(s), ~${perWindow} clips each (target ${targetClips})`)

  // Analyze all windows in parallel (independent API calls).
  const settled = await Promise.all(windows.map(async (win, i) => {
    try {
      const clips = await analyzeWindow(win, opts, perWindow)
      console.log(`[ai] window ${i + 1}/${windows.length} → ${clips.length} clips`)
      return clips
    } catch (e) {
      console.error(`[ai] window ${i + 1} failed:`, e.response?.data?.detail || e.message)
      return []
    }
  }))
  const all = settled.flat()

  if (!all.length) return null

  const deduped = dedupeOverlaps(all)
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, targetClips)

  // Shape into full moment objects expected by the pipeline.
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
    minStartTime: Math.max(0, c.startTime - 90),
    maxEndTime:   Math.min(duration, c.endTime + 90),
    originalStart: c.startTime,
    originalEnd:   c.endTime,
  }))

  // Present best-first.
  moments.sort((a, b) => b.viralScore - a.viralScore)
  console.log(`[ai] ✅ Final AI clip set: ${moments.length} clips`)
  return moments
}

module.exports = { analyzeTranscriptForClips }
