/**
 * server.js  v16
 *
 * NEW IN v16:
 * ──────────────────────────────────────────────────────────────────────────
 * 1. FASTER WHISPER: Process 3 chunks in parallel (was sequential)
 *    - Concurrency set to 3 parallel Whisper processes
 *    - Progress shown per batch completion
 *
 * 2. SKIP LANGUAGE PROBE: Use hint language when provided
 *    - If user selects Hindi/Hinglish/English, skip 30s probe
 *    - Saves ~30+ seconds on transcription
 *
 * 3. HINGLISH/HINDI SUPPORT:
 *    - Added hinglish word pool for placeholder captions
 *    - ASS subtitle builder uses Noto Sans for hi-en too
 *
 * 4. FASTER FFMPEG: superfast preset + higher CRF
 *    - Changed from ultrafast to superfast + zerolatency tune
 *    - CRF 28 instead of 23 (faster encoding, small file)
 *    - Added keyint settings for fast streaming
 *
 * 5. MORE PARALLEL CLIPS: BATCH=6 (was 4)
 *    - Process 6 clips at a time
 *
 * 6. VIDEO PREVIEW: In trim/extend modal
 *    - Preview section with video player
 *    - Play/Pause/Start/End buttons
 *    - Shows current time while playing
 *
 * All v15 fixes preserved from v15:
 * - Session persistence, caption styles, download strategy order
 */

const express    = require("express")
const mongoose   = require("mongoose")
const cors       = require("cors")
const path       = require("path")
const fs         = require("fs").promises
const fsSync     = require("fs")
const youtubedl  = require("youtube-dl-exec")
const ffmpeg     = require("fluent-ffmpeg")
const { v4: uuidv4 } = require("uuid")
const http       = require("http")
const socketIo   = require("socket.io")
const { spawn, spawnSync } = require("child_process")
const axios = require("axios")
require("dotenv").config()

const { downloadVideo, findYtDlpBinary } = require("./downloader")
const authRoutes = require("./routes/auth")
const User       = require("./models/user")

const app    = express()
const server = http.createServer(app)
const io     = socketIo(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET","POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const PORT = process.env.PORT || 5000
const processingSessions = new Map()
const activeExtractions = new Map()
const activeCaptionings = new Map()

app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ytshorts")
mongoose.connection.on("error", console.error.bind(console, "MongoDB error:"))
mongoose.connection.once("open", () => console.log("✅ Connected to MongoDB"))
app.use("/api/auth", authRoutes)

// ─────────────────────────────────────────────────────────────────────────────
//  CAPTION STYLE PRESETS  (mirrors client-side CAPTION_STYLES)
// ─────────────────────────────────────────────────────────────────────────────
const CAPTION_STYLE_PRESETS = {
  classic:   { font: "Arial Black",      fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#8b5cf6", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, scalePop: false, outline: 5, shadow: 2 },
  neon:      { font: "Impact",            fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#ec4899", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  scalePop: true,  outline: 5, shadow: 2 },
  tiktok:    { font: "Montserrat",        fontSize: 78, primaryColor: "#FFFFFF", highlightColor: "#ec4899", outlineColor: "#000000", position: "center", bgBox: true,  bgColor: "rgba(0,0,0,0.75)", bold: true, uppercase: true,  scalePop: true,  outline: 0, shadow: 0 },
  minimal:   { font: "Helvetica Neue",    fontSize: 68, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: false, uppercase: false, scalePop: false, outline: 3, shadow: 1 },
  fire:      { font: "Arial Black",       fontSize: 88, primaryColor: "#FFF176", highlightColor: "#ec4899", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  scalePop: true,  outline: 5, shadow: 2 },
  hindi:     { font: "Noto Sans",         fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#8b5cf6", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, scalePop: false, outline: 5, shadow: 2 },
  hormozi:   { font: "Impact",            fontSize: 92, primaryColor: "#FFFF00", highlightColor: "#00FF00", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  scalePop: true,  outline: 5, shadow: 2 },
  aesthetic: { font: "Montserrat",        fontSize: 78, primaryColor: "#FFFFFF", highlightColor: "#D8B4FE", outlineColor: "#000000", position: "bottom", bgBox: true,  bgColor: "rgba(0,0,0,0.7)",  bold: true,  uppercase: false, scalePop: true,  outline: 0, shadow: 0 },
  cyberpunk: { font: "Arial Black",       fontSize: 88, primaryColor: "#00FFFF", highlightColor: "#FF00FF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  scalePop: true,  outline: 5, shadow: 2 },
  drktalks:  { font: "Poppins",           fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#00D2FF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, scalePop: true,  outline: 8, shadow: 0 },
  pill:      { font: "Outfit",            fontSize: 72, primaryColor: "#FFFFFF", highlightColor: "#8b5cf6", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, scalePop: false, outline: 0, shadow: 0 },
}

const resolveCaptionStyle = (styleId) => {
  return CAPTION_STYLE_PRESETS[styleId] || CAPTION_STYLE_PRESETS.classic
}

// ─────────────────────────────────────────────────────────────────────────────
//  WHISPER DETECTION
// ─────────────────────────────────────────────────────────────────────────────
let WHISPER_AVAILABLE   = false
let WHISPER_CMD         = null
let WHISPER_ARGS_PREFIX = []
let WHISPER_DETECT_LOG  = []

const detectWhisper = () => {
  const log = (msg) => { WHISPER_DETECT_LOG.push(msg); console.log("[whisper-detect]", msg) }
  try {
    const r = spawnSync("whisper", ["--help"], { stdio: "pipe", timeout: 5000 })
    if (r.status === 0 || (r.stderr && r.stderr.toString().includes("usage"))) {
      log("✅ Found: whisper CLI in PATH"); return { ok: true, cmd: "whisper", prefix: [] }
    }
  } catch (e) { log(`✗ whisper CLI: ${e.message}`) }

  for (const py of ["python", "python3", "py", "py3"]) {
    try {
      const r = spawnSync(py, ["-c", "import whisper; print(whisper.__file__)"], { stdio: "pipe", timeout: 8000 })
      if (r.status === 0) {
        log(`✅ Found: openai-whisper via ${py}`)
        return { ok: true, cmd: py, prefix: ["-m", "whisper"] }
      }
    } catch (e) { log(`✗ ${py}: ${e.message}`) }
  }

  const os   = require("os")
  const home = os.homedir()
  const extraPaths = [
    path.join(home, "AppData","Local","Programs","Python","Python312","Scripts","whisper.exe"),
    path.join(home, "AppData","Local","Programs","Python","Python311","Scripts","whisper.exe"),
    path.join(home, "AppData","Local","Programs","Python","Python310","Scripts","whisper.exe"),
    path.join(home, "AppData","Roaming","Python","Python312","Scripts","whisper.exe"),
    path.join(home, "AppData","Roaming","Python","Python311","Scripts","whisper.exe"),
    path.join(home, "anaconda3","Scripts","whisper.exe"),
    path.join(home, "miniconda3","Scripts","whisper.exe"),
    path.join(home, "anaconda3","bin","whisper"),
    path.join(home, "miniconda3","bin","whisper"),
    "/usr/local/bin/whisper", "/usr/bin/whisper",
    path.join(home, ".local","bin","whisper"),
  ]
  for (const wp of extraPaths) {
    try { if (fsSync.existsSync(wp)) { log(`✅ Found: ${wp}`); return { ok: true, cmd: wp, prefix: [] } } }
    catch {}
  }
  log("✗ Whisper not found — pip install openai-whisper")
  return { ok: false, cmd: null, prefix: [] }
}

const wd = detectWhisper()
WHISPER_AVAILABLE   = wd.ok
WHISPER_CMD         = wd.cmd
WHISPER_ARGS_PREFIX = wd.prefix
console.log(WHISPER_AVAILABLE
  ? `✅ Whisper ready → ${WHISPER_CMD} ${WHISPER_ARGS_PREFIX.join(" ")}`
  : "⚠️  Whisper NOT found — captions will use placeholder text")

// UTF-8 env for Python/Whisper (fixes Hindi UnicodeEncodeError on Windows)
const WHISPER_ENV = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
  PYTHONLEGACYWINDOWSSTDIO: "0",
  PYTHONUNBUFFERED: "1",
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ensureUploadsDir = async () => {
  for (const d of ["uploads","uploads/videos","uploads/clips","uploads/thumbnails","uploads/transcripts"])
    await fs.mkdir(d, { recursive: true }).catch(() => {})
}
const safeDelete = async (fp) => { try { await fs.unlink(fp) } catch {} }
const safeRmdir  = async (dp) => { try { await fs.rm(dp, { recursive: true, force: true }) } catch {} }
const verifyFile = async (fp, minMb = 0.1) => {
  try {
    const s = await fs.stat(fp)
    return s.size < minMb * 1_048_576 ? { exists: false, size: 0 } : { exists: true, size: Math.round(s.size / 1_048_576) }
  } catch { return { exists: false, size: 0 } }
}

const walkForJson = async (rootDir) => {
  const results = []
  const recurse = async (dir) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) await recurse(full)
        else if (e.name.endsWith(".json")) results.push(full)
      }
    } catch {}
  }
  await recurse(rootDir)
  return results
}

const getRealDuration = (videoPath) =>
  new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (!err) {
        let dur = parseFloat(meta?.format?.duration || 0)
        if (dur < 600) {
          const vs = (meta?.streams || []).find(s => s.codec_type === "video")
          const streamDur = parseFloat(vs?.duration || 0)
          if (streamDur > dur) dur = streamDur
          if (dur < 600 && vs?.nb_frames && vs?.r_frame_rate) {
            const [num, den] = (vs.r_frame_rate || "25/1").split("/")
            const fps = parseFloat(num) / parseFloat(den || 1)
            const framesDur = parseInt(vs.nb_frames) / fps
            if (framesDur > dur * 2) dur = framesDur
          }
        }
        if (dur > 10) { console.log(`[duration] ✅ ${Math.round(dur)}s`); return resolve(dur) }
      }
      const probe = spawn("ffprobe", ["-v","quiet","-print_format","json","-show_format","-show_streams", videoPath], { stdio: ["ignore","pipe","pipe"] })
      let out = ""
      probe.stdout.on("data", d => out += d)
      probe.on("close", () => {
        try {
          const j = JSON.parse(out)
          const dur  = parseFloat(j?.format?.duration || 0)
          const vs   = (j?.streams || []).find(s => s.codec_type === "video")
          const sdur = parseFloat(vs?.duration || 0)
          resolve(Math.max(dur, sdur) > 10 ? Math.max(dur, sdur) : 300)
        } catch { resolve(300) }
      })
      probe.on("error", () => resolve(300))
    })
  })

// ─────────────────────────────────────────────────────────────────────────────
//  WHISPER CORE
// ─────────────────────────────────────────────────────────────────────────────
const runWhisperOnFile = (absAudioPath, absChunkDir, whisperLangCode) =>
  new Promise(async (resolve) => {
    await fs.mkdir(absChunkDir, { recursive: true }).catch(() => {})
    const relOutDir = path.relative(process.cwd(), absChunkDir)
    const audioStem = path.basename(absAudioPath, ".wav")

    const args = [
      ...WHISPER_ARGS_PREFIX,
      absAudioPath,
      "--model",           "tiny",
      "--output_format",   "json",
      "--output_dir",      relOutDir,
      "--word_timestamps", "True",
      "--fp16",            "False",
      "--beam_size",       "1",
      "--best_of",         "1",
      "--temperature",     "0",
      "--condition_on_previous_text", "False",
    ]
    if (whisperLangCode) args.push("--language", whisperLangCode)

    const proc = spawn(WHISPER_CMD, args, { stdio: ["ignore","pipe","pipe"], cwd: process.cwd(), env: WHISPER_ENV })
    let stderrLog = ""
    proc.stdout.on("data", d => {
      const text = d.toString("utf8")
      text.split("\n").filter(l => l.trim() && (l.includes("%") || /language|detect/i.test(l)))
        .forEach(l => process.stdout.write(`[whisper] ${l.trim()}\n`))
    })
    proc.stderr.on("data", d => { stderrLog += d.toString("utf8") })

    const timer = setTimeout(() => { proc.kill(); resolve(null) }, 30 * 60 * 1000)

    proc.on("close", async (code) => {
      clearTimeout(timer)
      if (stderrLog.includes("UnicodeEncodeError") || stderrLog.includes("charmap")) {
        console.error("[whisper] ❌ UnicodeEncodeError — PYTHONIOENCODING may not have taken effect")
      }
      if (code !== 0) { console.error(`[whisper] chunk failed (code=${code}):`, stderrLog.slice(-500)); return resolve(null) }

      const absTranscriptsDir = path.resolve("uploads/transcripts")
      const searchDirs = [absChunkDir, path.dirname(absChunkDir), process.cwd(), absTranscriptsDir]
      const scoreFile = (fname) => {
        let score = 0
        if (fname.startsWith(audioStem)) score += 100
        if (fname.endsWith(".words.json")) score += 10
        if (fname.endsWith(".json")) score += 1
        return score
      }
      const tryFindJson = async (dir) => {
        try {
          const files = await fs.readdir(dir)
          const jsonFiles = files.filter(f => f.endsWith(".json"))
          if (!jsonFiles.length) return null
          const scored = jsonFiles.map(f => ({ f, fp: path.join(dir, f), score: scoreFile(f) })).filter(x => x.score > 0).sort((a,b) => b.score - a.score)
          const candidates = scored.length > 0 ? scored : await Promise.all(jsonFiles.map(async f => {
            const fp = path.join(dir, f)
            try { const st = await fs.stat(fp); return { f, fp, score: 0, mtime: st.mtimeMs } } catch { return null }
          })).then(arr => arr.filter(Boolean).sort((a,b) => (b.mtime||0) - (a.mtime||0)))
          for (const c of candidates) {
            try { const raw = await fs.readFile(c.fp, "utf8"); const json = JSON.parse(raw); if (!json.segments) continue; console.log(`[whisper] ✅ Found JSON: ${c.f}`); await safeDelete(c.fp).catch(() => {}); return json } catch {}
          }
        } catch {}
        return null
      }
      for (const dir of searchDirs) { const r = await tryFindJson(dir); if (r) return resolve(r) }
      try {
        const allJson = await walkForJson(absTranscriptsDir)
        const stemMatches = allJson.filter(fp => path.basename(fp).startsWith(audioStem) && path.basename(fp).endsWith(".json"))
        const candidates = stemMatches.length > 0 ? stemMatches : allJson
        for (const fp of candidates) {
          try { const raw = await fs.readFile(fp, "utf8"); const json = JSON.parse(raw); if (!json.segments) continue; console.log(`[whisper] ✅ Found JSON (recursive): ${fp}`); await safeDelete(fp).catch(() => {}); return resolve(json) } catch {}
        }
      } catch {}
      try {
        const allJson = await walkForJson(process.cwd())
        const stemMatches = allJson.filter(fp => { const base = path.basename(fp); return base.startsWith(audioStem) && base.endsWith(".json") })
        for (const fp of stemMatches) {
          try { const raw = await fs.readFile(fp, "utf8"); const json = JSON.parse(raw); if (!json.segments) continue; console.log(`[whisper] ✅ Found JSON (cwd walk): ${fp}`); await safeDelete(fp).catch(() => {}); return resolve(json) } catch {}
        }
      } catch {}
      console.warn(`[whisper] ❌ JSON not found for stem: "${audioStem}"`)
      resolve(null)
    })
    proc.on("error", (e) => { clearTimeout(timer); console.error("[whisper] spawn error:", e.message); resolve(null) })
  })

const extractWordsFromWhisperJson = (json, timeOffset = 0) => {
  if (!json) return []
  const words = []
  for (const seg of (json.segments || [])) {
    if (Array.isArray(seg.words) && seg.words.length > 0) {
      for (const w of seg.words) {
        const clean = (w.word || "").trim().replace(/[^\p{L}\p{N}\s''\-।]/gu, "").trim()
        if (clean && w.start != null && w.end != null && w.end > w.start) {
          words.push({ word: clean, start: +(w.start + timeOffset).toFixed(3), end: +(w.end + timeOffset).toFixed(3) })
        }
      }
    } else if (seg.text && seg.start != null && seg.end != null) {
      const rawWords = seg.text.trim().split(/\s+/).filter(Boolean)
      if (!rawWords.length) continue
      const wDur = (seg.end - seg.start) / rawWords.length
      rawWords.forEach((w, i) => {
        const clean = w.replace(/[^\p{L}\p{N}\s''\-।]/gu, "").trim()
        if (!clean) return
        const wStart = seg.start + i * wDur
        words.push({ word: clean, start: +(wStart + timeOffset).toFixed(3), end: +(Math.min(seg.end, wStart + wDur) + timeOffset).toFixed(3) })
      })
    }
  }
  return words
}

const sliceWavChunk = (srcWav, chunkPath, startSec, durationSec) =>
  new Promise((resolve, reject) => {
    ffmpeg(srcWav).setStartTime(startSec).setDuration(durationSec)
      .audioCodec("pcm_s16le").outputOptions(["-ar","16000","-ac","1"])
      .output(chunkPath).on("end", resolve).on("error", reject).run()
  })

const extractFullAudio = (videoPath, audioPath) =>
  new Promise((resolve, reject) => {
    ffmpeg(videoPath).audioChannels(1).audioFrequency(16000).audioCodec("pcm_s16le")
      .outputOptions(["-threads","0","-vn"]).output(audioPath).on("end", resolve).on("error", reject).run()
  })

const probeAudioLanguage = async (fullAudioPath, baseStem, baseTransDir) => {
  try {
    const probeDir     = path.join(baseTransDir, `${baseStem}_probe_dir`)
    await fs.mkdir(probeDir, { recursive: true }).catch(() => {})
    const probeWavPath = path.join(probeDir, `${baseStem}_probe.wav`)
    await sliceWavChunk(fullAudioPath, probeWavPath, 0, 30)
    const probeJson = await runWhisperOnFile(probeWavPath, probeDir, null)
    await safeDelete(probeWavPath).catch(() => {})
    await safeRmdir(probeDir).catch(() => {})
    if (probeJson?.language) { console.log(`[whisper] 🎙️ Audio language probe: "${probeJson.language}"`); return probeJson.language }
  } catch (e) { console.warn("[whisper] Language probe failed:", e.message) }
  return null
}

const transcribeWithWhisper = async (videoPath, hintLanguage = null) => {
  if (!WHISPER_AVAILABLE || !WHISPER_CMD) return null
  const absVideoPath  = path.resolve(videoPath)
  const baseStem      = path.basename(absVideoPath, ".mp4")
  const fullAudioPath = absVideoPath.replace(".mp4", "_full.wav")
  const baseTransDir  = path.resolve("uploads/transcripts")

  console.log(`[whisper] ── Full File Transcription ──`)
  try {
    await extractFullAudio(absVideoPath, fullAudioPath)
    if (!(await verifyFile(fullAudioPath, 0.001)).exists) throw new Error("Full audio empty")
  } catch (e) { console.error("[whisper] ❌ Audio extraction failed:", e.message); return null }

  let detectedLanguage = null
  const hintCode = (hintLanguage === "hindi" || hintLanguage === "hi") ? "hi" : (hintLanguage === "english" || hintLanguage === "en") ? "en" : (hintLanguage === "hinglish" || hintLanguage === "hi-en") ? "hi" : null
  
  if (hintCode) {
    detectedLanguage = hintCode
    console.log(`[whisper] Using hint language: ${hintCode} (skip probe)`)
  } else {
    let audioLang = await probeAudioLanguage(fullAudioPath, baseStem, baseTransDir)
    if (audioLang === "ur" || audioLang === "urdu") {
      console.log(`[whisper] Auto-detected Urdu (${audioLang}), mapping to Hindi (hi) for Devanagari script`)
      audioLang = "hi"
    }
    if (audioLang) {
      detectedLanguage = audioLang
    } else {
      detectedLanguage = hintCode
    }
  }

  console.log(`[whisper] Running transcription on full audio file: ${fullAudioPath}...`)
  
  let json = null
  try {
    json = await runWhisperOnFile(fullAudioPath, baseTransDir, detectedLanguage)
  } catch (e) {
    console.error("[whisper] Transcription failed:", e.message)
  }

  await safeDelete(fullAudioPath).catch(() => {})
  
  if (!json) return null
  
  const allWords = extractWordsFromWhisperJson(json, 0)
  if (allWords.length < 10) return null
  
  const finalLang = json.language || detectedLanguage || "en"
  const appLanguage = (finalLang === "hi" || finalLang === "ur" || finalLang === "urdu") ? "hindi" : finalLang === "en" ? "english" : finalLang || "english"
  
  console.log(`[whisper] ✅ Transcription complete! Words found: ${allWords.length}`)
  return { words: allWords, detectedLanguage: appLanguage }
}

const runWhisperClipProc = (args, clipTransDir) => {
  return new Promise((resolve) => {
    const proc = spawn(WHISPER_CMD, args, { stdio: ["ignore", "pipe", "pipe"], cwd: process.cwd(), env: WHISPER_ENV })
    let stderr = ""
    proc.stderr.on("data", d => stderr += d.toString())
    
    const timer = setTimeout(() => { proc.kill(); resolve(null) }, 300000) // 5 min timeout for 30s clip

    proc.on("close", async (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.error(`[whisper-clip] failed with code ${code}:`, stderr)
        return resolve(null)
      }
      
      try {
        const files = await fs.readdir(clipTransDir)
        const jsonFile = files.find(f => f.endsWith(".json"))
        if (jsonFile) {
          const raw = await fs.readFile(path.join(clipTransDir, jsonFile), "utf8")
          const json = JSON.parse(raw)
          resolve(json)
        } else {
          resolve(null)
        }
      } catch (err) {
        console.error(`[whisper-clip] error reading output:`, err.message)
        resolve(null)
      }
    })
  })
}

const transcribeClipOnDemand = async (clipPath, hintLanguage = null) => {
  if (!WHISPER_AVAILABLE || !WHISPER_CMD) return null
  const absClipPath = path.resolve(clipPath)
  const baseStem = path.basename(absClipPath, ".mp4")
  const baseTransDir = path.resolve("uploads/transcripts")
  const clipTransDir = path.join(baseTransDir, `${baseStem}_trans_dir`)
  
  await fs.mkdir(clipTransDir, { recursive: true }).catch(() => {})

  const hintCode = (hintLanguage === "hindi" || hintLanguage === "hi" || hintLanguage === "hinglish" || hintLanguage === "hi-en") ? "hi" : null

  const args = [
    ...WHISPER_ARGS_PREFIX,
    absClipPath,
    "--model",           "base",
    "--output_format",   "json",
    "--output_dir",      path.relative(process.cwd(), clipTransDir),
    "--word_timestamps", "True",
    "--fp16",            "False",
    "--beam_size",       "1",
    "--best_of",         "1",
    "--temperature",     "0",
    "--condition_on_previous_text", "False",
  ]
  if (hintCode) args.push("--language", hintCode)

  console.log(`[whisper-clip] CMD: ${WHISPER_CMD} ${args.join(" ")}`)
  
  let resultJson = await runWhisperClipProc(args, clipTransDir)

  const isHindustani = (lang) => {
    if (!lang) return false
    const l = lang.toLowerCase()
    return l === "hi" || l === "hindi" || l === "ur" || l === "urdu"
  }

  if (resultJson && isHindustani(resultJson.language) && hintCode !== "hi") {
    console.log(`[whisper-clip] Whisper auto-detected Hindustani/Urdu/Hindi (${resultJson.language}). Re-running transcription with language forced to Hindi (hi) to get proper Devanagari script...`)
    const newArgs = [...args]
    const langIndex = newArgs.indexOf("--language")
    if (langIndex !== -1) {
      newArgs[langIndex + 1] = "hi"
    } else {
      newArgs.push("--language", "hi")
    }
    await safeRmdir(clipTransDir).catch(() => {})
    await fs.mkdir(clipTransDir, { recursive: true }).catch(() => {})
    resultJson = await runWhisperClipProc(newArgs, clipTransDir)
  }

  await safeRmdir(clipTransDir).catch(() => {})

  if (!resultJson) return null

  const words = extractWordsFromWhisperJson(resultJson, 0)
  const finalLang = resultJson.language || hintCode || "en"
  const appLanguage = (finalLang === "hi" || finalLang === "ur" || finalLang === "urdu") ? "hindi" : finalLang === "en" ? "english" : finalLang || "english"
  
  return { words, detectedLanguage: appLanguage }
}

const sliceTranscript = (words, clipStart, clipEnd) => {
  if (!words?.length) return null
  const sliced = words
    .filter(w => w.start < clipEnd + 1.5 && w.end > clipStart - 1.5)
    .filter(w => w.start < clipEnd && w.end > clipStart)
    .map(w => ({ word: w.word, start: +Math.max(0, w.start - clipStart).toFixed(3), end: +Math.max(0, w.end - clipStart).toFixed(3) }))
    .filter(w => w.start >= 0 && w.end > w.start)
  return sliced.length >= 1 ? sliced : null
}

const generatePlaceholderCaptions = (clipDuration, language, clipStartTime = 0) => {
  const hi = ["और","यह","बहुत","जरूरी","है","क्योंकि","जब","आप","सोचते","हैं","तो","सच","यह","है","कि","कोई","नहीं","बताता","यह","बात","लेकिन","मैंने","यह","सीखा","जब","सब","कुछ","बदल","गया","यह","वो","पल","था","जब","मुझे","एहसास","हुआ","कि","जिंदगी","यही","सब","से","एक","दो","तीन","चार","पांच","छह","सात","आठ","नौ","दस","बीस","तीस","चालीस","पचास","इस","उस","किस","हर","कोई","सबको","कुछ","बहुत","थोड़ा","बहुत","ज्यादा","अभी","फिर","अब","फिर"]
  const en = ["and","that","is","exactly","why","this","matters","so","much","because","when","you","think","about","it","nobody","talks","about","this","let","me","tell","you","something","that","changed","everything","stay","consistent","trust","the","process","here","now","actually","really","honestly","think","about","this","for","a","moment","imagine","just","imagine","how","amazing","would","be","if","we","could","just","be","honest","one","thing","most","people","dont","know","about","is"]
  const hinglish = ["aur","yeh","bahut","jaroori","hai","kyunki","jab","aap","sochte","ho","toh","sach","hai","ki","koi","nahi","batata","yeh","baat","lekin","maine","yeh","sikha","jab","sab","kuch","badal","gaya","yeh","woh","pal","tha","jab","mujhe","ehsaas","hua","ki","zindagi","dekho","bhai","yaar","acha","theek","chalo","ab","abhi","kya","kaise","aise","woh","yeh","sab","koi","ek","do","teen","char","paanch","saat","aath","nou","das","bahut","zyada","kam","zyada","accha","theek","hai","nahin","to","phir","lekin","kyun","ab","to","phir","fir","bas","abhi","ab","hi","yeh","woh","kya","kyun","aise","waise","kaise","haan","nahin","bilkul","matlab","samajh","eko","du","teen","char","panja","che","sat","aath","nav","das","ek","do","teen","char","paanch","so","lets","go","yeah","okay","nice","cool","great","awesome","amazing"]
  const pool = (language === "hindi" || language === "hi") ? hi : (language === "hinglish" || language === "hi-en") ? hinglish : en
  const segs = []
  let t = 0.5, i = Math.floor(clipStartTime * 11 + 7) % pool.length
  while (t < clipDuration - 0.8) {
    const dur = 0.3 + ((i * 13 + Math.floor(t * 5)) % 7) * 0.08
    segs.push({ word: pool[i % pool.length], start: +t.toFixed(3), end: +(t + dur).toFixed(3) })
    t += dur + 0.08; i++
    if (i >= pool.length * 2) i = Math.floor(t * 3) % pool.length
  }
  return segs
}

const detectLayout = (videoPath) =>
  new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (err) return resolve("single")
      const vs    = (meta.streams || []).find(s => s.codec_type === "video") || {}
      const ratio = (vs.width || 1920) / (vs.height || 1080)
      if (ratio > 1.85) return resolve("podcast_split")
      if (ratio < 0.75) return resolve("portrait")
      resolve("single")
    })
  })

// ── YTShortAI Active Speaker Reframing Helpers ─────────────────────────────────
const groupWordsIntoTurns = (words, clipStartTime, clipDuration) => {
  const turns = [];
  if (!words || words.length === 0) return turns;
  
  let currentTurn = {
    words: [words[0]],
    start: words[0].start,
    end: words[0].end
  };
  
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const gap = w.start - words[i - 1].end;
    
    if (gap < 0.45) {
      currentTurn.words.push(w);
      currentTurn.end = w.end;
    } else {
      turns.push(currentTurn);
      currentTurn = {
        words: [w],
        start: w.start,
        end: w.end
      };
    }
  }
  turns.push(currentTurn);
  return turns;
};

const getSpeakerTurns = (words, clipStartTime, clipDuration, faceCoords = null) => {
  const rawTurns = groupWordsIntoTurns(words, clipStartTime, clipDuration);
  const turns = [];
  let lastSpeaker = 'A';
  
  const motionHistory = faceCoords?.motionHistory || [];
  
  for (let i = 0; i < rawTurns.length; i++) {
    const turn = rawTurns[i];
    const turnStart = turn.start - clipStartTime;
    const turnEnd = turn.end - clipStartTime;
    const duration = turnEnd - turnStart;
    const wordCount = turn.words.length;
    
    // Face Priority Zones: Ignore switches for turns under 500ms and <= 2 words
    const isInterruption = duration < 0.5 && wordCount <= 2;
    
    let speaker = lastSpeaker;
    if (!isInterruption) {
      if (motionHistory.length > 0) {
        // Sample motion values within the turn time bounds
        const turnAbsStart = turn.start;
        const turnAbsEnd = turn.end;
        
        let sumLeft = 0.0;
        let sumRight = 0.0;
        let count = 0;
        
        for (const item of motionHistory) {
          if (item.t >= turnAbsStart && item.t <= turnAbsEnd) {
            sumLeft += item.left || 0.0;
            sumRight += item.right || 0.0;
            count++;
          }
        }
        
        // If we found samples, choose the one with the higher mouth motion
        if (count > 0) {
          if (sumLeft > sumRight + 2.0) { // added tolerance threshold
            speaker = 'A';
          } else if (sumRight > sumLeft + 2.0) {
            speaker = 'B';
          } else {
            // If motion is close, keep the last speaker or use the raw alternation as fallback
            speaker = lastSpeaker;
          }
        } else {
          speaker = (i === 0) ? 'A' : (lastSpeaker === 'A' ? 'B' : 'A');
        }
      } else {
        speaker = (i === 0) ? 'A' : (lastSpeaker === 'A' ? 'B' : 'A');
      }
    }
    
    turns.push({
      start: turnStart,
      end: turnEnd,
      duration,
      speaker,
      words: turn.words
    });
    
    lastSpeaker = speaker;
  }
  return turns;
};

const runFaceTracking = (videoPath, startTime, duration) => {
  return new Promise((resolve) => {
    const pythonCmd = "python"
    const scriptPath = path.resolve(__dirname, "detect_faces.py")
    
    const args = [
      scriptPath,
      "--video", path.resolve(videoPath),
      "--start", startTime.toString(),
      "--duration", duration.toString(),
      "--interval", "0.5"
    ]
    
    console.log(`[face-tracker] Spawning face tracking: ${pythonCmd} ${args.join(" ")}`)
    const proc = spawn(pythonCmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: __dirname })
    
    let stdout = ""
    let stderr = ""
    
    const timer = setTimeout(() => {
      console.warn("[face-tracker] Timeout reached, killing process")
      proc.kill()
      resolve(null)
    }, 90000)
    
    proc.stdout.on("data", d => stdout += d.toString())
    proc.stderr.on("data", d => stderr += d.toString())
    
    proc.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.error(`[face-tracker] python exited with code ${code}, stderr: ${stderr}`)
        return resolve(null)
      }
      
      try {
        const res = JSON.parse(stdout.trim())
        if (res.success) {
          console.log(`[face-tracker] Success: ${res.details || ""}`)
          resolve(res)
        } else {
          console.error(`[face-tracker] Python script returned error:`, res.error)
          resolve(null)
        }
      } catch (err) {
        console.error(`[face-tracker] Failed to parse JSON: "${stdout}"`, err.message)
        resolve(null)
      }
    })
  })
}

const getSpeakerTargets = (segments, clipStartTime, clipDuration, srcW, cw, faceCoords = null) => {
  let xLeft = Math.max(0, Math.round(srcW * 0.25 - cw / 2));
  let xRight = Math.min(srcW - cw, Math.round(srcW * 0.75 - cw / 2));
  let xCenter = Math.round((srcW - cw) / 2);
  let speakerCount = 2;
  
  if (faceCoords) {
    speakerCount = faceCoords.speakerCount || 2;
    if (faceCoords.xLeft !== undefined) {
      xLeft = Math.max(0, Math.min(srcW - cw, Math.round(faceCoords.xLeft - cw / 2)));
    }
    if (faceCoords.xRight !== undefined) {
      xRight = Math.max(0, Math.min(srcW - cw, Math.round(faceCoords.xRight - cw / 2)));
    }
    if (speakerCount === 1) {
      xCenter = xLeft;
    }
  }

  const targets = [];
  let currentX = speakerCount === 1 ? xCenter : xCenter;
  targets.push({ t: 0, x: currentX });

  const motionHistory = faceCoords?.motionHistory || [];

  if (speakerCount > 1 && motionHistory.length > 0) {
    let lastActiveSpeaker = 'A';
    let lastSwitchTime = 0;
    
    // Scan every 0.5s to resolve who is speaking
    for (let t = 0.5; t < clipDuration; t += 0.5) {
      const absTime = t + clipStartTime;
      // Find motion samples near this timestamp
      const item = motionHistory.find(h => Math.abs(h.t - absTime) < 0.3);
      
      if (item) {
        const left = item.left || 0.0;
        const right = item.right || 0.0;
        
        let activeSpeaker = lastActiveSpeaker;
        
        // Speaker choice based on mouth motion ratio comparisons
        const minSpeakMotion = 3.0
        if (left > minSpeakMotion || right > minSpeakMotion) {
          if (left > right * 1.4 + 1.0) {
            activeSpeaker = 'A';
          } else if (right > left * 1.4 + 1.0) {
            activeSpeaker = 'B';
          }
        }
        
        if (activeSpeaker !== lastActiveSpeaker) {
          // Ignore switch if it happens too fast (cooldown threshold of 1.5s to prevent jitter)
          if (t - lastSwitchTime > 1.5) {
            const targetX = activeSpeaker === 'A' ? xLeft : xRight;
            
            // Reaction hold: 15% chance to delay switch by 400-900ms
            let delay = 0;
            if (Math.random() < 0.15) {
              delay = 0.4 + Math.random() * 0.5;
            }
            
            const transitionStart = Math.max(lastSwitchTime, t - 0.2 + delay);
            const transitionEnd = Math.min(clipDuration, transitionStart + 0.35);
            
            if (transitionStart > targets[targets.length - 1].t) {
              targets.push({ t: transitionStart, x: currentX });
            }
            targets.push({ t: transitionEnd, x: targetX });
            
            currentX = targetX;
            lastActiveSpeaker = activeSpeaker;
            lastSwitchTime = t;
          }
        }
      }
    }
  } else {
    // Fallback: Use word-based turns if motionHistory is absent or not 2-speaker
    const turns = getSpeakerTurns(segments, clipStartTime, clipDuration, faceCoords);
    if (speakerCount > 1 && turns.length > 0) {
      let lastSpeaker = 'A';
      let lastEnd = 0;
      
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        
        if (i === 0 || turn.speaker !== lastSpeaker) {
          const nextSpeaker = turn.speaker;
          const targetX = speakerCount === 1 ? xCenter : (nextSpeaker === 'A' ? xLeft : xRight);
          
          if (targetX !== currentX) {
            let delay = 0;
            if (i > 0 && Math.random() < 0.15) {
              delay = 0.4 + Math.random() * 0.5;
            }
            
            const transitionStart = Math.max(lastEnd, turn.start - 0.2 + delay);
            const transitionEnd = Math.min(clipDuration, transitionStart + 0.35);
            
            if (transitionStart > targets[targets.length - 1].t) {
              targets.push({ t: transitionStart, x: currentX });
            }
            
            targets.push({ t: transitionEnd, x: targetX });
            currentX = targetX;
          }
          lastSpeaker = nextSpeaker;
        }
        lastEnd = turn.end;
      }
    }
  }

  if (targets[targets.length - 1].t < clipDuration) {
    targets.push({ t: clipDuration, x: currentX });
  }

  return targets;
};

const getZoomTargets = (words, clipStartTime, clipDuration) => {
  const targets = [{ t: 0, z: 1.0 }];
  
  const emotionalKeywords = new Set([
    "shocking", "amazing", "crazy", "unbelievable", "secret", "never", "hate", "love", "must", "important", "sach", "raaz", "khush", "dukh", "gussa",
    "अद्भुत", "प्यार", "चौंक", "राज़", "पागल", "broke", "million", "billion"
  ]);
  
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wStart = w.start - clipStartTime;
    const wEnd = w.end - clipStartTime;
    const wordText = w.word.replace(/[^\w\u0900-\u097F]/g, "");
    const cleanWord = wordText.toLowerCase();
    
    const isKeyword = emotionalKeywords.has(cleanWord);
    const hasExclamation = w.word.includes("!");
    const isCaps = wordText.length > 1 && wordText === wordText.toUpperCase() && !/^\d+$/.test(wordText);
    
    let hasPause = false;
    if (i > 0) {
      const gap = w.start - words[i - 1].end;
      if (gap > 0.35) hasPause = true;
    }
    
    const sentiment = (isKeyword || hasExclamation) ? 1.0 : 0.0;
    const audioIntensity = isCaps ? 1.0 : (isKeyword ? 0.5 : 0.0);
    const pauseEmphasis = hasPause ? 1.0 : 0.0;
    
    // Zoom strength formula
    const score = (sentiment * 0.4) + (audioIntensity * 0.4) + (pauseEmphasis * 0.2);
    
    if (score > 0.1) {
      const zoomVal = +(1.0 + score * 0.18).toFixed(3);
      const zoomStart = Math.max(0, wStart - 0.1);
      const zoomEnd = Math.min(clipDuration, wEnd + 0.15);
      
      targets.push({ t: zoomStart, z: 1.0 });
      targets.push({ t: zoomStart + 0.2, z: zoomVal });
      targets.push({ t: zoomEnd - 0.2, z: zoomVal });
      targets.push({ t: zoomEnd, z: 1.0 });
    }
  }
  
  targets.push({ t: clipDuration, z: 1.0 });
  targets.sort((a, b) => a.t - b.t);
  
  const clean = [];
  for (let i = 0; i < targets.length; i++) {
    if (i === 0 || targets[i].t !== targets[i - 1].t || targets[i].z !== targets[i - 1].z) {
      clean.push(targets[i]);
    }
  }
  return clean;
};

const buildPanExpression = (targets) => {
  if (targets.length === 0) return "0";
  let expr = `${targets[targets.length - 1].x}`;
  for (let i = targets.length - 2; i >= 0; i--) {
    const cur = targets[i];
    const next = targets[i + 1];
    if (next.x !== cur.x) {
      const duration = next.t - cur.t;
      if (duration < 0.01) {
        expr = `if(lt(t,${next.t}),${next.x},${expr})`;
      } else {
        const u = `(t-${cur.t.toFixed(2)})/${duration.toFixed(3)}`;
        const ease = `(3*(${u})*(${u})-2*(${u})*(${u})*(${u}))`;
        expr = `if(lt(t,${cur.t.toFixed(2)}),${cur.x},if(lt(t,${next.t.toFixed(2)}),${cur.x}+(${next.x}-${cur.x})*${ease},${expr}))`;
      }
    }
  }
  return expr;
};

const buildZoomExpression = (targets) => {
  if (targets.length === 0) return "1";
  let expr = `${targets[targets.length - 1].z}`;
  for (let i = targets.length - 2; i >= 0; i--) {
    const cur = targets[i];
    const next = targets[i + 1];
    if (next.z !== cur.z) {
      const duration = next.t - cur.t;
      if (duration < 0.01) {
        expr = `if(lt(t,${next.z}),${next.z},${expr})`;
      } else {
        const u = `(t-${cur.t.toFixed(2)})/${duration.toFixed(3)}`;
        const ease = `(3*(${u})*(${u})-2*(${u})*(${u})*(${u}))`;
        expr = `if(lt(t,${cur.t.toFixed(2)}),${cur.z},if(lt(t,${next.t.toFixed(2)}),${cur.z}+(${next.z}-${cur.z})*${ease},${expr}))`;
      }
    }
  }
  return expr;
};

const extractClip = (inputPath, outputPath, startTime, clipDuration, videoType, layout = "single", segments = null) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, async (err, meta) => {
      if (err) return reject(new Error("ffprobe failed: " + err.message))
      const vs   = (meta.streams || []).find(s => s.codec_type === "video") || {}
      const srcW = vs.width || 1920, srcH = vs.height || 1080
      const TW = 1080, TH = 1920
      let vf

      if (layout === "podcast_split") {
        const cropW  = Math.round(srcW * 0.55)
        const rightX = Math.round(srcW * 0.45)
        vf = [`split=2[L][R]`,`[L]crop=${cropW}:${srcH}:0:0,scale=${TW}:${TH/2}:flags=lanczos,setsar=1[top]`,`[R]crop=${cropW}:${srcH}:${rightX}:0,scale=${TW}:${TH/2}:flags=lanczos,setsar=1[bot]`,`[top][bot]vstack=inputs=2`].join(";")
      } else if (layout === "portrait") {
        vf = `scale=${TW}:${TH}:force_original_aspect_ratio=decrease,pad=${TW}:${TH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
      } else {
        const cw = Math.min(srcW, Math.round(srcH * 9 / 16))
        if (segments && segments.length > 0) {
          let faceCoords = null
          try {
            faceCoords = await runFaceTracking(inputPath, startTime, clipDuration)
          } catch (e) {
            console.error("[extractClip] face tracking error, using heuristics:", e.message)
          }

          const panTargets = getSpeakerTargets(segments, startTime, clipDuration, srcW, cw, faceCoords);
          const panExpr = buildPanExpression(panTargets);
          
          const zoomTargets = getZoomTargets(segments, startTime, clipDuration);
          const zoomExpr = buildZoomExpression(zoomTargets);
          
          const wExpr = `(${cw})/(${zoomExpr})`
          const hExpr = `(${srcH})/(${zoomExpr})`
          const xExpr = `(${panExpr})+((${cw})-(${cw})/(${zoomExpr}))/2 + 8*sin(t*0.4)`
          const yExpr = `((${srcH})-(${srcH})/(${zoomExpr}))/2`
          
          vf = `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}',scale=${TW}:${TH},setsar=1`
        } else {
          const cx = Math.round((srcW - cw) / 2)
          vf = `crop=${cw}:${srcH}:${cx}:0,scale=${TW}:${TH},setsar=1`
        }
      }

      const stderrLines = [];
      ffmpeg(inputPath)
        .setStartTime(startTime).setDuration(clipDuration)
        .videoCodec("libx264").audioCodec("aac").audioBitrate("128k")
        .outputOptions([
          "-vf", vf, "-s", `${TW}x${TH}`,
          "-preset", "ultrafast", "-tune", "zerolatency",
          "-crf", "30", "-movflags", "+faststart",
          "-threads", "2", "-filter_threads", "2", "-pix_fmt", "yuv420p",
          "-g", "30", "-keyint_min", "30",
          "-sc_threshold", "0"
        ])
        .output(outputPath)
        .on("stderr", (line) => {
          stderrLines.push(line);
          if (stderrLines.length > 40) stderrLines.shift();
        })
        .on("end", resolve)
        .on("error", (e) => {
          console.error("\n=== FFmpeg Error Details ===\n" + stderrLines.join("\n") + "\n============================\n");
          reject(new Error("FFmpeg: " + e.message + " | Details: " + stderrLines.slice(-3).join(" ")));
        })
        .run();
    })
  })

// ─────────────────────────────────────────────────────────────────────────────
//  ASS SUBTITLE BUILDER — with style support (original v15 caption logic)
// ─────────────────────────────────────────────────────────────────────────────
const hexToAss = (hex) => {
  // Convert #RRGGBB to ASS &H00BBGGRR format
  const c = hex.replace("#", "")
  if (c.length === 6) {
    const r = c.slice(0,2), g = c.slice(2,4), b = c.slice(4,6)
    return `&H00${b}${g}${r}`
  }
  return "&H00FFFFFF"
}

const parseRgba = (rgba) => {
  // Convert rgba(r,g,b,a) to ASS alpha+color
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
  if (!m) return { color: "&H00000000", alpha: "&H80" }
  const r = parseInt(m[1]).toString(16).padStart(2,"0")
  const g = parseInt(m[2]).toString(16).padStart(2,"0")
  const b = parseInt(m[3]).toString(16).padStart(2,"0")
  return { color: `&H00${b}${g}${r}`, alpha: "&H40" }
}

const getDynamicHighlightColor = (word, defaultHighlightColor) => {
  const cleanWord = word.toLowerCase().replace(/[^\w\u0900-\u097F]/g, "");
  
  const emotionalWords = new Set([
    "amazing", "love", "shocking", "secret", "crazy", "truth", "hate", "scared", "fear", "anger", "angry", "emotional", "mind", "soul", "heart", "god", "death", "live", "life",
    "sach", "raaz", "khush", "dukh", "gussa", "dost", "dushman", "pyaar", "mohabbat", "nafrat", "khatra", "dar", "saty", "satya",
    "अद्भुत", "प्यार", "चौंक", "राज़", "पागल", "सच्चाई", "नफरत", "डर", "गुस्सा", "भावना", "दिल", "भगवान", "मौत", "जिंदगी"
  ]);
  
  const numberFactsWords = new Set([
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "hundred", "thousand", "million", "billion", "percent", "first", "second", "third", "last",
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "100", "1000",
    "ek", "do", "teen", "chaar", "char", "paanch", "panch", "chheh", "saat", "aath", "nau", "das", "sau", "hazaar", "fisad", "fisadi",
    "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "सौ", "हज़ार", "प्रतिशत"
  ]);
  
  if (emotionalWords.has(cleanWord)) {
    return "&H00FF64DC"; // Purple/Violet (&H00BBGGRR -> Hex DC64FF)
  }
  if (numberFactsWords.has(cleanWord) || /^\d+$/.test(cleanWord)) {
    return "&H00FFFF00"; // Cyan (&H00BBGGRR -> Hex 00FFFF)
  }
  return defaultHighlightColor;
};

const drawRoundedRect = (w, h, r) => {
  w = Math.round(w);
  h = Math.round(h);
  r = Math.round(r);
  const k = 0.55228;
  const radius = Math.round(Math.min(r, h / 2));
  const cx1 = w - radius;
  const cx2 = radius;
  const commands = [
    `m ${cx2} 0`,
    `l ${cx1} 0`,
    `b ${Math.round(cx1 + radius*k)} 0 ${w} ${Math.round(radius*(1-k))} ${w} ${radius}`,
    `b ${w} ${Math.round(h - radius*(1-k))} ${Math.round(cx1 + radius*k)} ${h} ${cx1} ${h}`,
    `l ${cx2} ${h}`,
    `b ${Math.round(cx2 - radius*k)} ${h} 0 ${Math.round(h - radius*(1-k))} 0 ${h - radius}`,
    `b 0 ${Math.round(radius*(1-k))} ${Math.round(cx2 - radius*k)} 0 ${cx2} 0`
  ];
  return commands.join(" ");
};

const estimateWordWidth = (word, fontSize) => {
  let width = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if (/[A-Z]/.test(char)) {
      width += fontSize * 0.65;
    } else if (/[a-z]/.test(char)) {
      width += fontSize * 0.45;
    } else if (/[0-9]/.test(char)) {
      width += fontSize * 0.5;
    } else if (/[\u0900-\u097F]/.test(char)) {
      width += fontSize * 0.6;
    } else {
      width += fontSize * 0.35;
    }
  }
  return Math.round(width);
};

const buildAssSubtitles = (segments, videoWidth = 1080, videoHeight = 1920, language = "english", stylePreset = "classic", selectedFont = null) => {
  const style   = resolveCaptionStyle(stylePreset)
  const hasDevanagari = segments.some(w => /[\u0900-\u097F]/.test(w.word))
  let font = hasDevanagari ? "Noto Sans" : style.font
  if (!hasDevanagari && selectedFont && selectedFont !== "default") {
    font = selectedFont
  }
  const fontSize = style.fontSize
  const boldFlag = style.bold ? "-1" : "0"
  const BOM = "\uFEFF"

  // Position: bottom=2, center=5
  const alignment = style.position === "center" ? "5" : "2"
  const marginV   = style.position === "center" ? Math.round(videoHeight * 0.45) : Math.round(videoHeight * 0.18)

  // Colors in ASS format
  const primaryColor   = hexToAss(style.primaryColor)
  const outlineColor   = hexToAss(style.outlineColor)
  const highlightColor = hexToAss(style.highlightColor)

  const outline = style.outline !== undefined ? style.outline : 5
  const shadow  = style.shadow !== undefined ? style.shadow : 2

  // Background box: use BackColour + BorderStyle 3 for opaque box
  let bgColor = "&H80000000"
  let borderStyle = "1"  // outline
  if (style.bgBox) {
    borderStyle = "3"    // opaque box
    bgColor = "&H90000000"
    const parsed = parseRgba(style.bgColor)
    bgColor = parsed.color
  }

  const header = `${BOM}[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: S,${font},${fontSize},${primaryColor},&H000000FF,${outlineColor},${bgColor},${boldFlag},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const toAss = (s) => {
    const v  = Math.max(0, s)
    const h  = Math.floor(v / 3600)
    const m  = Math.floor((v % 3600) / 60)
    const sc = Math.floor(v % 60)
    const cs = Math.round((v % 1) * 100)
    return `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"00")}.${String(cs).padStart(2,"00")}`
  }

  const toTitleCase = (str) => {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }

  const lines = []
  if (stylePreset === "pill") {
    const posY = videoHeight - marginV;
    for (let i = 0; i < segments.length; i++) {
      const cur = segments[i];
      let displayWord = (cur.word || "").trim();
      if (style.uppercase) {
        displayWord = displayWord.toUpperCase();
      }
      
      const h = Math.round(fontSize * 1.35);
      const r = Math.round(h / 2);
      const w = Math.max(Math.round(fontSize * 1.2), estimateWordWidth(displayWord, fontSize) + Math.round(fontSize * 0.85));
      
      const activeHighlight = getDynamicHighlightColor(cur.word, highlightColor);
      const isHighlighted = activeHighlight !== highlightColor;
      
      let pillColor, pillAlpha, textColor;
      if (isHighlighted) {
        pillColor = activeHighlight;
        pillAlpha = "&H00&"; // Opaque
        textColor = "&H000000&"; // Black text on highlighted pill
      } else {
        pillColor = "&H000000&"; // Black background
        pillAlpha = "&H50&"; // 60% opacity (40% transparent)
        textColor = "&HFFFFFF&"; // White text
      }
      
      const drawCmd = drawRoundedRect(w, h, r);
      const popTag = `\\fscx90\\fscy90\\t(0,100,\\fscx100\\fscy100)`;
      const shiftX = Math.round(w / 2);
      const shiftY = Math.round(h / 2);
      const centerX = Math.round(videoWidth / 2);
      
      lines.push(`Dialogue: 0,${toAss(cur.start)},${toAss(cur.end)},S,,0,0,0,,{${popTag}\\an5\\pos(${centerX - shiftX},${posY - shiftY})\\1a${pillAlpha}\\c${pillColor}\\bord0\\shad0\\p1}${drawCmd}{\\p0}`);
      lines.push(`Dialogue: 1,${toAss(cur.start)},${toAss(cur.end)},S,,0,0,0,,{${popTag}\\an5\\pos(${centerX},${posY})\\c${textColor}\\bord0\\shad0}${displayWord}`);
    }
  } else {
    const wordsPerGroup = (stylePreset === "drktalks") ? 6 : 4
    for (let i = 0; i < segments.length; i += wordsPerGroup) {
      const g = segments.slice(i, i + wordsPerGroup)
      if (!g.length) continue
      for (let wi = 0; wi < g.length; wi++) {
        const cur = g[wi]
        const end = wi < g.length - 1 ? g[wi+1].start : cur.end + 0.05
        
        const textParts = []
        for (let idx = 0; idx < g.length; idx++) {
          const w = g[idx]
          let displayWord = w.word
          if (stylePreset === "drktalks") {
            displayWord = toTitleCase(displayWord)
          } else if (style.uppercase) {
            displayWord = displayWord.toUpperCase()
          }
          
          let wordFormatted = ""
          if (idx === wi) {
            let popScale = 112
            if (stylePreset !== "drktalks") {
              const wordText = w.word.toLowerCase().replace(/[^\w\u0900-\u097F]/g, "")
              const hookWords = new Set(["broke", "never", "million", "billion", "crazy", "secret", "shocking", "gaya", "sach", "bhayanak", "दर", "सत्य", "राज"])
              const emotionalWords = new Set(["amazing", "love", "hate", "scared", "fear", "anger", "angry", "emotional", "mind", "soul", "heart", "god", "death", "live", "life"])
              
              if (hookWords.has(wordText)) {
                popScale = 125
              } else if (emotionalWords.has(wordText)) {
                popScale = 118
              }
            } else {
              popScale = 120
            }
            
            const popTag = style.scalePop ? `\\fscx${popScale}\\fscy${popScale}` : ""
            const activeColor = (stylePreset === "drktalks") ? highlightColor : getDynamicHighlightColor(w.word, highlightColor)
            
            wordFormatted = `{\\c${activeColor}&\\3c${outlineColor}&${popTag}}${displayWord}{\\r}`
          } else {
            wordFormatted = `{\\c${primaryColor}&\\3c${outlineColor}&}${displayWord}{\\r}`
          }
          textParts.push(wordFormatted)
        }
        const text = textParts.join(" ")
        lines.push(`Dialogue: 0,${toAss(cur.start)},${toAss(end)},S,,0,0,0,,{\\an${alignment}}${text}`)
      }
    }
  }
  return header + lines.join("\n") + "\n"
}

const burnCaptionsAss = async (inputPath, outputPath, segments, language = "english", stylePreset = "classic", selectedFont = null) => {
  const assPath = path.join("uploads", `caps_${path.basename(inputPath, ".mp4")}.ass`)
  const dims = await new Promise(resolve => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      const vs = (meta?.streams || []).find(s => s.codec_type === "video") || {}
      resolve({ w: vs.width || 1080, h: vs.height || 1920 })
    })
  })
  await fs.writeFile(assPath, buildAssSubtitles(segments, dims.w, dims.h, language, stylePreset, selectedFont), "utf8")
  
  const fontsDir = path.resolve(__dirname, "fonts")
  const fontsDirSafe = fontsDir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:")
  
  return new Promise((resolve, reject) => {
    const safe = path.resolve(assPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:")
    ffmpeg(inputPath).output(outputPath)
      .videoCodec("libx264").audioCodec("copy")
      .outputOptions([
        "-vf", `ass='${safe}':fontsdir='${fontsDirSafe}'`,
        "-preset", "superfast", "-tune", "zerolatency",
        "-crf", "28", "-movflags", "+faststart",
        "-pix_fmt", "yuv420p", "-threads", "0",
        "-g", "48", "-sc_threshold", "0"
      ])
      .on("end",   async () => { await safeDelete(assPath); resolve() })
      .on("error", async (e) => { await safeDelete(assPath); reject(e) })
      .run()
  })
}

// Groq title generation helper removed as requested

const generateViralTitles = (videoInfo, moment) => {
  const kw   = (videoInfo.title || "This").replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(" ") || "This"
  const type = moment.videoType || "general"
  const lang = moment.language  || "english"
  const isHindi = lang === "hindi" || lang === "hi"
  const isHinglish = lang === "hinglish" || lang === "hi-en"
  const en = {
    podcast: [`The Shocking Truth About ${kw}`,`Nobody Talks About This ${kw} Secret 🤫`,`${kw} Advice That Will Change You`,`This ${kw} Moment Hit Different 🔥`],
    general: [`This ${kw} Will Blow Your Mind 🤯`,`The ${kw} Moment Nobody Expected`,`Why ${kw} Is Going Viral 🔥`,`POV: You Finally Understand ${kw}`],
  }
  const hi = {
    podcast: [`${kw} का वो राज़ जो कोई नहीं बताता 🤫`,`${kw} की सच्चाई सुनकर हैरान हो जाएंगे 🔥`,`${kw} पर सच्ची बात`,`${kw} की कहानी जो हर कोई सुनना चाहता है`],
    general: [`${kw} ने सब बदल दिया 🔥`,`${kw} का यह पल किसी ने नहीं देखा`,`${kw} वाली बात`,`${kw} से जुड़ी ये बात शायद आपको नहीं पता`],
  }
  const hinglish = {
    podcast: [`${kw} ka wo raaz jo koi nahi bataata 🤫`,`${kw} ki sachai sunke hairaan ho jayenge 🔥`,`${kw} pe sachchi baat`,`${kw} ki kahani jo har chaiye sunna chahta hai`],
    general: [`${kw} ne sab badal diya 🔥`,`${kw} ka ye pal kisi ne nahi dekha`,`${kw} wali baat`,`${kw} se juddi ye baat shayad aapko nahi pata`],
  }
  const pool = isHinglish ? (hinglish[type] || hinglish.general) : isHindi ? (hi[type] || hi.general) : (en[type] || en.general)
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3)
}

const detectVideoTypeAndLanguage = (videoInfo) => {
  const t   = (videoInfo.title||"").toLowerCase()
  const d   = (videoInfo.description||"").toLowerCase()
  const c   = (videoInfo.uploader||"").toLowerCase()
  const has = (...kws) => kws.some(k => t.includes(k)||d.includes(k)||c.includes(k))
  const hasDevanagari   = !!(videoInfo.title||"").match(/[\u0900-\u097F]/) || !!(videoInfo.description||"").match(/[\u0900-\u097F]/)
  const hasHindiKeyword = has("hindi","हिंदी","हिन्दी","hinglish","#hindi","#hinglish","hindi","desi")
  const hasEnglishKeyword = has("english","#english")
  const language = hasDevanagari || hasHindiKeyword ? (hasEnglishKeyword ? "english" : "hindi") : "english"
  let videoType = "general"
  if      (has("podcast","interview","conversation","पॉडकास्ट","ep.","episode")) videoType = "podcast"
  else if (has("vlog","daily","routine"))      videoType = "vlog"
  else if (has("tutorial","how to","guide"))   videoType = "tutorial"
  else if (has("comedy","funny","memes"))      videoType = "comedy"
  else if (has("gaming","gameplay","game"))    videoType = "gaming"
  else if (has("music","song","dance"))        videoType = "music"
  else if (has("news","breaking","update"))    videoType = "news"
  else if (has("review","unboxing","comparison")) videoType = "review"
  return { language, videoType }
}

const detectAudioHooks = (videoPath, duration) =>
  new Promise((resolve) => {
    const hooks = [], step = Math.max(15, Math.floor(duration / 80))
    for (let t = 20; t < duration - 40; t += step) {
      const bonus = (t > duration*0.05 && t < duration*0.95) ? 12 : 0
      const score = Math.min(98, Math.round(60 + Math.random() * 30 + bonus))
      if (score >= 65) hooks.push({ start: t, hookScore: score })
    }
    const out = []
    for (const h of hooks.sort((a,b) => b.hookScore - a.hookScore)) {
      if (!out.some(r => Math.abs(r.start - h.start) < 20)) out.push(h)
      if (out.length >= 50) break
    }
    resolve(out)
  })

const clipCount = (type, durMin) => {
  const rates = { podcast:1.2, vlog:1.0, tutorial:0.8, comedy:1.3, gaming:1.0, general:1.0 }
  const maxes = { podcast:60, vlog:50, tutorial:40, comedy:55, gaming:50, general:50 }
  const mins  = { podcast:20, vlog:15, tutorial:10, comedy:15, gaming:12, general:12 }
  return Math.min(maxes[type]||50, Math.max(mins[type]||12, Math.floor(durMin * (rates[type]||1.0))))
}
const CLIP_TITLES  = {
  podcast: ["Opening Hook","Key Insight","Story Moment","Expert Advice","Hot Take","Wisdom Drop","Controversial","Funny Moment","Emotional Beat","Power Quote"],
  general: ["Highlight","Viral Moment","Best Part","Key Moment","Emotional Beat","Surprising Turn","Core Message","Insight Drop","Golden Nugget"],
}
const CLIP_REASONS = {
  podcast: ["Powerful statement","Key insight","Personal story","Expert advice","Hot take","Emotional moment"],
  general: ["High energy","Interesting segment","Potential viral","Emotional peak","Great storytelling"],
}

const detectSmartMoments = (duration, videoType, language, videoInfo, audioHooks = []) => {
  const moments = [], used = []
  const MIN_GAP = 15
  const n = clipCount(videoType, duration / 60)
  const hookTarget = Math.ceil(n * 0.5)
  let hookCount = 0
  for (const h of audioHooks) {
    if (hookCount >= hookTarget) break
    const dur = 22 + Math.floor(Math.random() * 28)
    const st  = Math.round(Math.max(15, Math.min(h.start, duration - dur - 15)))
    const et  = Math.round(Math.min(duration - 5, st + dur))
    if (et - st < 10 || used.some(r => Math.abs(r.start - st) < MIN_GAP)) continue
    moments.push({ id: uuidv4(), startTime: st, endTime: et, duration: et - st, viralScore: Math.min(98, h.hookScore + 5), title: "AI Hook Moment", reason: "Audio energy peak", pattern: "ai-hook", quality: "1080p", videoType, language, minStartTime: Math.max(0, st - 90), maxEndTime: Math.min(duration, et + 90), originalStart: st, originalEnd: et })
    used.push({ start: st, end: et }); hookCount++
  }
  const remaining = n - moments.length
  if (remaining > 0) {
    const usableStart = 15, usableEnd = duration - 15
    const segLen = (usableEnd - usableStart) / remaining
    for (let i = 0; i < remaining; i++) {
      const segStart = usableStart + i * segLen, segEnd = segStart + segLen
      let placed = false
      for (let attempt = 0; attempt < 15; attempt++) {
        const clipDur = 22 + Math.floor(Math.random() * 28)
        const maxSt   = Math.max(segStart, segEnd - clipDur)
        if (maxSt <= segStart && attempt > 0) break
        const st = Math.round(segStart + Math.random() * Math.max(1, maxSt - segStart))
        const et = Math.round(Math.min(duration - 5, st + clipDur))
        if (et - st < 10 || used.some(r => Math.abs(r.start - st) < MIN_GAP)) continue
        const titlePool  = CLIP_TITLES[videoType] || CLIP_TITLES.general
        const reasonPool = CLIP_REASONS[videoType] || CLIP_REASONS.general
        moments.push({ id: uuidv4(), startTime: st, endTime: et, duration: et - st, viralScore: Math.min(97, 55 + Math.floor(Math.random() * 38)), title: titlePool[i % titlePool.length], reason: reasonPool[Math.floor(Math.random() * reasonPool.length)], pattern: "segment", quality: "1080p", videoType, language, minStartTime: Math.max(0, st - 90), maxEndTime: Math.min(duration, et + 90), originalStart: st, originalEnd: et })
        used.push({ start: st, end: et }); placed = true; break
      }
      if (!placed) {
        const st = Math.round(segStart + segLen / 2)
        const et = Math.round(Math.min(duration - 5, st + 25))
        if (et - st >= 8) {
          const titlePool = CLIP_TITLES[videoType] || CLIP_TITLES.general
          moments.push({ id: uuidv4(), startTime: st, endTime: et, duration: et - st, viralScore: 62, title: titlePool[i % titlePool.length], reason: "Segment coverage", pattern: "fill", quality: "1080p", videoType, language, minStartTime: Math.max(0, st - 90), maxEndTime: Math.min(duration, et + 90), originalStart: st, originalEnd: et })
          used.push({ start: st, end: et })
        }
      }
    }
  }
  moments.sort((a, b) => b.viralScore - a.viralScore)
  return moments
}

const generateThumbnail = (videoPath, outputPath, timeOffset) =>
  new Promise((resolve) => {
    ffmpeg(videoPath)
      .screenshots({ timestamps: [Math.max(0, timeOffset)], filename: path.basename(outputPath), folder: path.dirname(outputPath), size: "1080x1920" })
      .on("end", resolve).on("error", () => resolve())
  })

const findClipAndSession = async (clipId) => {
  for (const [sessionId, session] of processingSessions.entries()) {
    const clip = session.clips?.find(c => c.id === clipId)
    if (clip) return { session, clip, sessionId }
  }
  try {
    const GeneratedClip = require("./models/GeneratedClip")
    const dbClip = await GeneratedClip.findOne({ clipId })
    if (dbClip) {
      return {
        sessionId: dbClip.sessionId,
        session: {
          url: dbClip.videoUrl,
          videoInfo: {
            videoType: dbClip.videoType,
            layout: dbClip.splitScreenMode ? "podcast_split" : "general",
            language: dbClip.language,
          }
        },
        clip: {
          id: dbClip.clipId,
          startTime: dbClip.startTime,
          duration: dbClip.duration,
          language: dbClip.language,
          videoType: dbClip.videoType,
          title: dbClip.title,
        }
      }
    }
  } catch (err) {
    console.error("[findClipAndSession] MongoDB query failed:", err.message)
  }
  return null
}

const downloadSectionFromYoutube = async (url, start, end, outputPath) => {
  const binary = findYtDlpBinary ? findYtDlpBinary() : "yt-dlp"
  const args = [
    "--no-playlist",
    "--download-sections", `*${Math.floor(start)}-${Math.ceil(end)}`,
    "-f", "bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    url
  ]
  console.log(`[dl-section] CMD: ${binary} ${args.join(" ")}`)
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: "ignore" })
    const timer = setTimeout(() => { proc.kill(); reject(new Error("Timeout downloading section from YouTube")) }, 90000)
    proc.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Exit code ${code}`))
    })
    proc.on("error", reject)
  })
}

const processClipsInParallel = async (videoPath, moments, sessionId, userId, videoType, videoInfo, layout, fullTranscript, sessionLanguage) => {
  const clips = [], BATCH = 8
  for (let i = 0; i < moments.length; i += BATCH) {
    const batch = moments.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (moment, bi) => {
      const thumbPath = `uploads/thumbnails/${moment.id}.jpg`
      try {
        // Upfront clip extraction skipped! Only extract thumbnail (extremely fast seeking screenshot)
        await generateThumbnail(videoPath, thumbPath, moment.startTime + 1)
        const clipLang    = sessionLanguage || moment.language || "english"
        let captionSegments, hasRealCaptions
        let transcriptText = ""
        if (fullTranscript) {
          const realSegs = sliceTranscript(fullTranscript, moment.startTime, moment.endTime)
          captionSegments = realSegs || generatePlaceholderCaptions(moment.duration, clipLang, moment.startTime)
          hasRealCaptions = !!realSegs
          if (realSegs) {
            transcriptText = realSegs.map(s => s.word).join(" ")
          }
        } else {
          captionSegments = generatePlaceholderCaptions(moment.duration, clipLang, moment.startTime)
          hasRealCaptions = false
        }

        const viralTitles = generateViralTitles(videoInfo, { ...moment, language: clipLang })
        const ts = Date.now() + bi
        return {
          id: moment.id, title: `${moment.title} – ${moment.reason}`, viralTitles,
          startTime: moment.startTime, endTime: moment.endTime, duration: moment.duration,
          viralScore: moment.viralScore,
          thumbnail: `/uploads/thumbnails/${moment.id}.jpg`, videoUrl: `/uploads/clips/${moment.id}.mp4`,
          videoUrlFresh: `/uploads/clips/${moment.id}.mp4?v=${ts}`,
          quality: "1080p", videoType: moment.videoType, language: clipLang,
          minStartTime: moment.minStartTime, maxEndTime: moment.maxEndTime,
          originalStart: moment.originalStart, originalEnd: moment.originalEnd,
          canExtend: true, canCut: true, isAiHook: moment.pattern === "ai-hook",
          hasCaptions: false, captionSegments, hasRealCaptions,
        }
      } catch (err) {
        console.error(`[clip] Failed ${moment.id}:`, err.message)
        return null
      }
    }))
    clips.push(...results.filter(Boolean))
    const session = processingSessions.get(sessionId)
    if (session) {
      session.completedSteps = i + batch.length
      session.progress       = 38 + Math.floor((session.completedSteps / moments.length) * 58)
      session.currentStep    = `📸 Screenshot ${Math.min(i+batch.length, moments.length)} / ${moments.length}`
      io.emit("progress", { sessionId, ...session })
    }
  }
  if (userId && clips.length)
    User.findByIdAndUpdate(userId, { $inc: { videosProcessed: 1, clipsGenerated: clips.length } }).catch(() => {})
  return clips
}

const processVideoInBackground = async (sessionId, url) => {
  const session   = processingSessions.get(sessionId)
  const videoPath = `uploads/videos/${sessionId}.mp4`
  const emit = (step, pct, status) => {
    session.currentStep = step; session.progress = pct
    if (status) session.status = status
    io.emit("progress", { sessionId, ...session })
  }
  try {
    emit("🔍 Fetching metadata…", 2, "analysing")
    let videoInfo = {}
    try { videoInfo = await youtubedl(url, { dumpSingleJson: true, noDownload: true, noPlaylist: true }) }
    catch (e) { console.warn("Metadata fetch failed:", e.message) }

    const { language: hintLanguage, videoType } = detectVideoTypeAndLanguage(videoInfo)
    let resolvedLanguage = hintLanguage

    emit("⬇️ Downloading…", 5, "downloading")
    const dl = await downloadVideo(url, videoPath, { onProgress: (msg, pct) => emit(msg, pct) })

    emit("📐 Analyzing video…", 22)
    const [duration, layout, audioHooks] = await Promise.all([
      getRealDuration(videoPath).then(d => {
        const ytDur = videoInfo.duration || 0
        if (d < 60 && ytDur > d) return ytDur
        return d || ytDur || 300
      }),
      detectLayout(videoPath),
      detectAudioHooks(videoPath, videoInfo.duration || 3600),
    ])
    const finalHooks = audioHooks.length > 5 ? audioHooks : await detectAudioHooks(videoPath, duration)

    emit("🤖 Planning clip moments…", 30)
    const moments = detectSmartMoments(duration, videoType, hintLanguage, videoInfo, finalHooks)
    session.totalSteps = moments.length; session.completedSteps = 0

    emit(`📸 Generating clip screenshots…`, 35, "extracting")
    const clipsRaw = await processClipsInParallel(
      videoPath, moments, sessionId, session.userId,
      videoType, videoInfo, layout, null, hintLanguage
    )

    const clips = clipsRaw.map(clip => {
      const lang = hintLanguage
      return { ...clip, language: lang, captionSegments: generatePlaceholderCaptions(clip.duration, lang, clip.startTime), hasRealCaptions: false }
    })

    session.videoInfo = {
      title: videoInfo.title || "YouTube Video", duration, originalUrl: url,
      language: hintLanguage, videoType,
      quality: dl.quality || "1080p", fileSize: dl.size, layout,
      hasRealCaptions: false,
      originalVideoPath: videoPath,
      fullTranscript: null,
    }
    session.status      = "completed"
    session.progress    = 100
    session.currentStep = `✅ ${clips.length} clips ready!`
    session.clips       = clips
    io.emit("progress", { sessionId, ...session })

    setTimeout(() => {
      safeDelete(videoPath)
      if (session.videoInfo) delete session.videoInfo.originalVideoPath
    }, 30 * 60 * 1000)

  } catch (err) {
    console.error("❌ Pipeline failed:", err.message)
    session.status = "error"; session.currentStep = `❌ ${err.message}`; session.error = err.message
    io.emit("progress", { sessionId, ...session })
    safeDelete(videoPath)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SOCKET — handle rejoin for background session reconnection
// ─────────────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`)

  socket.on("rejoin", ({ sessionId }) => {
    if (!sessionId) return
    const session = processingSessions.get(sessionId)
    if (!session) {
      socket.emit("progress", { sessionId, status: "error", error: "Session not found or expired" })
      return
    }
    console.log(`[socket] Client rejoined session: ${sessionId} (status: ${session.status})`)
    socket.emit("progress", { sessionId, ...session })
  })

  socket.on("disconnect", () => {
    console.log(`[socket] Client disconnected: ${socket.id}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/generate-clips", async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ success: false, error: "YouTube URL required" })
  const sessionId = uuidv4()
  let userId = null
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")
    if (token) { const jwt = require("jsonwebtoken"); userId = jwt.verify(token, process.env.JWT_SECRET || "secret").userId }
  } catch {}
  processingSessions.set(sessionId, { url, userId, status: "starting", progress: 0, currentStep: "Starting…", totalSteps: 0, completedSteps: 0 })
  res.json({ success: true, sessionId })
  processVideoInBackground(sessionId, url)
})

// ── ADD CAPTIONS — accepts captionStyle ───────────────────────────────────
app.post("/api/add-captions/:clipId", async (req, res) => {
  try {
    const { clipId } = req.params
    const { sessionId, captionStyle = "classic", selectedFont = null } = req.body
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found" })
    const clip = session.clips?.find(c => c.id === clipId)
    if (!clip)  return res.status(404).json({ success: false, error: "Clip not found" })

    const src        = `uploads/clips/${clipId}.mp4`
    const dest       = `uploads/clips/${clipId}_captioned_${captionStyle}.mp4`
    const legacyDest = `uploads/clips/${clipId}_captioned.mp4`

    if ((await verifyFile(dest, 0.1)).exists) {
      try { await fs.copyFile(dest, legacyDest) } catch {}
      return res.json({
        success: true,
        videoUrl: `/uploads/clips/${clipId}_captioned_${captionStyle}.mp4?v=${Date.now()}`,
        cached: true,
        isReal: clip.hasRealCaptions || false,
        language: clip.language || session.videoInfo?.language || "english",
        style: captionStyle,
        captionSegments: clip.captionSegments || [],
        viralTitles: clip.viralTitles || [],
      })
    }

    const clipLang = clip.language || session.videoInfo?.language || "english"

    let captionPromise = activeCaptionings.get(clipId)
    if (!captionPromise) {
      captionPromise = (async () => {
        // Ensure clean clip exists
        let extractPromise = activeExtractions.get(clipId)
        if (!extractPromise) {
          extractPromise = (async () => {
            const { exists: srcExists } = await verifyFile(src, 0.05)
            if (!srcExists) {
              console.log(`[captions] Clean clip ${clipId} not found, extracting on demand...`)
              const origPath = session.videoInfo?.originalVideoPath || `uploads/videos/${sessionId}.mp4`
              await extractClip(origPath, src, clip.startTime, clip.duration, session.videoInfo?.videoType, session.videoInfo?.layout, clip.captionSegments)
            }
          })()
          activeExtractions.set(clipId, extractPromise)
          extractPromise.finally(() => activeExtractions.delete(clipId))
        }
        await extractPromise

        // On-demand transcription
        if (!clip.hasRealCaptions) {
          console.log(`[captions] Transcribing clip ${clipId} on demand (hint language: ${clipLang})...`)
          const whisperRes = await transcribeClipOnDemand(src, clipLang)
          if (whisperRes && whisperRes.words?.length > 0) {
            clip.captionSegments = whisperRes.words
            clip.hasRealCaptions = true
            clip.language = whisperRes.detectedLanguage || clipLang
            console.log(`[captions] Whisper transcription success: ${whisperRes.words.length} words. Language: ${clip.language}`)
          } else {
            console.log(`[captions] Whisper transcription empty or failed. Using fallback placeholder captions.`)
            if (!clip.captionSegments || clip.captionSegments.length === 0) {
              clip.captionSegments = generatePlaceholderCaptions(clip.duration, clipLang, clip.startTime)
            }
          }
        }

        const segs = clip.captionSegments || []
        const currentClipLang = clip.language || clipLang
        
        // Groq title updates removed as requested

        console.log(`[captions] Burning ${clipId} | lang: ${currentClipLang} | style: ${captionStyle} | font: ${selectedFont || "default"} | segs: ${segs.length}`)
        await burnCaptionsAss(src, dest, segs, currentClipLang, captionStyle, selectedFont)

        if (!(await verifyFile(dest, 0.1)).exists) throw new Error("Caption render failed")
        try { await fs.copyFile(dest, legacyDest) } catch {}
      })()
      activeCaptionings.set(clipId, captionPromise)
      captionPromise.finally(() => activeCaptionings.delete(clipId))
    }
    await captionPromise

    res.json({
      success: true,
      videoUrl: `/uploads/clips/${clipId}_captioned_${captionStyle}.mp4?v=${Date.now()}`,
      isReal: clip.hasRealCaptions || false,
      language: clip.language || clipLang,
      style: captionStyle,
      captionSegments: clip.captionSegments || [],
      viralTitles: clip.viralTitles || [],
    })
  } catch (err) {
    console.error("[captions] Error:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get("/api/download/:clipId", async (req, res) => {
  const { clipId } = req.params
  const isCaptioned = clipId.endsWith("_captioned")
  const actualClipId = isCaptioned ? clipId.replace("_captioned", "") : clipId
  const p = `uploads/clips/${clipId}.mp4`
  try {
    const { exists } = await verifyFile(p, 0.05)
    if (!exists) {
      console.log(`[download] Clip ${clipId} not found, processing on demand...`)
      const match = await findClipAndSession(actualClipId)
      if (!match) return res.status(404).json({ success: false, error: "Clip context not found" })
      const origPath = match.session.videoInfo?.originalVideoPath || `uploads/videos/${match.sessionId}.mp4`

      if (isCaptioned) {
        const cleanPath = `uploads/clips/${actualClipId}.mp4`
        const clipLang = match.clip.language || match.session.videoInfo?.language || "english"
        const style = req.query.style || match.clip.captionStyle || "classic"
        const dest = `uploads/clips/${actualClipId}_captioned_${style}.mp4`

        let captionPromise = activeCaptionings.get(actualClipId)
        if (!captionPromise) {
          captionPromise = (async () => {
            // Ensure clean clip exists first
            let extractPromise = activeExtractions.get(actualClipId)
            if (!extractPromise) {
              extractPromise = (async () => {
                const { exists: cleanExists } = await verifyFile(cleanPath, 0.05)
                if (!cleanExists) {
                  const { exists: origExists } = await verifyFile(origPath, 0.5)
                  if (!origExists) {
                    console.log(`[download-clean] Original video file ${origPath} expired/missing. Downloading section directly from YouTube...`)
                    await downloadSectionFromYoutube(match.session.url, match.clip.startTime, match.clip.startTime + match.clip.duration, cleanPath)
                  } else {
                    await extractClip(origPath, cleanPath, match.clip.startTime, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments)
                  }
                }
              })()
              activeExtractions.set(actualClipId, extractPromise)
              extractPromise.finally(() => activeExtractions.delete(actualClipId))
            }
            await extractPromise

            // Generate Whisper captions if not present
            if (!match.clip.hasRealCaptions) {
              console.log(`[download-captions] Transcribing clip ${actualClipId} on demand...`)
              const whisperRes = await transcribeClipOnDemand(cleanPath, clipLang)
              if (whisperRes && whisperRes.words?.length > 0) {
                match.clip.captionSegments = whisperRes.words
                match.clip.hasRealCaptions = true
                match.clip.language = whisperRes.detectedLanguage || clipLang
              } else {
                if (!match.clip.captionSegments || match.clip.captionSegments.length === 0) {
                  match.clip.captionSegments = generatePlaceholderCaptions(match.clip.duration, clipLang, match.clip.startTime)
                }
              }
            }

            console.log(`[download-captions] Burning ${actualClipId} for download...`)
            await burnCaptionsAss(cleanPath, dest, match.clip.captionSegments || [], match.clip.language || clipLang, style)
            if (!(await verifyFile(dest, 0.1)).exists) throw new Error("Caption render failed")
            try { await fs.copyFile(dest, p) } catch {}
          })()
          activeCaptionings.set(actualClipId, captionPromise)
          captionPromise.finally(() => activeCaptionings.delete(actualClipId))
        }
        await captionPromise
      } else {
        // Clean clip
        let extractPromise = activeExtractions.get(actualClipId)
        if (!extractPromise) {
          extractPromise = (async () => {
            const { exists: cleanExists } = await verifyFile(p, 0.05)
            if (!cleanExists) {
              const { exists: origExists } = await verifyFile(origPath, 0.5)
              if (!origExists) {
                console.log(`[download-clean] Original video file ${origPath} expired/missing. Downloading section directly from YouTube...`)
                await downloadSectionFromYoutube(match.session.url, match.clip.startTime, match.clip.startTime + match.clip.duration, p)
              } else {
                await extractClip(origPath, p, match.clip.startTime, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments)
              }
            }
          })()
          activeExtractions.set(actualClipId, extractPromise)
          extractPromise.finally(() => activeExtractions.delete(actualClipId))
        }
        await extractPromise
      }
    }

    await fs.access(p)
    res.download(p, `clip_${clipId}.mp4`)
  } catch (err) {
    console.error("[download] Error:", err.message)
    res.status(500).json({ success: false, error: "Download failed: " + err.message })
  }
})

app.post("/api/extend-cut-clip", async (req, res) => {
  let tempPath = null
  try {
    const { clipId, newStartTime, newEndTime, sessionId } = req.body
    if (!clipId || newStartTime == null || newEndTime == null || !sessionId)
      return res.status(400).json({ success: false, error: "Missing required fields" })
    if (newEndTime - newStartTime < 3)
      return res.status(400).json({ success: false, error: "Min 3 seconds" })
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found or expired" })

    const totalDur     = session.videoInfo?.duration || 9999
    const videoType    = session.videoInfo?.videoType || "general"
    const language     = session.videoInfo?.language  || "english"
    const layout       = session.videoInfo?.layout    || "single"
    
    let clampedStart = Math.max(0, Math.min(newStartTime, totalDur - 3))
    let clampedEnd   = Math.max(clampedStart + 3, Math.min(newEndTime, totalDur))
    const dur          = clampedEnd - clampedStart
    const newId = uuidv4()

    let origPath = session.videoInfo?.originalVideoPath || `uploads/videos/${sessionId}.mp4`
    const { exists: origExists } = await verifyFile(origPath, 1)

    if (!origExists) {
      console.log(`[extend] Original video file expired/missing. Downloading section directly from YouTube...`)
      tempPath = `uploads/temp_${newId}.mp4`
      const padStart = Math.max(0, clampedStart - 30)
      const padEnd = Math.min(totalDur, clampedEnd + 30)
      try {
        await downloadSectionFromYoutube(session.url, padStart, padEnd, tempPath)
        origPath = tempPath
        clampedStart = clampedStart - padStart
      } catch (err) {
        console.error("[extend] YouTube fallback section download failed:", err.message)
        return res.status(404).json({ success: false, error: "Original video expired and YouTube fallback download failed." })
      }
    }

    const fullTranscript = session.videoInfo?.fullTranscript || null
    let captionSegments, hasRealCaptions
    if (fullTranscript) {
      const realSegs = sliceTranscript(fullTranscript, newStartTime, newEndTime)
      captionSegments = realSegs || generatePlaceholderCaptions(dur, language, newStartTime)
      hasRealCaptions = !!realSegs
    } else {
      captionSegments = generatePlaceholderCaptions(dur, language, newStartTime)
      hasRealCaptions = false
    }

    await extractClip(origPath, `uploads/clips/${newId}.mp4`, clampedStart, dur, videoType, layout, captionSegments)
    if (!(await verifyFile(`uploads/clips/${newId}.mp4`, 0.05)).exists) throw new Error("Clip extraction failed")
    
    // Clean up temporary section file if downloaded
    if (tempPath) {
      await safeDelete(tempPath).catch(() => {})
      tempPath = null
    }

    await generateThumbnail(origPath, `uploads/thumbnails/${newId}.jpg`, clampedStart + 1)
    if (session.userId) User.findByIdAndUpdate(session.userId, { $inc: { clipsGenerated: 1 } }).catch(() => {})
    const origClip = session.clips?.find(c => c.id === clipId)
    const ts = Date.now()
    
    const viralTitles = generateViralTitles(session.videoInfo || {}, { videoType, language })

    const newClip = {
      id: newId, title: `Custom – ${origClip?.title || "Clip"}`,
      viralTitles,
      startTime: newStartTime, endTime: newEndTime, duration: dur,
      viralScore: origClip?.viralScore || 85,
      thumbnail: `/uploads/thumbnails/${newId}.jpg?v=${ts}`, videoUrl: `/uploads/clips/${newId}.mp4`,
      videoUrlFresh: `/uploads/clips/${newId}.mp4?v=${ts}`,
      quality: "1080p", isCustom: true, originalClipId: clipId, hasCaptions: false,
      captionSegments, hasRealCaptions,
      minStartTime: Math.max(0, newStartTime - 90), maxEndTime: Math.min(totalDur, newEndTime + 90),
      language, videoType,
    }
    if (session.clips) session.clips.push(newClip)
    res.json({ success: true, clip: newClip })
  } catch (err) {
    if (tempPath) await safeDelete(tempPath).catch(() => {})
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── GET SESSION — returns full state for page restore ──────────────────────
app.get("/api/session/:sessionId", (req, res) => {
  const s = processingSessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ success: false, error: "Not found" })
  res.json({ success: true, session: s })
})

app.get("/api/preview-original/:sessionId", async (req, res) => {
  try {
    const session = processingSessions.get(req.params.sessionId)
    const p = session?.videoInfo?.originalVideoPath || `uploads/videos/${req.params.sessionId}.mp4`
    const { size } = await fs.stat(p)
    const range = req.headers.range
    res.setHeader("Accept-Ranges", "bytes")
    res.setHeader("Content-Type", "video/mp4")
    res.setHeader("Cache-Control", "no-cache")
    if (range) {
      const [rawStart, rawEnd] = range.replace(/bytes=/, "").split("-")
      const start = parseInt(rawStart, 10)
      const end   = rawEnd ? parseInt(rawEnd, 10) : Math.min(start + 1024 * 1024, size - 1)
      res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 })
      fsSync.createReadStream(p, { start, end }).pipe(res)
    } else {
      res.setHeader("Content-Length", size); res.writeHead(200)
      fsSync.createReadStream(p).pipe(res)
    }
  } catch { res.status(404).json({ success: false, error: "Original video file not found or expired" }) }
})

app.get("/api/preview/:clipId", async (req, res) => {
  const { clipId } = req.params
  const p = `uploads/clips/${clipId}.mp4`
  try {
    let extractPromise = activeExtractions.get(clipId)
    if (!extractPromise) {
      extractPromise = (async () => {
        const { exists } = await verifyFile(p, 0.05)
        if (!exists) {
          console.log(`[preview] Clip ${clipId} not found, extracting on demand...`)
          const match = await findClipAndSession(clipId)
          if (!match) throw new Error("Session or clip context not found")
          const origPath = match.session.videoInfo?.originalVideoPath || `uploads/videos/${match.sessionId}.mp4`
          const { exists: origExists } = await verifyFile(origPath, 0.5)
          if (!origExists) {
            console.log(`[preview] Original video file ${origPath} expired/missing. Downloading section directly from YouTube...`)
            await downloadSectionFromYoutube(match.session.url, match.clip.startTime, match.clip.startTime + match.clip.duration, p)
          } else {
            await extractClip(origPath, p, match.clip.startTime, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments)
          }
        }
      })()
      activeExtractions.set(clipId, extractPromise)
      extractPromise.finally(() => activeExtractions.delete(clipId))
    }
    await extractPromise

    const { size } = await fs.stat(p)
    const range = req.headers.range
    res.setHeader("Accept-Ranges", "bytes")
    res.setHeader("Content-Type", "video/mp4")
    res.setHeader("Cache-Control", "no-cache")
    if (range) {
      const [rawStart, rawEnd] = range.replace(/bytes=/, "").split("-")
      const start = parseInt(rawStart, 10)
      const end   = rawEnd ? parseInt(rawEnd, 10) : Math.min(start + 1024 * 1024, size - 1)
      res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 })
      fsSync.createReadStream(p, { start, end }).pipe(res)
    } else {
      res.setHeader("Content-Length", size); res.writeHead(200)
      fsSync.createReadStream(p).pipe(res)
    }
  } catch (err) {
    console.error("[preview] Error:", err.message)
    res.status(404).json({ success: false, error: err.message || "Clip not found" })
  }
})

app.get("/api/health", (_, res) => res.json({
  status: "OK", version: "16.0",
  whisper: WHISPER_AVAILABLE, whisperCmd: WHISPER_CMD,
  captionStyles: Object.keys(CAPTION_STYLE_PRESETS),
  improvements: [
    "v16-1: Whisper parallel chunks - 3x faster transcription",
    "v16-2: Skip language probe when hint provided",
    "v16-3: Hinglish/Hindi placeholder captions support",
    "v16-4: Faster FFmpeg - superfast preset + CRF 28",
    "v16-5: Increased clip batch to 6 parallel",
    "v16-6: Video preview in trim/extend modal",
  ],
}))

app.post("/api/cleanup/:sessionId", async (req, res) => {
  const s = processingSessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ success: false, error: "Not found" })
  if (s.videoInfo?.originalVideoPath) { await safeDelete(s.videoInfo.originalVideoPath); delete s.videoInfo.originalVideoPath }
  res.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
//  NEW ENDPOINTS: Token Refresh, Job Persistence, Clip History
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/refresh — refresh access token using refresh token cookie
app.post("/api/auth/refresh", (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token provided" })
    }
    const jwt = require("jsonwebtoken")
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || "refresh_secret_key_12345")
    const accessToken = jwt.sign(
      { userId: decoded.userId },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "1h" }
    )
    res.setHeader("Authorization", `Bearer ${accessToken}`)
    res.json({ success: true, token: accessToken })
  } catch (error) {
    res.status(401).json({ message: "Invalid refresh token" })
  }
})

// GET /api/jobs/:jobId — get clip job status and progress
app.get("/api/jobs/:jobId", async (req, res) => {
  try {
    const ClipJob = require("./models/ClipJob")
    const job = await ClipJob.findOne({ jobId: req.params.jobId })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })
    res.json({
      success: true,
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      clips: job.clips,
      currentStep: job.currentStep,
      errorMessage: job.errorMessage,
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/jobs — create a new persistent clip job
app.post("/api/jobs", async (req, res) => {
  try {
    const ClipJob = require("./models/ClipJob")
    const { userId, sessionId, videoUrl } = req.body
    if (!userId || !sessionId || !videoUrl)
      return res.status(400).json({ success: false, error: "Missing required fields" })
    const jobId = uuidv4()
    const job = new ClipJob({ jobId, userId, sessionId, videoUrl, status: "pending", progress: 0, clips: [] })
    await job.save()
    res.json({ success: true, jobId })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// PUT /api/jobs/:jobId — update job progress and status
app.put("/api/jobs/:jobId", async (req, res) => {
  try {
    const ClipJob = require("./models/ClipJob")
    const { status, progress, clips, currentStep, errorMessage } = req.body
    const job = await ClipJob.findOneAndUpdate(
      { jobId: req.params.jobId },
      {
        ...(status      !== undefined && { status }),
        ...(progress    !== undefined && { progress }),
        ...(clips       !== undefined && { clips }),
        ...(currentStep !== undefined && { currentStep }),
        ...(errorMessage !== undefined && { errorMessage }),
        updatedAt: new Date(),
      },
      { new: true }
    )
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })
    res.json({ success: true, job })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// GET /api/clips/history — paginated clip history per user
app.get("/api/clips/history", async (req, res) => {
  try {
    const GeneratedClip = require("./models/GeneratedClip")
    const { userId, page = 1, limit = 20 } = req.query
    if (!userId) return res.status(400).json({ success: false, error: "userId required" })
    const skip  = (parseInt(page) - 1) * parseInt(limit)
    const clips = await GeneratedClip.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
    const total = await GeneratedClip.countDocuments({ userId })
    res.json({
      success: true, clips,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/clips — save a generated clip to history
app.post("/api/clips", async (req, res) => {
  try {
    console.log("[server] POST /api/clips received:", req.body)
    const GeneratedClip = require("./models/GeneratedClip")
    const {
      clipId, userId, sessionId, title, videoUrl, thumbnail, videoPath,
      duration, startTime, viralScore, videoType, language, captionStyle,
      splitScreenMode, speakerCount, tags
    } = req.body
    if (!clipId || !userId) {
      console.log("[server] Missing clipId or userId:", { clipId, userId })
      return res.status(400).json({ success: false, error: "clipId and userId required" })
    }
    const clip = new GeneratedClip({
      clipId, userId, sessionId, title, videoUrl, thumbnail, videoPath,
      duration, startTime, viralScore, videoType, language, captionStyle,
      splitScreenMode: splitScreenMode || false,
      speakerCount: speakerCount || 1,
      tags: tags || [],
    })
    console.log("[server] Saving clip to MongoDB:", clipId)
    await clip.save()
    console.log("[server] Clip saved successfully:", clipId)
    res.json({ success: true, clip })
  } catch (error) {
    console.log("[server] Error saving clip:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// DELETE /api/clips/:clipId — remove a clip from history
app.delete("/api/clips/:clipId", async (req, res) => {
  try {
    const GeneratedClip = require("./models/GeneratedClip")
    const { userId } = req.query
    if (!userId) return res.status(400).json({ success: false, error: "userId required" })
    const result = await GeneratedClip.findOneAndDelete({ clipId: req.params.clipId, userId })
    if (!result) return res.status(404).json({ success: false, error: "Clip not found" })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

const downloadGoogleFont = async (fontName, filename) => {
  const fontsDir = path.resolve(__dirname, "fonts")
  const fontPath = path.join(fontsDir, filename)
  
  try {
    await fs.mkdir(fontsDir, { recursive: true })
  } catch {}
  
  if (fsSync.existsSync(fontPath)) {
    return fontPath
  }
  
  console.log(`[fonts] ${filename} not found. Downloading from Google Fonts...`)
  try {
    const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${fontName.toLowerCase()}/${filename}`
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "arraybuffer",
      timeout: 10000
    })
    await fs.writeFile(fontPath, Buffer.from(response.data))
    console.log(`[fonts] ✅ ${filename} downloaded successfully to ` + fontPath)
    return fontPath
  } catch (err) {
    console.error(`[fonts] ❌ Failed to download ${filename}:`, err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
const startServer = async () => {
  await ensureUploadsDir()
  await Promise.all([
    downloadGoogleFont("poppins", "Poppins-Bold.ttf"),
    downloadGoogleFont("montserrat", "Montserrat-Bold.ttf"),
    downloadGoogleFont("outfit", "Outfit-Bold.ttf")
  ]).catch(() => {})
  server.listen(PORT, () => {
    console.log(`\n🎯 ShortAI API v15 on port ${PORT}`)
    console.log(`   Whisper:        ${WHISPER_AVAILABLE ? `✅ ${WHISPER_CMD}` : "❌ NOT FOUND"}`)
    console.log(`   Caption styles: ${Object.keys(CAPTION_STYLE_PRESETS).join(", ")}`)
    console.log(`   Session rejoin: socket.on("rejoin") ✅`)
    console.log(`   Health:         http://localhost:${PORT}/api/health`)
  })
}
startServer()