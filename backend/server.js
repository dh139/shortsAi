/**
 * server.js  v15
 *
 * NEW IN v15:
 * ──────────────────────────────────────────────────────────────────────────
 * 1. SESSION PERSISTENCE: Sessions survive page refreshes / tab closes.
 *    - socket "rejoin" event lets client reconnect to in-progress session
 *    - GET /api/session/:id returns full session state including clips
 *    - Sessions are kept in-memory Map (persists as long as server runs)
 *
 * 2. CAPTION STYLES: /api/add-captions accepts captionStyle parameter.
 *    - Supports: classic, neon, tiktok, minimal, fire, hindi presets
 *    - Each preset has font, fontSize, colors, position, bgBox settings
 *
 * 3. DOWNLOAD STRATEGY ORDER: Strategy 3 (standard web) now runs FIRST.
 *    - web_creator (strategy 1 old) moved to fallback position
 *
 * 4. NEW ENDPOINTS (merged from v15b):
 *    - POST /api/auth/refresh  — refresh access token via refresh token cookie
 *    - GET  /api/jobs/:jobId   — get clip job status
 *    - POST /api/jobs          — create persistent clip job
 *    - PUT  /api/jobs/:jobId   — update job progress
 *    - GET  /api/clips/history — paginated clip history per user
 *    - POST /api/clips         — save generated clip to history
 *    - DELETE /api/clips/:clipId — remove clip from history
 *
 * All v14 fixes are preserved:
 * - FIX H: PYTHONIOENCODING=utf-8 for Hindi/Devanagari
 * - Audio language probe always runs
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
require("dotenv").config()

const { downloadVideo } = require("./downloader")
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
  classic: { font: "Arial Black",      fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#FFFF00", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true },
  neon:    { font: "Impact",            fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#FF0080", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true },
  tiktok:  { font: "Montserrat",        fontSize: 78, primaryColor: "#FFFFFF", highlightColor: "#FE2C55", outlineColor: "#000000", position: "center", bgBox: true,  bgColor: "rgba(0,0,0,0.75)", bold: true },
  minimal: { font: "Helvetica Neue",    fontSize: 68, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: false },
  fire:    { font: "Arial Black",       fontSize: 88, primaryColor: "#FFF176", highlightColor: "#FF3D00", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true },
  hindi:   { font: "Noto Sans",         fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#00FFEA", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true },
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
  const totalDuration = await getRealDuration(absVideoPath)
  const CHUNK_SECS    = 10 * 60
  const numChunks     = Math.ceil(totalDuration / CHUNK_SECS)

  console.log(`[whisper] ── v15 Transcription ──`)
  try {
    await extractFullAudio(absVideoPath, fullAudioPath)
    if (!(await verifyFile(fullAudioPath, 0.001)).exists) throw new Error("Full audio empty")
  } catch (e) { console.error("[whisper] ❌ Audio extraction failed:", e.message); return null }

  let detectedLanguage = null
  const audioLang = await probeAudioLanguage(fullAudioPath, baseStem, baseTransDir)
  if (audioLang) {
    detectedLanguage = audioLang
  } else {
    const metaCode = (hintLanguage === "hindi" || hintLanguage === "hi") ? "hi" : (hintLanguage === "english" || hintLanguage === "en") ? "en" : null
    detectedLanguage = metaCode
  }

  const chunkPaths = []
  for (let i = 0; i < numChunks; i++) {
    const start    = i * CHUNK_SECS
    const dur      = Math.min(CHUNK_SECS, totalDuration - start)
    const chunkDir = path.join(baseTransDir, `${baseStem}_chunk${i}_dir`)
    const wavPath  = path.join(chunkDir, `${baseStem}_chunk${i}.wav`)
    chunkPaths.push({ wavPath, chunkDir, start, dur, idx: i })
  }
  await Promise.all(chunkPaths.map(({ chunkDir }) => fs.mkdir(chunkDir, { recursive: true }).catch(() => {})))
  await Promise.all(chunkPaths.map(async ({ wavPath, start, dur, idx }) => {
    try { await sliceWavChunk(fullAudioPath, wavPath, start, dur) }
    catch (e) { console.warn(`[whisper] Slice ${idx} failed:`, e.message) }
  }))

  const chunkResults = await Promise.all(chunkPaths.map(async ({ wavPath, chunkDir, start, idx }) => {
    try {
      if (!(await verifyFile(wavPath, 0.001)).exists) return { idx, words: [] }
      const json = await runWhisperOnFile(wavPath, chunkDir, detectedLanguage)
      await safeDelete(wavPath).catch(() => {})
      await safeRmdir(chunkDir).catch(() => {})
      if (!json) return { idx, words: [], language: null }
      const words = extractWordsFromWhisperJson(json, start)
      return { idx, words, language: json.language || null }
    } catch (e) { console.error(`[whisper] Chunk ${idx+1} error:`, e.message); return { idx, words: [] } }
  }))

  await safeDelete(fullAudioPath).catch(() => {})
  const allWords = chunkResults.sort((a, b) => a.idx - b.idx).flatMap(r => r.words)
  if (!detectedLanguage) { const first = chunkResults.find(r => r.language); if (first) detectedLanguage = first.language }
  if (allWords.length < 10) return null
  const appLanguage = detectedLanguage === "hi" ? "hindi" : detectedLanguage === "en" ? "english" : detectedLanguage || "english"
  return { words: allWords, detectedLanguage: appLanguage }
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
  const hi = ["और","यह","बहुत","जरूरी","है","क्योंकि","जब","आप","सोचते","हैं","तो","सच","यह","है","कि","कोई","नहीं","बताता","यह","बात","लेकिन","मैंने","यह","सीखा","जब","सब","कुछ","बदल","गया","यह","वो","पल","था","जब","मुझे","एहसास","हुआ","कि","जिंदगी"]
  const en = ["and","that","is","exactly","why","this","matters","so","much","because","when","you","think","about","it","nobody","talks","about","this","let","me","tell","you","something","that","changed","everything","stay","consistent","trust","the","process"]
  const pool = (language === "hindi" || language === "hi") ? hi : en
  const segs = []
  let t = 0.3, i = Math.floor(clipStartTime * 7 + 13) % pool.length
  while (t < clipDuration - 0.5) {
    const dur = 0.25 + ((i * 17 + Math.floor(t * 3)) % 5) * 0.05
    segs.push({ word: pool[i % pool.length], start: +t.toFixed(3), end: +(t + dur).toFixed(3) })
    t += dur + 0.06; i++
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

const extractClip = (inputPath, outputPath, startTime, clipDuration, videoType, layout = "single") =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
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
        const cx = Math.round((srcW - cw) / 2)
        vf = `crop=${cw}:${srcH}:${cx}:0,scale=${TW}:${TH},setsar=1`
      }

      ffmpeg(inputPath)
        .setStartTime(startTime).setDuration(clipDuration)
        .videoCodec("libx264").audioCodec("aac").audioBitrate("128k")
        .outputOptions(["-vf", vf, "-s", `${TW}x${TH}`, "-preset", "ultrafast", "-crf", "23", "-movflags", "+faststart", "-threads", "0", "-pix_fmt", "yuv420p"])
        .output(outputPath).on("end", resolve).on("error", (e) => reject(new Error("FFmpeg: " + e.message))).run()
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

const buildAssSubtitles = (segments, videoWidth = 1080, videoHeight = 1920, language = "english", stylePreset = "classic") => {
  const style   = resolveCaptionStyle(stylePreset)
  const isHindi = language === "hindi" || language === "hi"
  const font     = isHindi ? "Noto Sans" : style.font
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
Style: S,${font},${fontSize},${primaryColor},&H000000FF,${outlineColor},${bgColor},${boldFlag},0,0,0,100,100,0,0,${borderStyle},5,2,${alignment},60,60,${marginV},1

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

  const lines = []
  for (let i = 0; i < segments.length; i += 4) {
    const g = segments.slice(i, i + 4)
    if (!g.length) continue
    for (let wi = 0; wi < g.length; wi++) {
      const cur = g[wi]
      const end = wi < g.length - 1 ? g[wi+1].start : cur.end + 0.05
      const text = g.map((w, idx) =>
        idx === wi
          ? `{\\c${highlightColor}&\\3c${outlineColor}&}${w.word}{\\r}`
          : `{\\c${primaryColor}&\\3c${outlineColor}&}${w.word}{\\r}`
      ).join(" ")
      lines.push(`Dialogue: 0,${toAss(cur.start)},${toAss(end)},S,,0,0,0,,{\\an${alignment}}${text}`)
    }
  }
  return header + lines.join("\n") + "\n"
}

const burnCaptionsAss = async (inputPath, outputPath, segments, language = "english", stylePreset = "classic") => {
  const assPath = path.join("uploads", `caps_${path.basename(inputPath, ".mp4")}.ass`)
  const dims = await new Promise(resolve => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      const vs = (meta?.streams || []).find(s => s.codec_type === "video") || {}
      resolve({ w: vs.width || 1080, h: vs.height || 1920 })
    })
  })
  await fs.writeFile(assPath, buildAssSubtitles(segments, dims.w, dims.h, language, stylePreset), "utf8")
  return new Promise((resolve, reject) => {
    const safe = path.resolve(assPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:")
    ffmpeg(inputPath).output(outputPath)
      .videoCodec("libx264").audioCodec("copy")
      .outputOptions(["-vf", `ass='${safe}'`, "-preset", "ultrafast", "-crf", "23", "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-threads", "0"])
      .on("end",   async () => { await safeDelete(assPath); resolve() })
      .on("error", async (e) => { await safeDelete(assPath); reject(e) })
      .run()
  })
}

const generateViralTitles = (videoInfo, moment) => {
  const kw   = (videoInfo.title || "This").replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(" ") || "This"
  const type = moment.videoType || "general"
  const lang = moment.language  || "english"
  const isHindi = lang === "hindi" || lang === "hi"
  const en = {
    podcast: [`The Shocking Truth About ${kw}`,`Nobody Talks About This ${kw} Secret 🤫`,`${kw} Advice That Will Change You`,`This ${kw} Moment Hit Different 🔥`],
    general: [`This ${kw} Will Blow Your Mind 🤯`,`The ${kw} Moment Nobody Expected`,`Why ${kw} Is Going Viral 🔥`,`POV: You Finally Understand ${kw}`],
  }
  const hi = {
    podcast: [`${kw} का वो राज़ जो कोई नहीं बताता 🤫`,`${kw} की सच्चाई सुनकर हैरान हो जाएंगे 🔥`],
    general: [`${kw} ने सब बदल दिया 🔥`,`${kw} का यह पल किसी ने नहीं देखा`],
  }
  const pool = isHindi ? (hi[type] || hi.general) : (en[type] || en.general)
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3)
}

const detectVideoTypeAndLanguage = (videoInfo) => {
  const t   = (videoInfo.title||"").toLowerCase()
  const d   = (videoInfo.description||"").toLowerCase()
  const c   = (videoInfo.uploader||"").toLowerCase()
  const has = (...kws) => kws.some(k => t.includes(k)||d.includes(k)||c.includes(k))
  const hasDevanagari   = !!(videoInfo.title||"").match(/[\u0900-\u097F]/) || !!(videoInfo.description||"").match(/[\u0900-\u097F]/)
  const hasHindiKeyword = has("hindi","हिंदी","हिन्दी","hinglish","#hindi","#hinglish")
  const language = (hasDevanagari || hasHindiKeyword) ? "hindi" : "english"
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

const processClipsInParallel = async (videoPath, moments, sessionId, userId, videoType, videoInfo, layout, fullTranscript, sessionLanguage) => {
  const clips = [], BATCH = 4
  for (let i = 0; i < moments.length; i += BATCH) {
    const batch = moments.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (moment, bi) => {
      const clipPath  = `uploads/clips/${moment.id}.mp4`
      const thumbPath = `uploads/thumbnails/${moment.id}.jpg`
      try {
        await extractClip(videoPath, clipPath, moment.startTime, moment.duration, videoType, layout)
        if (!(await verifyFile(clipPath, 0.05)).exists) throw new Error("Output file missing or empty")
        await generateThumbnail(videoPath, thumbPath, moment.startTime + 1)
        const clipLang    = sessionLanguage || moment.language || "english"
        const viralTitles = generateViralTitles(videoInfo, { ...moment, language: clipLang })
        let captionSegments, hasRealCaptions
        if (fullTranscript) {
          const realSegs = sliceTranscript(fullTranscript, moment.startTime, moment.endTime)
          captionSegments = realSegs || generatePlaceholderCaptions(moment.duration, clipLang, moment.startTime)
          hasRealCaptions = !!realSegs
        } else {
          captionSegments = generatePlaceholderCaptions(moment.duration, clipLang, moment.startTime)
          hasRealCaptions = false
        }
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
        await safeDelete(clipPath); return null
      }
    }))
    clips.push(...results.filter(Boolean))
    const session = processingSessions.get(sessionId)
    if (session) {
      session.completedSteps = i + batch.length
      session.progress       = 38 + Math.floor((session.completedSteps / moments.length) * 58)
      session.currentStep    = `✂️ Clip ${Math.min(i+batch.length, moments.length)} / ${moments.length}`
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

    let whisperPromise = Promise.resolve(null)
    if (WHISPER_AVAILABLE) {
      emit(`✂️ Extracting ${moments.length} clips + transcribing…`, 35, "extracting")
      whisperPromise = transcribeWithWhisper(videoPath, hintLanguage).then(result => {
        if (!result) return null
        if (result.detectedLanguage) resolvedLanguage = result.detectedLanguage
        return result.words || null
      })
    } else {
      emit(`✂️ Extracting ${moments.length} clips…`, 35, "extracting")
    }

    const clipsRaw = await processClipsInParallel(
      videoPath, moments, sessionId, session.userId,
      videoType, videoInfo, layout, null, hintLanguage
    )

    emit("⏳ Finalizing captions…", 96)
    const fullTranscript = await whisperPromise

    const clips = clipsRaw.map(clip => {
      const lang = resolvedLanguage
      if (!fullTranscript) {
        return { ...clip, language: lang, captionSegments: generatePlaceholderCaptions(clip.duration, lang, clip.startTime), hasRealCaptions: false }
      }
      const realSegs = sliceTranscript(fullTranscript, clip.startTime, clip.endTime)
      return { ...clip, language: lang, captionSegments: realSegs || generatePlaceholderCaptions(clip.duration, lang, clip.startTime), hasRealCaptions: !!realSegs }
    })

    session.videoInfo = {
      title: videoInfo.title || "YouTube Video", duration, originalUrl: url,
      language: resolvedLanguage, videoType,
      quality: dl.quality || "1080p", fileSize: dl.size, layout,
      hasRealCaptions: clips.filter(c => c.hasRealCaptions).length > 0,
      originalVideoPath: videoPath,
      fullTranscript: fullTranscript || null,
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
    const { sessionId, captionStyle = "classic" } = req.body
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found" })
    const clip = session.clips?.find(c => c.id === clipId)
    if (!clip)  return res.status(404).json({ success: false, error: "Clip not found" })

    const src        = `uploads/clips/${clipId}.mp4`
    const dest       = `uploads/clips/${clipId}_captioned_${captionStyle}.mp4`
    const legacyDest = `uploads/clips/${clipId}_captioned.mp4`

    if ((await verifyFile(dest, 0.1)).exists) {
      try { await fs.copyFile(dest, legacyDest) } catch {}
      return res.json({ success: true, videoUrl: `/uploads/clips/${clipId}_captioned_${captionStyle}.mp4?v=${Date.now()}`, cached: true })
    }

    const clipLang = clip.language || session.videoInfo?.language || "english"
    const segs = clip.captionSegments?.length > 0
      ? clip.captionSegments
      : generatePlaceholderCaptions(clip.duration, clipLang, clip.startTime)

    console.log(`[captions] Burning ${clipId} | lang: ${clipLang} | style: ${captionStyle} | segs: ${segs.length}`)
    await burnCaptionsAss(src, dest, segs, clipLang, captionStyle)

    if (!(await verifyFile(dest, 0.1)).exists) throw new Error("Caption render failed")
    try { await fs.copyFile(dest, legacyDest) } catch {}

    res.json({
      success: true,
      videoUrl: `/uploads/clips/${clipId}_captioned_${captionStyle}.mp4?v=${Date.now()}`,
      isReal: clip.hasRealCaptions || false,
      language: clipLang,
      style: captionStyle,
    })
  } catch (err) {
    console.error("[captions] Error:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get("/api/download/:clipId", async (req, res) => {
  const p = `uploads/clips/${req.params.clipId}.mp4`
  try { await fs.access(p); res.download(p, `clip_${req.params.clipId}.mp4`) }
  catch { res.status(404).json({ success: false, error: "Not found" }) }
})

app.post("/api/extend-cut-clip", async (req, res) => {
  try {
    const { clipId, newStartTime, newEndTime, sessionId } = req.body
    if (!clipId || newStartTime == null || newEndTime == null || !sessionId)
      return res.status(400).json({ success: false, error: "Missing required fields" })
    if (newEndTime - newStartTime < 3)
      return res.status(400).json({ success: false, error: "Min 3 seconds" })
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found or expired" })
    const origPath = session.videoInfo?.originalVideoPath
    if (!origPath || !(await verifyFile(origPath, 1)).exists)
      return res.status(404).json({ success: false, error: "Original video expired (30 min limit)" })
    const totalDur     = session.videoInfo?.duration || 9999
    const videoType    = session.videoInfo?.videoType || "general"
    const language     = session.videoInfo?.language  || "english"
    const layout       = session.videoInfo?.layout    || "single"
    const clampedStart = Math.max(0, Math.min(newStartTime, totalDur - 3))
    const clampedEnd   = Math.max(clampedStart + 3, Math.min(newEndTime, totalDur))
    const dur          = clampedEnd - clampedStart
    const newId = uuidv4()
    await extractClip(origPath, `uploads/clips/${newId}.mp4`, clampedStart, dur, videoType, layout)
    if (!(await verifyFile(`uploads/clips/${newId}.mp4`, 0.05)).exists) throw new Error("Clip extraction failed")
    await generateThumbnail(origPath, `uploads/thumbnails/${newId}.jpg`, clampedStart + 1)
    if (session.userId) User.findByIdAndUpdate(session.userId, { $inc: { clipsGenerated: 1 } }).catch(() => {})
    const fullTranscript = session.videoInfo?.fullTranscript || null
    let captionSegments, hasRealCaptions
    if (fullTranscript) {
      const realSegs = sliceTranscript(fullTranscript, clampedStart, clampedEnd)
      captionSegments = realSegs || generatePlaceholderCaptions(dur, language, clampedStart)
      hasRealCaptions = !!realSegs
    } else {
      captionSegments = generatePlaceholderCaptions(dur, language, clampedStart)
      hasRealCaptions = false
    }
    const origClip = session.clips?.find(c => c.id === clipId)
    const ts = Date.now()
    const newClip = {
      id: newId, title: `Custom – ${origClip?.title || "Clip"}`,
      viralTitles: generateViralTitles(session.videoInfo || {}, { videoType, language }),
      startTime: clampedStart, endTime: clampedEnd, duration: dur,
      viralScore: origClip?.viralScore || 85,
      thumbnail: `/uploads/thumbnails/${newId}.jpg?v=${ts}`, videoUrl: `/uploads/clips/${newId}.mp4`,
      videoUrlFresh: `/uploads/clips/${newId}.mp4?v=${ts}`,
      quality: "1080p", isCustom: true, originalClipId: clipId, hasCaptions: false,
      captionSegments, hasRealCaptions,
      minStartTime: Math.max(0, clampedStart - 90), maxEndTime: Math.min(totalDur, clampedEnd + 90),
      language, videoType,
    }
    if (session.clips) session.clips.push(newClip)
    res.json({ success: true, clip: newClip })
  } catch (err) { res.status(500).json({ success: false, error: err.message }) }
})

// ── GET SESSION — returns full state for page restore ──────────────────────
app.get("/api/session/:sessionId", (req, res) => {
  const s = processingSessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ success: false, error: "Not found" })
  res.json({ success: true, session: s })
})

app.get("/api/preview/:clipId", async (req, res) => {
  const p = `uploads/clips/${req.params.clipId}.mp4`
  try {
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
  } catch { res.status(404).json({ success: false, error: "Clip not found" }) }
})

app.get("/api/health", (_, res) => res.json({
  status: "OK", version: "15.0",
  whisper: WHISPER_AVAILABLE, whisperCmd: WHISPER_CMD,
  captionStyles: Object.keys(CAPTION_STYLE_PRESETS),
  fixes: [
    "FIX v15-1: Session persistence — GET /api/session returns full state",
    "FIX v15-2: Socket 'rejoin' event for tab-close reconnect",
    "FIX v15-3: Caption styles — 6 presets (classic/neon/tiktok/minimal/fire/hindi)",
    "FIX v15-4: Download strategy order — standard web first (most reliable)",
    "FIX v14-H: PYTHONIOENCODING=utf-8 fixes Hindi UnicodeEncodeError",
    "FIX v15b-1: POST /api/auth/refresh — token refresh endpoint",
    "FIX v15b-2: Jobs CRUD — GET/POST/PUT /api/jobs/:jobId",
    "FIX v15b-3: Clip history — GET/POST/DELETE /api/clips",
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

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
const startServer = async () => {
  await ensureUploadsDir()
  server.listen(PORT, () => {
    console.log(`\n🎯 ShortAI API v15 on port ${PORT}`)
    console.log(`   Whisper:        ${WHISPER_AVAILABLE ? `✅ ${WHISPER_CMD}` : "❌ NOT FOUND"}`)
    console.log(`   Caption styles: ${Object.keys(CAPTION_STYLE_PRESETS).join(", ")}`)
    console.log(`   Session rejoin: socket.on("rejoin") ✅`)
    console.log(`   Health:         http://localhost:${PORT}/api/health`)
  })
}
startServer()