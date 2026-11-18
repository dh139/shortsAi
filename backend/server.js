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
// Resolve ffmpeg/ffprobe even if PATH wasn't refreshed after winget install —
// AND push its folder onto this process' PATH so EVERY spawned child inherits
// it (whisper's internal ffmpeg call fails silently otherwise: it exits code 0
// producing NO transcript JSON — "JSON not found" storms).
try {
  const { execSync } = require("child_process")
  let ffPath = null
  try { ffPath = execSync("where ffmpeg", { encoding: "utf8" }).trim().split(/\r?\n/)[0] } catch {}
  if (!ffPath) {
    try {
      ffPath = execSync("where /R \"C:\\Users\\Asus\\AppData\\Local\\Microsoft\\WinGet\\Packages\" ffmpeg.exe 2>nul", { encoding: "utf8", timeout: 15000 }).trim().split(/\r?\n/)[0]
    } catch {}
  }
  if (ffPath && fsSync.existsSync(ffPath)) {
    const binDir = path.dirname(ffPath)
    if (!(process.env.PATH || "").split(path.delimiter).includes(binDir)) {
      process.env.PATH = `${process.env.PATH || ""}${path.delimiter}${binDir}`
      console.log(`[ffmpeg] PATH + ${binDir} (whisper/face-tracker children inherit ffmpeg)`)
    }
    if (ffPath.toLowerCase().endsWith("ffmpeg.exe")) {
      ffmpeg.setFfmpegPath(ffPath)
      ffmpeg.setFfprobePath(ffPath.replace(/ffmpeg\.exe$/i, "ffprobe.exe"))
      console.log(`[ffmpeg] Using ${ffPath}`)
    }
  }
} catch {}
// WHISPER_ENV is defined AFTER fsSync/path — must stay below this block.
const { v4: uuidv4 } = require("uuid")
const http       = require("http")
const socketIo   = require("socket.io")
const { spawn, spawnSync } = require("child_process")
const axios = require("axios")
require("dotenv").config()

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught Exception:", err.message)
})
process.on("unhandledRejection", (err) => {
  console.error("[server] Unhandled Rejection:", err?.message || err)
})

const { downloadVideo, findYtDlpBinary } = require("./downloader")
const { analyzeTranscriptForClips, transliterateWordsWithGemini } = require("./aiAnalyzer")
const captionEngine = require("./captionEngine")
let authRoutes = null
let User = null
try { authRoutes = require("./routes/auth") } catch (e) { console.warn("[auth] routes unavailable, continuing without auth:", e.message) }
try { User = require("./models/user") } catch (e) { console.warn("[db] User model unavailable:", e.message); User = null }
let multer = null
try { multer = require("multer") } catch (e) { console.warn("[upload] multer not installed — run `npm install multer` in backend for upload support") }

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

const SESSIONS_CACHE_FILE = path.join("uploads", "sessions_cache.json")
const saveSessionsToCache = async () => {
  try {
    const data = {}
    for (const [k, v] of processingSessions.entries()) {
      data[k] = v
    }
    await fs.writeFile(SESSIONS_CACHE_FILE, JSON.stringify(data), "utf8")
  } catch {}
}
const loadSessionsFromCache = async () => {
  try {
    const raw = await fs.readFile(SESSIONS_CACHE_FILE, "utf8").catch(() => null)
    if (raw) {
      const parsed = JSON.parse(raw)
      for (const k of Object.keys(parsed)) {
        processingSessions.set(k, parsed[k])
      }
      console.log(`[sessions] Loaded ${processingSessions.size} sessions from disk cache`)
    }
  } catch {}
}
loadSessionsFromCache()

app.use(cors())
app.use((req, res, next) => {
  if (req.url && req.url.startsWith("//")) {
    req.url = req.url.replace(/^\/+/, "/")
  }
  next()
})
app.use(express.json({ limit: "10mb" }))
const BACKEND_UPLOADS = path.resolve(__dirname, "uploads")
const ROOT_UPLOADS = path.resolve(__dirname, "../uploads")
app.use("/uploads", express.static(BACKEND_UPLOADS))
app.use("/uploads", express.static(ROOT_UPLOADS))

// MongoDB is OPTIONAL — app runs fully without auth / DB. Only connect if URI set.
let dbReady = false
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { dbReady = true; console.log("✅ Connected to MongoDB") })
    .catch((e) => console.warn("⚠️ MongoDB unavailable (continuing without DB):", e.message))
} else {
  console.log("ℹ️ No MONGODB_URI — running auth-free, in-memory sessions only")
}
if (authRoutes) app.use("/api/auth", authRoutes)
else app.use("/api/auth", (req, res) => res.status(503).json({ success: false, error: "Auth disabled (no DB). App runs without login." }))

// ─────────────────────────────────────────────────────────────────────────────
//  CAPTION STYLE PRESETS  (mirrors client-side CAPTION_STYLES) — 2025-26 trending
// ─────────────────────────────────────────────────────────────────────────────
// Each preset: font, size, colors, position + `anim` (ASS-implementable):
//  pop | bounce | karaoke | boxed | neon | fade | slide | pill
// All animations are burned with libass (\t scale, \fad, \move, \bord) so the
// DOWNLOADED video keeps the exact style you preview.
const CAPTION_STYLE_PRESETS = {
  shortai:   { font: "Bricolage Grotesque", fontSize: 96, primaryColor: "#EDEDE8", highlightColor: "#9DFF4A", outlineColor: "#060606", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 8, shadow: 4 },
  discipline:{ font: "Montserrat", accentFont: "Alex Brush", fontSize: 98, primaryColor: "#FFFFFF", highlightColor: "#E50012", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true, uppercase: false, anim: "discipline", outline: 8, shadow: 5, description: "WhiteStair Discipline: Bold hero with Alex Brush red cursive accent" },
  crazy:     { font: "Montserrat", fontSize: 104, primaryColor: "#FFFFFF", highlightColor: "#FF8F00", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "crazy", outline: 9, shadow: 8, description: "WhiteStair Crazy: 3D metallic gold/orange extruded punch" },
  estate4:   { font: "Montserrat", fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#1CD0FF", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true, uppercase: false, anim: "estate4", outline: 8, shadow: 6, description: "WhiteStair Estate 4: Headline with 3D sky-blue hero extrusion" },
  master:    { font: "Inter", fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#9DFF4A", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "pop", outline: 8, shadow: 4 },
  "mrbeast-classic": { font: "Lato", fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#FFE500", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "pop", outline: 8, shadow: 4 },
  "impact-glow": { font: "Oswald", fontSize: 96, primaryColor: "#FFFFFF", highlightColor: "#00E5FF", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "pop", outline: 8, shadow: 6 },
  vogue:     { font: "Anton", fontSize: 92, primaryColor: "#FFFFFF", highlightColor: "#FF2D55", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "slide", outline: 8, shadow: 4 },
  "glowly-1":{ font: "Montserrat", fontSize: 92, primaryColor: "#00E5FF", highlightColor: "#FF007F", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "neon", outline: 8, shadow: 10 },
  "karaoke-classic": { font: "Montserrat", fontSize: 88, primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true, uppercase: true, anim: "karaoke", outline: 5, shadow: 3 },
  hormozi1:  { font: "Impact",            fontSize: 100, primaryColor: "#FFFFFF", highlightColor: "#00E676", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 7, shadow: 3 },
  hormozi2:  { font: "Impact",            fontSize: 100, primaryColor: "#FFFFFF", highlightColor: "#FFE600", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 7, shadow: 3 },
  beast:     { font: "Arial Black",       fontSize: 98,  primaryColor: "#FFD400", highlightColor: "#FF3B30", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 9, shadow: 4, italic: true },
  karaoke:   { font: "Montserrat",        fontSize: 96,  primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#001322", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "karaoke", outline: 5, shadow: 3, dynamicColor: true, numberColor: "#FFE21F" },
  bounce:    { font: "Arial Black",       fontSize: 96,  primaryColor: "#FFFFFF", highlightColor: "#FF6B35", outlineColor: "#1A1A1A", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "bounce",  outline: 8, shadow: 4 },
  neon:      { font: "Outfit",            fontSize: 94,  primaryColor: "#7DF9FF", highlightColor: "#FF7AD9", outlineColor: "#12041F", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "neon",    outline: 6, shadow: 10 },
  fire:      { font: "Arial Black",       fontSize: 94,  primaryColor: "#FFD400", highlightColor: "#FF6B35", outlineColor: "#4A0E00", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "bounce",  outline: 8, shadow: 6 },
  minimal:   { font: "Poppins",           fontSize: 84,  primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: true,  bgColor: "rgba(0,0,0,0.55)", bold: false, uppercase: false, anim: "fade",    outline: 0, shadow: 0 },
  brutal:    { font: "Impact",            fontSize: 104, primaryColor: "#FFFFFF", highlightColor: "#FFE600", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 10, shadow: 5 },
  boxed:     { font: "Montserrat",        fontSize: 92,  primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", bgBox: true,  bgColor: "rgba(44,74,94,0.92)", bold: true,  uppercase: false, anim: "karaoke", outline: 0, shadow: 0 },
  typewriter:{ font: "Outfit",            fontSize: 88,  primaryColor: "#FFFFFF", highlightColor: "#00E676", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "typewriter", outline: 5, shadow: 3 },
  slide:     { font: "Poppins",           fontSize: 92,  primaryColor: "#FFFFFF", highlightColor: "#FF6B35", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "slide",   outline: 6, shadow: 3 },
  fadeIn:    { font: "Montserrat",        fontSize: 90,  primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "fade",    outline: 5, shadow: 3 },
  pill:      { font: "Poppins",           fontSize: 88,  primaryColor: "#FFFFFF", highlightColor: "#FF6B35", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pill",    outline: 0, shadow: 0 },
  pop:       { font: "Montserrat",        fontSize: 96,  primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#001322", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 7, shadow: 3, dynamicColor: true, numberColor: "#FFE21F" },
  negativa:  { font: "Montserrat",        fontSize: 88,  primaryColor: "#FFFFFF", highlightColor: "#4ADE80", outlineColor: "#000000", position: "bottom", bgBox: true,  bgColor: "rgba(0,0,0,0.88)", bold: true,  uppercase: false, anim: "pop",     outline: 0, shadow: 0 },
  cove:      { font: "Poppins",           fontSize: 92,  primaryColor: "#FFFFFF", highlightColor: "#7DD3FC", outlineColor: "#0B2540", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "pop",     outline: 5, shadow: 6 },
  leon:      { font: "Arial Black",       fontSize: 90,  primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: true,  bgColor: "rgba(226,45,35,0.96)", bold: true,  uppercase: true,  anim: "pop",     outline: 0, shadow: 0 },
  laguna:    { font: "Montserrat",        fontSize: 96,  primaryColor: "#FFFFFF", highlightColor: "#FDE047", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "fade",    outline: 7, shadow: 3 },
  tuba:      { font: "Outfit",            fontSize: 90,  primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "pop",     outline: 6, shadow: 3 },
  splitz:    { font: "Georgia",           fontSize: 90,  primaryColor: "#F1A65A", highlightColor: "#FFD8A8", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "fade",    outline: 5, shadow: 4, italic: true },
  aria:      { font: "Poppins",           fontSize: 92,  primaryColor: "#FFC93C", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "pop",     outline: 6, shadow: 3 },
  stack:     { font: "Montserrat",        fontSize: 90,  primaryColor: "#FFFFFF", highlightColor: "#FDE047", outlineColor: "#000000", position: "bottom", bgBox: true,  bgColor: "rgba(0,0,0,0.6)", bold: true,  uppercase: true,  anim: "boxed",   outline: 0, shadow: 0 },
  lume:      { font: "Poppins",           fontSize: 90,  primaryColor: "#E4C48C", highlightColor: "#FFF3D6", outlineColor: "#1A1206", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "fade",    outline: 5, shadow: 4 },
  marca:     { font: "Arial Black",       fontSize: 88,  primaryColor: "#111111", highlightColor: "#111111", outlineColor: "#FFD400", position: "bottom", bgBox: true,  bgColor: "rgba(255,214,0,0.96)", bold: true,  uppercase: true,  anim: "boxed",   outline: 0, shadow: 0 },
  canto:     { font: "Georgia",           fontSize: 90,  primaryColor: "#F3EAD6", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "fade",    outline: 5, shadow: 4, italic: true },
  silk:      { font: "Poppins",           fontSize: 90,  primaryColor: "#3DE0D2", highlightColor: "#FFFFFF", outlineColor: "#032B29", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "pop",     outline: 6, shadow: 3 },
  slash:     { font: "Arial Black",       fontSize: 94,  primaryColor: "#FF3D9A", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 8, shadow: 3 },
  dense:     { font: "Arial Black",       fontSize: 98,  primaryColor: "#B6FF3C", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "center", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "pop",     outline: 8, shadow: 3 },
  open:      { font: "Montserrat",        fontSize: 92,  primaryColor: "#2FD891", highlightColor: "#FFFFFF", outlineColor: "#00301F", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "pop",     outline: 7, shadow: 3 },
  vibe:      { font: "Poppins",           fontSize: 94,  primaryColor: "#34D058", highlightColor: "#FFFFFF", outlineColor: "#00230F", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: false, anim: "pop",     outline: 7, shadow: 3 },
  rise:      { font: "Montserrat",        fontSize: 94,  primaryColor: "#FFC01E", highlightColor: "#FFFFFF", outlineColor: "#2A1B00", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "slide",   outline: 7, shadow: 3 },
  prism:     { font: "Poppins",           fontSize: 94,  primaryColor: "#C4A0FF", highlightColor: "#FF7AD9", outlineColor: "#1A0B2E", position: "bottom", bgBox: false, bgColor: "transparent", bold: true,  uppercase: true,  anim: "neon",    outline: 7, shadow: 6 },
}

const resolveCaptionStyle = (styleId) => {
  return CAPTION_STYLE_PRESETS[styleId] || CAPTION_STYLE_PRESETS.shortai || CAPTION_STYLE_PRESETS.hormozi1
}

// ── Language & Whisper model helpers (en / hi / hinglish / gu / auto) ─────────
const resolveWhisperLang = (hint) => {
  if (!hint || hint === "auto") return null
  const h = String(hint).toLowerCase()
  if (h === "english" || h === "en") return "en"
  if (h === "hindi" || h === "hi" || h === "hinglish" || h === "hi-en" || h === "ur" || h === "urdu") return "hi"
  if (h === "gujarati" || h === "gu" || h === "guj" || h === "gujlish" || h === "gu-en" || h === "gujarati-roman") return "gu"
  return h.length === 2 ? h : null
}
const whisperModelFor = (langCode, onDemand = false) => {
  // `small` was measured at 7× realtime on this machine (142s for 20s of audio)
  // and was not more accurate than `base`, so both full-file and on-demand
  // passes use `base` for consistent speed.
  return "base"
}
const appLangOf = (whisperLang) => {
  if (!whisperLang) return "english"
  const l = String(whisperLang).toLowerCase()
  if (l === "hi" || l === "ur" || l === "urdu") return "hindi"
  if (l === "gu") return "gujarati"
  if (l === "en") return "english"
  return "english"
}
const hasDevanagari = (s) => /[ऀ-ॿ]/.test(s || "")
const hasGujarati   = (s) => /[઀-૿]/.test(s || "")
const hasUrdu       = (s) => /[\u0600-\u06FF]/.test(s || "")

// Lightweight Devanagari → Roman (Hinglish) transliterator for the "hinglish"
// caption option. Whisper outputs Devanagari for Hindi audio; this converts it
// so Hinglish captions read in Roman script. Covers common words well.
const DEV_ROMAN = {
  "और":"aur","यह":"yeh","बहुत":"bahut","जरूरी":"jaroori","है":"hai","क्योंकि":"kyunki","जब":"jab","आप":"aap","सोचते":"sochte","सच":"sach","कि":"ki","कोई":"koi","नहीं":"nahi","बताता":"batata","बात":"baat","लेकिन":"lekin","मैंने":"maine","सीखा":"sikha","सब":"sab","कुछ":"kuch","बदल":"badal","गया":"gaya","वो":"woh","पल":"pal","था":"tha","मुझे":"mujhe","एहसास":"ehsaas","हुआ":"hua","जिंदगी":"zindagi","देखो":"dekho","भाई":"bhai","यार":"yaar","अच्छा":"acha","ठीक":"theek","चलो":"chalo","अभी":"abhi","क्या":"kya","कैसे":"kaise","ऐसे":"aise","हां":"haan","वैसे":"waise","बिल्कुल":"bilkul","मतलब":"matlab","समझ":"samajh","एक":"ek","दो":"do","तीन":"teen","चार":"char","पांच":"paanch","छह":"che","सात":"sat","आठ":"aath","नौ":"nau","दस":"das","ज्यादा":"zyada","थोड़ा":"thoda","अभी":"abhi","फिर":"fir","अब":"ab","बस":"bas","तो":"to","क्यूं":"kyu","क्यों":"kyu","साथ":"sath","साथमे":"sathme","हम":"hum","तुम":"tum","मैं":"main","तुझे":"tujhe","मेरा":"mera","तेरा":"tera","उसका":"uska","इसका":"iska","जो":"jo","हर":"har","किसी":"kisi","लाख":"lakh","करोड़":"crore","हजार":"hazaar","सौ":"sau","आदि":"aadi","वगैरह":"vagairah","कहानी":"kahani","जीवन":"jivan","दुनिया":"duniya","साल":"saal","दिन":"din","रात":"rat","मेहनत":"mehnat","सफलता":"safalta","काम":"kaam","पैसा":"paisa","समय":"samay","लोग":"log","इंसान":"insaan","भविष्य":"bhavishya","अतीत":"ateet","वर्तमान":"vartaman","प्रकृति":"prakriti","पानी":"pani","आग":"aag","मिट्टी":"mitti","हवा":"hawa","पेड़":"ped","फसल":"fasal","किसान":"kisan","गांव":"gaon","शहर":"sheher","देश":"desh","भारत":"bharat","घर":"ghar","परिवार":"parivaar","दोस्त":"dost","म मां":"maa","बाप":"baap","बच्चा":"bacha","स्कूल":"school","पढ़ाई":"padhai","किताब":"kitab","नौकरी":"naukri","लिखा":"likha"
}
const DEV_MATRA = { "आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ए":"e","ऐ":"ai","ओ":"o","औ":"au","अं":"an","अः":"ah","ा":"a","ि":"i","ी":"ee","ु":"u","ू":"oo","ृ":"ri","े":"e","ै":"ai","ो":"o","ौ":"au","्":""}
const DEV_CONS = { "क":"k","ख":"kh","ग":"g","घ":"gh","ङ":"ng","च":"ch","छ":"chh","ज":"j","झ":"jh","ञ":"ny","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h"}
const devToRoman = (word) => {
  if (!word) return word
  if (DEV_ROMAN[word]) return DEV_ROMAN[word]
  if (!hasDevanagari(word)) return word
  let out = "", i = 0
  while (i < word.length) {
    const ch = word[i]
    if (DEV_CONS[ch] !== undefined) {
      let cons = DEV_CONS[ch]
      const nxt = word[i + 1]
      if (nxt && DEV_MATRA[nxt] !== undefined) { out += cons + DEV_MATRA[nxt]; i += 2; continue }
      if (word[i + 1] !== "्" && (i + 1 >= word.length || !DEV_CONS[word[i + 1]])) out += cons + "a"
      else out += cons
      i++; continue
    }
    if (DEV_MATRA[ch] !== undefined) { out += DEV_MATRA[ch]; i++; continue }
    if (/[0-9]/.test(ch)) { out += ch; i++; continue }
    i++
  }
  return out || word
}

// Gujarati → Roman (Gujlish) — same approach as Devanagari above. Whisper
// outputs Gujarati script for Gujarati audio; this converts it so "Gujlish"
// captions read in Roman script (English letters), matching Hinglish.
const GUJ_ROMAN = {
  "અને":"ane","છે":"che","હું":"hu","તમે":"tame","આ":"aa","તે":"te","નહીં":"nahi","શું":"shu","કેમ":"kem","બહુ":"bahu","સારું":"saru","ભાઈ":"bhai","દોસ્ત":"dost","પૈસા":"paisa","સમય":"samay","લોકો":"loko","દેશ":"desh","ઘર":"ghar","પરિવાર":"parivaar","કામ":"kaam","જીવન":"jivan","વિચાર":"vichar","વાત":"vaat","પ્રેમ":"prem","ખૂબ":"khub","હા":"ha","ના":"na","માટે":"mate","સાથે":"sathe","અમે":"ame","તેઓ":"teo","એક":"ek","બે":"be","ત્રણ":"tran","ચાર":"char","પાંચ":"panch","દસ":"das","સો":"so","હજાર":"hajar","લાખ":"lakh","કરોડ":"crore","પાણી":"pani","સ્કૂલ":"school","નોકરી":"nokri","ગામ":"gaam","શહેર":"shaher","ભારત":"bharat","ગુજરાત":"gujarat","બાળક":"baalak","માણસ":"maanas","આજે":"aaje","કાલે":"kaale","બહેન":"bahen","મા":"maa","પિતા":"pita","મિત્ર":"mitra","જરૂરી":"jaroori","કારણ":"kaaran","સાચું":"sachu","જ્યારે":"jyare","ત્યારે":"tyare","હવે":"have","ફરી":"fari","બધું":"badhu","કંઈક":"kaik","થોડું":"thodu","વધુ":"vadhu"
}
const GUJ_MATRA = { "અ":"a","આ":"aa","ઇ":"i","ઈ":"ee","ઉ":"u","ઊ":"oo","ઋ":"ri","એ":"e","ઐ":"ai","ઓ":"o","ઔ":"au","ા":"a","િ":"i","ી":"ee","ુ":"u","ૂ":"oo","ૃ":"ri","ે":"e","ૈ":"ai","ો":"o","ૌ":"au","ં":"an","ઃ":"ah","્":"" }
const GUJ_CONS = { "ક":"k","ખ":"kh","ગ":"g","ઘ":"gh","ઙ":"ng","ચ":"ch","છ":"chh","જ":"j","ઝ":"jh","ઞ":"ny","ટ":"t","ઠ":"th","ડ":"d","ઢ":"dh","ણ":"n","ત":"t","થ":"th","દ":"d","ધ":"dh","ન":"n","પ":"p","ફ":"ph","બ":"b","ભ":"bh","મ":"m","ય":"y","ર":"r","લ":"l","વ":"v","શ":"sh","ષ":"sh","સ":"s","હ":"h","ળ":"l" }
const gujToRoman = (word) => {
  if (!word) return word
  if (GUJ_ROMAN[word]) return GUJ_ROMAN[word]
  if (!hasGujarati(word)) return word
  let out = "", i = 0
  while (i < word.length) {
    const ch = word[i]
    if (GUJ_CONS[ch] !== undefined) {
      const cons = GUJ_CONS[ch]
      const nxt = word[i + 1]
      if (nxt && GUJ_MATRA[nxt] !== undefined) { out += cons + GUJ_MATRA[nxt]; i += 2; continue }
      if (word[i + 1] !== "્" && (i + 1 >= word.length || !GUJ_CONS[word[i + 1]])) out += cons + "a"
      else out += cons
      i++; continue
    }
    if (GUJ_MATRA[ch] !== undefined) { out += GUJ_MATRA[ch]; i++; continue }
    if (/[0-9]/.test(ch)) { out += ch; i++; continue }
    i++
  }
  return out || word
}

// Urdu/Arabic script → Roman (Hinglish). Whisper's Hindi token frequently
// emits Urdu script for Hindustani speech (especially Urdu vocabulary), so the
// Hinglish path must handle BOTH Devanagari and Urdu output. Without this,
// auto-detect labelled the captions "hinglish" but left them in Urdu script.
const URDU_ROMAN = {
  "ہے":"hai","ہیں":"hain","ہوں":"hoon","ہو":"ho","تھا":"tha","تھی":"thi","تھے":"the","تھیں":"thin",
  "میں":"main","کی":"ki","کے":"ke","کا":"ka","کو":"ko","نے":"ne","سے":"se","پر":"par",
  "اور":"aur","تو":"toh","بھی":"bhi","نہیں":"nahi","کیا":"kya","وہ":"woh","یہ":"yeh","اس":"us","ان":"un","انہوں":"unhon",
  "جو":"jo","جب":"jab","کبھی":"kabhi","کچھ":"kuch","ایک":"ek","ہر":"har","سب":"sab","کسی":"kisi","کوئی":"koi","کون":"kaun",
  "کہ":"keh","کہا":"kaha","کہنے":"kehne","کہہ":"keh","کر":"kar","کرتا":"karta","کرتی":"karti","کرتے":"karte","کرنے":"karne",
  "چلا":"chala","چلے":"chale","چلو":"chalo","ہوا":"hua","ہوتی":"hoti","ہوتا":"hota","گیا":"gaya","گے":"ge","گا":"ga",
  "رہا":"raha","رہی":"rahi","رہے":"rahe","رہ":"reh","لی":"li","دے":"de","دیا":"diya","دم":"dam",
  "بات":"baat","دنیا":"duniya","آدمی":"aadmi","وقت":"waqt","موت":"maut","جیسے":"jaise","طرح":"tarah","بعد":"baad","پہلے":"pehle",
  "پتہ":"pata","کیوں":"kyun","لیکن":"lekin","بلکہ":"balki","شروع":"shuru","شراب":"sharaab","پولیس":"police","آفیسر":"officer",
  "بامبے":"Bombay","پاکستان":"Pakistan","شہر":"sheher","گھر":"ghar","کام":"kaam","کوشش":"koshish","اچھا":"achha","بہت":"bahut",
  "سندر":"sundar","دیکھا":"dekha","دیکھنے":"dekhne","جانتا":"jaanta","آتا":"aata","جاتا":"jaata","ہمارے":"hamare","ہمیں":"hamein",
  "تم":"tum","میرا":"mera","وہاں":"wahan","ہاں":"haan","سکتے":"sakte","ہی":"hi","یہی":"yahi","والا":"wala","والی":"wali","والے":"wale",
  "دوڑ":"daud","داؤد":"Dawood","داؤڑ":"daud","ساہبیر":"Sabir","صابر":"Sabir","خبری":"khabri","مروایا":"marwaya","مارا":"maara",
  "چھن":"chhan","دردہ":"dard","سمجھی":"samjhi","کنترول":"control","رکھے":"rakhe","رکھوں":"rakhun","اگلی":"agli","دکھا":"dikha",
  "یا":"ya","بتا":"bata","پہ":"pe","اسے":"use","بچے":"bachche","جا":"ja","علاقہ":"ilaaka","علاکہ":"ilaaka",
  "ہمارا":"hamara","ہماری":"hamari","انہیں":"unhein","انکا":"unka","انکی":"unki","انکے":"unke",
  "مجھے":"mujhe","مجھ":"mujh","تمہیں":"tumhein","تمہارا":"tumhara","تمہاری":"tumhari","اپنا":"apna","اپنی":"apni","اپنے":"apne",
  "یہاں":"yahan","کہاں":"kahan","اب":"ab","ابھی":"abhi","پھر":"phir","فر":"phir","پہلی":"pehli","پہلا":"pehla","آخری":"aakhri",
  "بڑا":"bada","بڑی":"badi","چھوٹا":"chhota","چھوٹی":"chhoti","نیا":"naya","نئی":"nayi","نئے":"naye","سارا":"saara","ساری":"saari","سارے":"saare",
  "لوگ":"log","لोग":"log","عورت":"aurat","بیوی":"biwi","شوہر":"shohar","ماں":"maa","باپ":"baap","بھائی":"bhai","بہن":"bahen",
  "دوست":"dost","دشمن":"dushman","پیسہ":"paisa","پیسے":"paise","روپے":"rupaye","روپ":"rup","سال":"saal","دن":"din","رات":"raat","صبح":"subah","شام":"shaam",
  "پانی":"pani","کھانا":"khana","گاڑی":"gaadi","راستہ":"raasta","راست":"raast","نوکری":"naukri","سکول":"school","اسکول":"school",
  "پڑھائی":"padhai","کتاب":"kitaab","بچہ":"bachcha","بچی":"bachchi","عمر":"umar","زندگی":"zindagi","جیون":"jeevan","جیوان":"jeevan",
  "دل":"dil","دلہ":"dil","خون":"khoon","آنکھ":"aankh","آنکھیں":"aankhein","ہاتھ":"haath","پاؤں":"paon","سر":"sar","چہرہ":"chehra",
  "دروازہ":"darwaza","کمرہ":"kamra","جگہ":"jagah","باتیں":"baatein","باتوں":"baaton","کہانی":"kahani","قصہ":"qissa",
  "سچ":"sach","جھوٹ":"jhooth","خبر":"khabar","خبریں":"khabrein","اخبار":"akhbaar","ویڈیو":"video","تصویر":"tasveer"
}
const URDU_ASPIRATE = {
  "ک":"kh","گ":"gh","چ":"chh","ج":"jh","ت":"th","د":"dh","ٹ":"th","ڈ":"dh",
  "ڑ":"rh","پ":"ph","ب":"bh","ل":"lh","م":"mh","ن":"nh","و":"vh","ہ":"hh"
}
const URDU_CONS = {
  "ب":"b","پ":"p","ت":"t","ٹ":"t","ث":"s","ج":"j","چ":"ch","ح":"h","خ":"kh",
  "د":"d","ڈ":"d","ذ":"z","ر":"r","ڑ":"r","ز":"z","ژ":"zh","س":"s","ش":"sh",
  "ص":"s","ض":"z","ط":"t","ظ":"z","غ":"gh","ف":"f","ق":"q","ک":"k","گ":"g",
  "ل":"l","م":"m","ن":"n","ں":"n","ہ":"h","ی":"y","و":"v"
}
const URDU_VOWEL = {
  "ا":"a","آ":"aa","أ":"a","إ":"i","ع":"a","ء":"","َ":"a","ِ":"i","ُ":"u",
  "ً":"an","ٌ":"un","ٍ":"in","ٰ":"aa","ے":"e","ؤ":"o","ئ":"i","ى":"a","ة":"a"
}
const urduToRoman = (word) => {
  if (!word) return word
  const bare = String(word).replace(/[۔،؟!.,;:()\[\]"'«»]/g, "").trim()
  if (URDU_ROMAN[bare]) return URDU_ROMAN[bare]
  if (!hasUrdu(word)) return word
  let out = "", i = 0
  const ch = [...word]
  while (i < ch.length) {
    const c = ch[i]
    if (c === "ھ") { out += "h"; i++; continue }
    if (URDU_ASPIRATE[c] && ch[i + 1] === "ھ") { out += URDU_ASPIRATE[c]; i += 2; continue }
    if (URDU_CONS[c] !== undefined) {
      let cons = URDU_CONS[c]
      if (c === "و") cons = (i === 0) ? "w" : "o"
      if (c === "ی") cons = (i === 0) ? "y" : "i"
      out += cons
      const nxt = ch[i + 1]
      if (nxt && URDU_VOWEL[nxt] !== undefined) { out += URDU_VOWEL[nxt]; i += 2; continue }
      i++; continue
    }
    if (URDU_VOWEL[c] !== undefined) { out += URDU_VOWEL[c]; i++; continue }
    if (c === "ّ") { const m = out.match(/[bcdfghjklmnpqrstvwxyz]+$/i); if (m) out += m[0]; i++; continue }
    if (c === "ْ") { i++; continue }
    if (/[0-9]/.test(c)) { out += c; i++; continue }
    i++
  }
  return out || word
}

// Best-effort Urdu → Devanagari for the explicit "Hindi (देवनागरी)" option.
// The Hinglish path above is the primary one; this just keeps native-Hindi
// captions native instead of exposing Urdu script to the user.
const URDU_DEV = {
  "ہے":"है","ہیں":"हैं","ہوں":"हूं","ہو":"हो","تھا":"था","تھی":"थी","تھے":"थे","تھیں":"थीं",
  "میں":"में","کی":"की","کے":"के","کا":"का","کو":"को","نے":"ने","سے":"से","پر":"पर",
  "اور":"और","تو":"तो","بھی":"भी","نہیں":"नहीं","کیا":"क्या","وہ":"वह","یہ":"यह","اس":"उस","ان":"उन","انہوں":"उन्हों",
  "جو":"जो","جب":"जब","کبھی":"कभी","کچھ":"कुछ","ایک":"एक","ہر":"हर","سب":"सब","کسی":"किसी","کوئی":"कोई","کون":"कौन",
  "کہ":"कि","کہا":"कहा","کہنے":"कहने","کہہ":"कह","کر":"कर","کرتا":"करता","کرتی":"करती","کرتے":"करते","کرنے":"करने",
  "چلا":"चला","چلے":"चले","چلو":"चलो","ہوا":"हुआ","ہوتی":"होती","ہوتا":"होता","گیا":"गया","گے":"गे","گا":"गा",
  "رہا":"रहा","رہی":"रही","رہے":"रहे","رہ":"रह","لی":"ली","دے":"दे","دیا":"दिया","دم":"दम",
  "بات":"बात","دنیا":"दुनिया","آدمی":"आदमी","وقت":"वक़्त","موت":"मौत","جیسے":"जैसे","طرح":"तरह","بعد":"बाद","پہلے":"पहले",
  "پتہ":"पता","کیوں":"क्यों","لیکن":"लेकिन","بلکہ":"बल्कि","شروع":"शुरू","شراب":"शराब","پولیس":"पुलिस","آفیسر":"अफ़सर",
  "بامبے":"बॉम्बे","پاکستان":"पाकिस्तान","شہر":"शहर","گھر":"घर","کام":"काम","کوشش":"कोशिश","اچھا":"अच्छा","بہت":"बहुत",
  "دیکھا":"देखा","دیکھنے":"देखने","جانتا":"जानता","آتا":"आता","جاتا":"जाता","ہمارے":"हमारे","ہمیں":"हमें",
  "تم":"तुम","میرا":"मेरा","وہاں":"वहां","ہاں":"हां","سکتے":"सकते","ہی":"ही","یہی":"यही","والا":"वाला","والی":"वाली","والے":"वाले",
  "داؤد":"दाऊद","صابر":"साबिर","ساہبیر":"साबिर","داؤڑ":"दाऊद","یا":"या","بتا":"बता","پہ":"पे","اسے":"उसे","بچے":"बच्चे","جا":"जा"
}
const URDU_DEV_CONS = {
  "ب":"ब","پ":"प","ت":"त","ٹ":"ट","ث":"स","ج":"ज","چ":"च","ح":"ह","خ":"ख",
  "د":"द","ڈ":"ड","ذ":"ज़","ر":"र","ڑ":"ड़","ز":"ज़","ژ":"झ","س":"स","ش":"श",
  "ص":"स","ض":"ज़","ط":"त","ظ":"ज़","غ":"ग़","ف":"फ़","ق":"क़","ک":"क","گ":"ग",
  "ل":"ल","م":"म","ن":"न","ں":"ं","ہ":"ह"
}
const URDU_DEV_VOWEL = {
  "ا":"ा","آ":"ा","أ":"अ","إ":"इ","ع":"अ","ء":"","َ":"ा","ِ":"ि","ُ":"ु",
  "ً":"ं","ٌ":"ुं","ٍ":"िं","ٰ":"ा","ے":"े","ؤ":"ो","ئ":"ि","ى":"ा","ة":"ा"
}
const URDU_DEV_ASPIRATE = {
  "ک":"ख","گ":"घ","چ":"छ","ج":"झ","ت":"थ","د":"ध","ٹ":"ठ","ڈ":"ढ","ڑ":"ढ़",
  "پ":"फ","ب":"भ","ل":"ल","م":"म","ن":"न","و":"व"
}
// One helper for the Roman caption modes: Whisper can emit EITHER Devanagari
// or Urdu script for the same Hindustani audio, so both must be handled.
const toRomanScript = (word) => {
  if (!word) return word
  if (hasUrdu(word)) return urduToRoman(word)
  return devToRoman(word)
}

const urduToDevanagari = (word) => {
  if (!word) return word
  const bare = String(word).replace(/[۔،؟!.,;:()\[\]"'«»]/g, "").trim()
  if (URDU_DEV[bare]) return URDU_DEV[bare]
  if (!hasUrdu(word)) return word
  let out = "", i = 0
  const ch = [...word]
  while (i < ch.length) {
    const c = ch[i]
    if (c === "ھ") { out += "ह"; i++; continue }
    if (URDU_DEV_ASPIRATE[c] && ch[i + 1] === "ھ") { out += URDU_DEV_ASPIRATE[c]; i += 2; continue }
    if (c === "و") {
      const prev = ch[i - 1]
      out += (i > 0 && URDU_DEV_CONS[prev] !== undefined) ? "ो" : "व"
      i++; continue
    }
    if (c === "ی") {
      const prev = ch[i - 1]
      out += (i > 0 && URDU_DEV_CONS[prev] !== undefined) ? "ी" : "य"
      i++; continue
    }
    if (URDU_DEV_CONS[c] !== undefined) {
      out += URDU_DEV_CONS[c]
      const nxt = ch[i + 1]
      if (nxt && URDU_DEV_VOWEL[nxt] !== undefined) { out += URDU_DEV_VOWEL[nxt]; i += 2; continue }
      i++; continue
    }
    if (URDU_DEV_VOWEL[c] !== undefined) {
      let v = URDU_DEV_VOWEL[c]
      if (i === 0) v = ({ "ا":"अ","آ":"आ","أ":"अ","إ":"इ","ع":"अ","ے":"ए" })[c] || v
      out += v; i++; continue
    }
    if (c === "ّ") { const m = out.match(/[\u0900-\u097F]$/); if (m) out += m[0]; i++; continue }
    if (c === "ْ") { i++; continue }
    if (/[0-9]/.test(c)) { out += c; i++; continue }
    i++
  }
  return out || word
}

// ─────────────────────────────────────────────────────────────────────────────
//  WHISPER DETECTION
// ─────────────────────────────────────────────────────────────────────────────
// UTF-8 env for Python/Whisper (fixes Hindi UnicodeEncodeError on Windows)
const WHISPER_ENV = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
  PYTHONLEGACYWINDOWSSTDIO: "0",
  PYTHONUNBUFFERED: "1",
}
let WHISPER_AVAILABLE   = false
let WHISPER_CMD         = null
let WHISPER_ARGS_PREFIX = []
let WHISPER_DETECT_LOG  = []

const detectWhisper = () => {
  const log = (msg) => { WHISPER_DETECT_LOG.push(msg); console.log("[whisper-detect]", msg) }
  try {
    const r = spawnSync("whisper", ["--version"], { stdio: "pipe", timeout: 5000, env: WHISPER_ENV })
    if (r.status === 0) {
      log("✅ Found: whisper CLI in PATH"); return { ok: true, cmd: "whisper", prefix: [] }
    }
  } catch (e) { log(`✗ whisper CLI: ${e.message}`) }

  const os   = require("os")
  const home = os.homedir()
  const pyCandidates = [
    path.join(home, "AppData","Local","Programs","Python","Python312","python.exe"),
    path.join(home, "AppData","Local","Programs","Python","Python311","python.exe"),
    path.join(home, "AppData","Local","Programs","Python","Python310","python.exe"),
    "python", "python3", "py", "py3",
  ]
  for (const py of pyCandidates) {
    try {
      const r = spawnSync(py, ["-c", "import whisper; print('ok')"], { stdio: "pipe", timeout: 8000, env: WHISPER_ENV })
      if (r.status === 0) {
        log(`✅ Found: openai-whisper via ${py}`)
        return { ok: true, cmd: py, prefix: ["-m", "whisper"] }
      }
    } catch (e) { log(`✗ ${py}: ${e.message}`) }
  }

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

// Full path to a REAL python (WindowsApp store stub `python` is useless).
// Used for helper scripts (detect_faces.py face tracking for split framing).
const PYTHON_EXE = (() => {
  const os = require("os")
  const home = os.homedir()
  for (const cand of [
    path.join(home, "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
    path.join(home, "AppData", "Local", "Programs", "Python", "Python311", "python.exe"),
    path.join(home, "AppData", "Local", "Programs", "Python", "Python310", "python.exe"),
  ]) { try { if (fsSync.existsSync(cand)) return cand } catch {} }
  for (const p of ["python", "python3", "py"]) {
    try { const r = spawnSync(p, ["-c", "print(1)"], { stdio: "pipe", timeout: 5000, env: WHISPER_ENV }); if (r.status === 0) return p } catch {}
  }
  return "python"
})()

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
const runWhisperOnFile = (absAudioPath, absChunkDir, whisperLangCode, model = "base", threads = 0) =>
  new Promise(async (resolve) => {
    await fs.mkdir(absChunkDir, { recursive: true }).catch(() => {})
    const relOutDir = path.relative(process.cwd(), absChunkDir)
    const audioStem = path.basename(absAudioPath, ".wav")

    const args = [
      ...WHISPER_ARGS_PREFIX,
      absAudioPath,
      "--model",           model,
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

    // openai-whisper's CLI has no --threads flag; torch reads OMP/MKL env vars.
    const procEnv = threads > 0
      ? { ...WHISPER_ENV, OMP_NUM_THREADS: String(threads), MKL_NUM_THREADS: String(threads) }
      : WHISPER_ENV

    const proc = spawn(WHISPER_CMD, args, { stdio: ["ignore","pipe","pipe"], cwd: process.cwd(), env: procEnv })
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
      if (stderrLog.trim()) {
        console.error(`[whisper] stderr tail for "${audioStem}": ${stderrLog.slice(-700).replace(/\n+/g, " | ")}`)
      }
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

const probeAudioLanguage = async (fullAudioPath, baseStem, baseTransDir, audioDuration = 0) => {
  const dur = Math.max(0, Number(audioDuration) || 0)
  // Sample two different parts of the audio (10% and 55%). A music/English
  // intro must not be allowed to mislabel an entire Hindi/Gujarati video.
  // 20 seconds is plenty for Whisper's language classifier.
  const sampleLen = Math.min(20, Math.max(8, dur || 20))
  let positions = dur > sampleLen * 2.5 ? [dur * 0.1, dur * 0.55] : [Math.max(0, dur * 0.1)]
  positions = positions.map(p => Math.max(0, Math.min(p, Math.max(0, dur - sampleLen))))
  positions = positions.filter((p, i) => positions.findIndex(q => Math.abs(q - p) < 1) === i)

  const results = await Promise.all(positions.map(async (pos, i) => {
    const probeDir     = path.join(baseTransDir, `${baseStem}_probe_${i}`)
    const probeWavPath = path.join(probeDir, `${baseStem}_probe_${i}.wav`)
    try {
      await fs.mkdir(probeDir, { recursive: true }).catch(() => {})
      await sliceWavChunk(fullAudioPath, probeWavPath, pos, sampleLen)
      const probeJson = await runWhisperOnFile(probeWavPath, probeDir, null, "base", 2)
      return probeJson?.language || null
    } catch (e) {
      console.warn(`[whisper] Language probe ${i + 1} failed:`, e.message)
      return null
    } finally {
      await safeDelete(probeWavPath).catch(() => {})
      await safeRmdir(probeDir).catch(() => {})
    }
  }))

  const normalize = (l) => !l ? null : (l === "ur" || l === "urdu") ? "hi" : String(l).toLowerCase()
  const langs = results.map(normalize).filter(Boolean)
  if (!langs.length) return null

  let pick = langs[0]
  if (langs.length >= 2 && langs[0] !== langs[1]) {
    // Disagreement: trust an Indic result over English (Whisper often labels
    // Hindi/Gujarati speech as English when music or loanwords are present),
    // and prefer Gujarati when it is one of the candidates.
    if (langs.includes("gu")) pick = "gu"
    else {
      const indic = langs.find(l => l === "hi")
      pick = indic && langs.includes("en") ? indic : langs[0]
    }
  }
  console.log(`[whisper] 🎙️ Audio language probes: ${langs.join(", ")} → ${pick}`)
  return pick
}

const parseJson3ToWords = (json3Data) => {
  const words = []
  if (!json3Data || !Array.isArray(json3Data.events)) return words
  
  for (const event of json3Data.events) {
    if (!event.segs || event.tStartMs == null) continue
    const baseStart = event.tStartMs / 1000
    const duration = (event.dDurationMs || 1000) / 1000
    
    for (let i = 0; i < event.segs.length; i++) {
      const seg = event.segs[i]
      const text = (seg.utf8 || "").trim()
      if (!text || text === "\n") continue
      
      const start = baseStart + ((seg.tOffsetMs || 0) / 1000)
      let end = start + 0.35
      if (i < event.segs.length - 1 && event.segs[i+1].tOffsetMs != null) {
        end = baseStart + (event.segs[i+1].tOffsetMs / 1000)
      } else {
        end = Math.min(baseStart + duration, start + 0.6)
      }
      
      const tokens = text.split(/\s+/)
      for (const tok of tokens) {
        if (tok) words.push({ word: tok, start: Number(start.toFixed(2)), end: Number(end.toFixed(2)) })
      }
    }
  }
  return words
}

const fetchYouTubeSubtitles = async (url, sessionId, hintLanguage = null) => {
  const binary = findYtDlpBinary ? findYtDlpBinary() : "yt-dlp"
  const outDir = path.resolve("uploads", "transcripts")
  await fs.mkdir(outDir, { recursive: true }).catch(() => {})
  const outTpl = path.join(outDir, `${sessionId}_sub.%(ext)s`)
  
  let langFlags = "hi-orig,hi,en,gu,all"
  if (hintLanguage === "gujarati" || hintLanguage === "gu" || hintLanguage === "gujlish") langFlags = "gu,gu-orig,all"
  else if (hintLanguage === "hindi" || hintLanguage === "hi" || hintLanguage === "hinglish") langFlags = "hi-orig,hi,all"
  else if (hintLanguage === "english" || hintLanguage === "en") langFlags = "en,en-orig,all"

  const args = [
    "--skip-download",
    "--write-auto-subs",
    "--write-subs",
    "--sub-format", "json3",
    "--sub-langs", langFlags,
    "-o", outTpl,
    url
  ]

  console.log(`[subs] Fetching YouTube subtitles via: ${binary}`)
  await new Promise((resolve) => {
    const proc = spawn(binary, args, { stdio: "ignore" })
    const timer = setTimeout(() => { try { proc.kill() } catch {} ; resolve() }, 25000)
    proc.on("close", () => { clearTimeout(timer); resolve() })
    proc.on("error", () => { clearTimeout(timer); resolve() })
  })

  try {
    const files = await fs.readdir(outDir)
    const matching = files.filter(f => f.startsWith(`${sessionId}_sub`) && f.endsWith(".json3"))
    if (!matching.length) return null

    let chosen = matching[0]
    if (hintLanguage === "gujarati" || hintLanguage === "gu" || hintLanguage === "gujlish") {
      const gujMatch = matching.find(f => f.includes(".gu.") || f.includes(".gu-"))
      if (gujMatch) chosen = gujMatch
    } else if (hintLanguage === "hindi" || hintLanguage === "hi" || hintLanguage === "hinglish") {
      const hiMatch = matching.find(f => f.includes(".hi-orig.") || f.includes(".hi."))
      if (hiMatch) chosen = hiMatch
    } else if (hintLanguage === "english" || hintLanguage === "en") {
      const enMatch = matching.find(f => f.includes(".en.") || f.includes(".en-orig."))
      if (enMatch) chosen = enMatch
    }

    const fullPath = path.join(outDir, chosen)
    const raw = await fs.readFile(fullPath, "utf8")
    const parsed = JSON.parse(raw)
    const words = parseJson3ToWords(parsed)
    if (words.length > 0) {
      let lang = "english"
      if (chosen.includes(".gu")) lang = "gujarati"
      else if (chosen.includes(".hi")) lang = "hindi"
      console.log(`[subs] ✅ Extracted ${words.length} words from YouTube subtitles (${chosen}, detected: ${lang})`)
      return { words, language: lang }
    }
  } catch (err) {
    console.warn("[subs] Failed to parse YouTube subtitles:", err.message)
  }
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
  const hintCode = resolveWhisperLang(hintLanguage)
  const audioDur = await getRealDuration(fullAudioPath)

  if (hintCode) {
    detectedLanguage = hintCode
    console.log(`[whisper] Using hint language: ${hintCode} (skip probe, model=${whisperModelFor(hintCode)})`)
  } else {
    let audioLang = await probeAudioLanguage(fullAudioPath, baseStem, baseTransDir, audioDur)
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

  // ── Parallel chunked transcription — many short Whisper passes at once is far
  //    faster wall-clock than one sequential pass over the whole file. ──
  // Smaller chunks + many single-thread workers = much better throughput on a
  // 20-core CPU. Whisper scales poorly per-process (3 threads only ~30% faster
  // than 1), so 12 workers × 1 thread beats 4 workers × 20 threads by ~2×.
  const CHUNK_SEC  = 120
  const os         = require("os")
  const CORES      = os.cpus()?.length || 4
  const coreCap    = CORES >= 12
    ? Math.min(12, Math.round(CORES * 0.6))
    : Math.max(2, Math.min(4, Math.round(CORES / 2)))
  // Each Whisper process needs roughly 0.8–1 GB. This machine has 16 GB total,
  // so a fixed 12 workers can OOM when the browser is open. Scale to the memory
  // actually available, keeping 2 GB headroom for Node/ffmpeg.
  const freeGB     = os.freemem() / 1073741824
  const memCap     = Math.max(2, Math.floor((freeGB - 2) / 0.9))
  const CONCURRENCY = Math.max(2, Math.min(coreCap, memCap, 12))
  const PER_PROC_THREADS = Math.max(1, Math.floor(CORES / CONCURRENCY))
  console.log(`[whisper] ${CONCURRENCY} workers × ${PER_PROC_THREADS} thread(s) (cores=${CORES}, free=${freeGB.toFixed(1)}GB)`)

  const chunks = []
  for (let start = 0; start < audioDur; start += CHUNK_SEC) {
    chunks.push({ index: chunks.length, start, dur: Math.min(CHUNK_SEC, audioDur - start) })
  }
  console.log(`[whisper] Transcribing ${Math.round(audioDur)}s in ${chunks.length} chunk(s), ${CONCURRENCY} parallel...`)

  const transcribeChunk = async (chunk) => {
    const chunkDir = path.join(baseTransDir, `${baseStem}_c${chunk.index}`)
    await fs.mkdir(chunkDir, { recursive: true }).catch(() => {})
    const chunkWav = path.join(chunkDir, `${baseStem}_c${chunk.index}.wav`)
    try {
      await sliceWavChunk(fullAudioPath, chunkWav, chunk.start, chunk.dur)
      const cjson = await runWhisperOnFile(chunkWav, chunkDir, detectedLanguage, whisperModelFor(detectedLanguage), PER_PROC_THREADS)
      return extractWordsFromWhisperJson(cjson, chunk.start)
    } catch (e) {
      console.error(`[whisper] chunk ${chunk.index} failed:`, e.message)
      return []
    } finally {
      await safeDelete(chunkWav).catch(() => {})
      await safeRmdir(chunkDir).catch(() => {})
    }
  }

  const results = new Array(chunks.length)
  let cursor = 0
  const modelName   = whisperModelFor(detectedLanguage)
  const modelCached = fsSync.existsSync(path.join(os.homedir(), ".cache", "whisper", `${modelName}.pt`))
  if (chunks.length > 0 && !modelCached) {
    // First run on this machine: chunk 0 runs ALONE so the model download
    // finishes before the other workers start (parallel processes racing the
    // same download produced silent empty runs on Windows). Once the model is
    // cached, skip the warm-up and fan out immediately — saves 1–2 minutes.
    results[0] = await transcribeChunk(chunks[0])
    console.log(`[whisper] chunk 1/${chunks.length} done (${results[0].length} words) [warm-up]`)
    cursor = 1
  }
  const worker = async () => {
    while (cursor < chunks.length) {
      const my = cursor++
      results[my] = await transcribeChunk(chunks[my])
      console.log(`[whisper] chunk ${my + 1}/${chunks.length} done (${results[my].length} words)`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, chunks.length - cursor)) }, worker))

  await safeDelete(fullAudioPath).catch(() => {})

  let allWords = []
  for (const r of results) if (Array.isArray(r)) allWords = allWords.concat(r)
  allWords.sort((a, b) => a.start - b.start)
  // Drop near-duplicate words that can appear at chunk boundaries.
  allWords = allWords.filter((w, i) => i === 0 || !(Math.abs(w.start - allWords[i - 1].start) < 0.15 && w.word === allWords[i - 1].word))

  if (allWords.length < 10) return null

  // Safety net: if the probe failed (or said English) but Whisper actually
  // produced Indic script, infer the language from the words themselves.
  // This keeps auto mode on the Hinglish/Gujlish path even when the language
  // classifier is wrong about a noisy/musical sample.
  const devCount = allWords.filter(w => hasDevanagari(w.word)).length
  const gujCount = allWords.filter(w => hasGujarati(w.word)).length
  const urdCount = allWords.filter(w => hasUrdu(w.word)).length
  const indicCount = devCount + urdCount
  if (!detectedLanguage) {
    if (gujCount > allWords.length * 0.15) detectedLanguage = "gu"
    else if (indicCount > allWords.length * 0.15) detectedLanguage = "hi"
  } else if (detectedLanguage === "en" && indicCount > allWords.length * 0.2) {
    console.log(`[whisper] Probe said English but ${indicCount}/${allWords.length} words are Devanagari/Urdu → treating as Hindi`)
    detectedLanguage = "hi"
  }

  const hintL = String(hintLanguage || "").toLowerCase()
  const isAuto = !hintLanguage || hintL === "auto"
  let appLanguage = appLangOf(detectedLanguage)
  // Script policy:
  //  • explicit hinglish  → Hindi/Urdu audio in Roman script
  //  • explicit gujlish   → Gujarati audio in Roman script
  //  • auto + Hindi audio → Hinglish (this app's default caption script)
  //  • auto + Gujarati    → Gujlish (Gujarati speech, English letters)
  if (hintL === "hinglish" || hintL === "hi-en" || (isAuto && detectedLanguage === "hi")) {
    appLanguage = "hinglish"
    // Whisper often emits Urdu script for Hindustani speech even when forced
    // to Hindi, so the Roman mode must transliterate BOTH scripts.
    allWords = allWords.map(w => ({ ...w, word: toRomanScript(w.word) }))
  } else if (hintL === "gujlish" || hintL === "gu-en" || hintL === "gujarati-roman" || (isAuto && detectedLanguage === "gu")) {
    appLanguage = "gujlish"
    allWords = allWords.map(w => ({ ...w, word: gujToRoman(w.word) }))
  } else if (hintCode === "hi" && urdCount > 0) {
    // Explicit Hindi (native script): never expose Urdu script to the user.
    console.log(`[whisper] Converting ${urdCount} Urdu-script word(s) to Devanagari for native Hindi captions`)
    allWords = allWords.map(w => hasUrdu(w.word) ? { ...w, word: urduToDevanagari(w.word) } : w)
  }

  console.log(`[whisper] ✅ Transcription complete! Words found: ${allWords.length} (lang=${appLanguage})`)
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

  const hintCode = resolveWhisperLang(hintLanguage)
  const hintL = String(hintLanguage || "").toLowerCase()
  const isAuto = !hintLanguage || hintL === "auto"
  const isHinglish = hintL === "hinglish" || hintL === "hi-en"
  const isGujlish = hintL === "gujlish" || hintL === "gu-en" || hintL === "gujarati-roman"
  const model = whisperModelFor(hintCode || "en", true)

  const args = [
    ...WHISPER_ARGS_PREFIX,
    absClipPath,
    "--model",           model,
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

  console.log(`[whisper-clip] model=${model} lang=${hintCode || "auto"} CMD: ${WHISPER_CMD} ${args.join(" ")}`)

  let resultJson = await runWhisperClipProc(args, clipTransDir)

  // NOTE: We deliberately do NOT re-run forced `--language hi` here anymore.
  // For Hindustani audio Whisper still emits Urdu script when forced to Hindi
  // (verified: 176 Urdu chars, 0 Devanagari), so the re-run doubled clip
  // captioning time without changing the script. Transliteration below handles
  // both Urdu and Devanagari instead.
  await safeRmdir(clipTransDir).catch(() => {})

  if (!resultJson) return null

  let words = extractWordsFromWhisperJson(resultJson, 0)
  const finalLang = resultJson.language || hintCode || "en"
  let appLanguage = appLangOf(finalLang)

  // Script-based safety net: Whisper sometimes labels Hindi/Gujarati speech as
  // English. The actual script in the words is more reliable.
  const devCount = words.filter(w => hasDevanagari(w.word)).length
  const gujCount = words.filter(w => hasGujarati(w.word)).length
  const urdCount = words.filter(w => hasUrdu(w.word)).length
  const indicCount = devCount + urdCount
  if (appLanguage === "english") {
    if (gujCount > words.length * 0.15) appLanguage = "gujarati"
    else if (indicCount > words.length * 0.15) appLanguage = "hindi"
  }

  if (isHinglish || (isAuto && appLanguage === "hindi")) {
    appLanguage = "hinglish"
    words = words.map(w => ({ ...w, word: toRomanScript(w.word) }))
  } else if (isGujlish || (isAuto && appLanguage === "gujarati")) {
    appLanguage = "gujlish"
    words = words.map(w => ({ ...w, word: gujToRoman(w.word) }))
  } else if (hintCode === "hi" && urdCount > 0) {
    // Explicit native Hindi: convert Urdu script to Devanagari.
    words = words.map(w => hasUrdu(w.word) ? { ...w, word: urduToDevanagari(w.word) } : w)
  }

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
  const gu = ["અને","આ","ખૂબ","જરૂરી","છે","કારણ","કે","જ્યારે","તમે","વિચારો","છો","તો","સાચું","આ","છે","કે","કોઈ","નથી","કહેતું","આ","વાત","પણ","મેં","આ","શીખ્યું","જ્યારે","બધું","બદલાઈ","ગયું","આ","તે","પળ","હતી","જ્યારે","મને","અહેસાસ","થયો","કે","જીવન","આ","જ છે","બધાથી","એક","બે","ત્રણ","ચાર","પાંચ","છ","સાત","આઠ","નવ","દસ","વીસ","ત્રીસ","ચાલીસ","પચાસ","આ","તે","કોને","દરેક","કોઈ","બધાને","કંઈક","ખૂબ","થોડું","ખૂબ","વધુ","હમણાં","ફરી","હવે","ફરી"]
  const gujlish = ["ane","aa","khub","jaroori","che","kaaran","ke","jyare","tame","vicharo","cho","to","sachu","aa","che","ke","koi","nathi","kahetu","aa","vaat","pan","mein","aa","shikhyu","jyare","badhu","badlai","gayu","aa","te","pal","hati","jyare","mane","ahesaas","thayo","ke","jivan","aa","j","che","badhathi","ek","be","tran","char","panch","chha","saat","aath","nav","das","bees","trees","chalis","pachas","aa","te","kone","darek","koi","badhane","kaik","khub","thodu","khub","vadhu","hamna","fari","have","fari"]
  const pool = (language === "hindi" || language === "hi") ? hi : (language === "hinglish" || language === "hi-en") ? hinglish : (language === "gujarati" || language === "gu" || language === "guj") ? gu : (language === "gujlish" || language === "gu-en" || language === "gujarati-roman") ? gujlish : en
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
    const pythonCmd = PYTHON_EXE
    const scriptPath = path.resolve(__dirname, "detect_faces.py")
    
    const args = [
      scriptPath,
      "--video", path.resolve(videoPath),
      "--start", startTime.toString(),
      "--duration", duration.toString(),
      "--interval", "0.5"
    ]
    
    console.log(`[face-tracker] Spawning face tracking: ${pythonCmd} ${args.join(" ")}`)
    const proc = spawn(pythonCmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: __dirname, env: WHISPER_ENV })
    
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

  const motionHistory = faceCoords?.motionHistory || [];

  // Determine initial speaker based on motion history in the first 2 seconds
  let initialSpeaker = 'A';
  if (motionHistory.length > 0) {
    const firstSamples = motionHistory.slice(0, 4);
    const leftSum = firstSamples.reduce((s, h) => s + (h.left || 0), 0);
    const rightSum = firstSamples.reduce((s, h) => s + (h.right || 0), 0);
    if (rightSum > leftSum * 1.2 + 0.5) {
      initialSpeaker = 'B';
    }
  }

  const targets = [];
  let currentX = speakerCount === 1 ? xCenter : (initialSpeaker === 'A' ? xLeft : xRight);
  targets.push({ t: 0, x: currentX });

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
  if (!targets || targets.length === 0) return "0";
  if (targets.length === 1) return `${Math.round(targets[0].x || 0)}`;

  // Filter out redundant consecutive targets
  const filtered = [];
  for (const tgt of targets) {
    if (tgt && tgt.x !== undefined && isFinite(tgt.x)) {
      if (!filtered.length || Math.abs(filtered[filtered.length - 1].x - tgt.x) > 25) {
        filtered.push({ t: Math.max(0, tgt.t || 0), x: Math.round(tgt.x) });
      }
    }
  }

  if (filtered.length <= 1) return `${Math.round(filtered[0]?.x || targets[0]?.x || 0)}`;

  // Piecewise if(lt(t, nextT), curX, expr)
  const capped = filtered.slice(-4);
  let expr = `${capped[capped.length - 1].x}`;
  for (let i = capped.length - 2; i >= 0; i--) {
    const curX = capped[i].x;
    const nextT = capped[i + 1].t;
    expr = `if(lt(t,${nextT.toFixed(2)}),${curX},${expr})`;
  }
  return expr;
};

const buildZoomExpression = (targets) => {
  if (!targets || targets.length === 0) return "1";
  const peaks = targets.filter(t => t.z > 1.02).slice(0, 3);
  if (!peaks.length) return "1";
  let expr = "1";
  for (const p of peaks) {
    expr = `if(between(t,${p.t.toFixed(2)},${(p.t + 1.2).toFixed(2)}),${p.z.toFixed(2)},${expr})`;
  }
  return expr;
};

// layoutMode: "smart" (active-speaker pan) | "split" (podcast top/bottom) |
//             "center" (static center 9:16) | "fit" (pad full frame)
// If layoutMode omitted, infer from `layout` (podcast_split→split, portrait→fit, else smart).
const extractClip = (inputPath, outputPath, startTime, clipDuration, videoType, layout = "single", segments = null, layoutMode = null) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, async (err, meta) => {
      if (err) return reject(new Error("ffprobe failed: " + err.message))
      const vs   = (meta.streams || []).find(s => s.codec_type === "video") || {}
      const srcW = vs.width || 1920, srcH = vs.height || 1080
      const TW = 1080, TH = 1920
      const mode = layoutMode || ((layout === "podcast_split" || layout === "split") ? "split" : layout === "portrait" ? "fit" : "smart")
      let vf

      if (mode === "split" || mode === "split_reverse") {
        // Podcast split: top & bottom 1080x960 panes centered on each speaker
        let faceCoords = null
        try { faceCoords = await runFaceTracking(inputPath, startTime, clipDuration) } catch (e) { console.warn("[extractClip:split] face tracking fallback:", e.message) }
        const paneW = 1080, paneH = 960
        // Natural upper-body and face crop: cropH = 75% of srcH (e.g. 810px in 1080p), cropW = cropH * (1080/960) = 911px
        const cropH = Math.min(srcH, Math.max(640, Math.round(srcH * 0.75)))
        const cropW = Math.min(srcW, Math.round(cropH * (paneW / paneH)))
        
        let xLeft = Math.round(srcW * 0.22 - cropW / 2)
        let yLeft = Math.round(srcH * 0.1)
        let xRight = Math.round(srcW * 0.78 - cropW / 2)
        let yRight = Math.round(srcH * 0.1)

        if (faceCoords && faceCoords.speakerCount > 1) {
          xLeft  = Math.max(0, Math.min(srcW - cropW, Math.round(faceCoords.xLeft  - cropW / 2)))
          yLeft  = Math.max(0, Math.min(srcH - cropH, Math.round((faceCoords.yLeft || srcH * 0.35) - cropH * 0.35)))
          xRight = Math.max(0, Math.min(srcW - cropW, Math.round(faceCoords.xRight - cropW / 2)))
          yRight = Math.max(0, Math.min(srcH - cropH, Math.round((faceCoords.yRight || srcH * 0.35) - cropH * 0.35)))
        } else if (faceCoords && faceCoords.xLeft !== undefined) {
          xLeft  = Math.max(0, Math.min(srcW - cropW, Math.round(faceCoords.xLeft - cropW / 2)))
          yLeft  = Math.max(0, Math.min(srcH - cropH, Math.round((faceCoords.yLeft || srcH * 0.35) - cropH * 0.35)))
          xRight = Math.max(0, Math.min(srcW - cropW, Math.round(srcW * 0.78 - cropW / 2)))
          yRight = yLeft
        } else {
          xLeft = Math.max(0, Math.min(srcW - cropW, xLeft)); yRight = Math.max(0, Math.min(srcH - cropH, yRight))
          xRight = Math.max(0, Math.min(srcW - cropW, xRight)); yLeft = Math.max(0, Math.min(srcH - cropH, yLeft))
        }

        if (mode === "split_reverse") {
          vf = [`split=2[L][R]`,`[R]crop=${cropW}:${cropH}:${xRight}:${yRight},scale=${paneW}:${paneH}:flags=lanczos,setsar=1[top]`,`[L]crop=${cropW}:${cropH}:${xLeft}:${yLeft},scale=${paneW}:${paneH}:flags=lanczos,setsar=1[bot]`,`[top][bot]vstack=inputs=2`].join(";")
        } else {
          vf = [`split=2[L][R]`,`[L]crop=${cropW}:${cropH}:${xLeft}:${yLeft},scale=${paneW}:${paneH}:flags=lanczos,setsar=1[top]`,`[R]crop=${cropW}:${cropH}:${xRight}:${yRight},scale=${paneW}:${paneH}:flags=lanczos,setsar=1[bot]`,`[top][bot]vstack=inputs=2`].join(";")
        }
      } else if (mode === "left") {
        let faceCoords = null
        try { faceCoords = await runFaceTracking(inputPath, startTime, clipDuration) } catch (e) {}
        const cw = Math.min(srcW, Math.round(srcH * 9 / 16))
        const xL = faceCoords?.xLeft !== undefined ? Math.round(faceCoords.xLeft - cw / 2) : Math.round(srcW * 0.25 - cw / 2)
        const cx = Math.max(0, Math.min(srcW - cw, xL))
        vf = `crop=${cw}:${srcH}:${cx}:0,scale=${TW}:${TH}:flags=lanczos,setsar=1`
      } else if (mode === "right") {
        let faceCoords = null
        try { faceCoords = await runFaceTracking(inputPath, startTime, clipDuration) } catch (e) {}
        const cw = Math.min(srcW, Math.round(srcH * 9 / 16))
        const xR = faceCoords?.xRight !== undefined ? Math.round(faceCoords.xRight - cw / 2) : Math.round(srcW * 0.75 - cw / 2)
        const cx = Math.max(0, Math.min(srcW - cw, xR))
        vf = `crop=${cw}:${srcH}:${cx}:0,scale=${TW}:${TH}:flags=lanczos,setsar=1`
      } else if (mode === "fit" || layout === "portrait") {
        vf = `split=2[bg][fg];[bg]scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},boxblur=25:12[blurred];[fg]scale=${TW}:-2:flags=lanczos[sharp];[blurred][sharp]overlay=(W-w)/2:(H-h)/2,setsar=1`
      } else if (mode === "center") {
        const cw = Math.min(srcW, Math.round(srcH * 9 / 16))
        const cx = Math.round((srcW - cw) / 2)
        vf = `crop=${cw}:${srcH}:${cx}:0,scale=${TW}:${TH},setsar=1`
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

          if (zoomExpr !== "1") {
            const wExpr = `(${cw})/(${zoomExpr})`
            const hExpr = `(${srcH})/(${zoomExpr})`
            const xExpr = `(${panExpr})+((${cw})-(${cw})/(${zoomExpr}))/2`
            const yExpr = `((${srcH})-(${srcH})/(${zoomExpr}))/2`
            vf = `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}',scale=${TW}:${TH},setsar=1`
          } else {
            vf = `crop=${cw}:${srcH}:'${panExpr}':0,scale=${TW}:${TH},setsar=1`
          }
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
          "-preset", "fast",
          "-crf", "18", "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M", "-movflags", "+faststart",
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
    } else if (/[\u0900-\u097F]/.test(char) || /[\u0A80-\u0AFF]/.test(char)) {
      width += fontSize * 0.6;
    } else {
      width += fontSize * 0.35;
    }
  }
  return Math.round(width);
};

const NUMBER_WORDS = new Set([
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "hundred","thousand","million","billion","trillion","percent","first","second","third",
  "ek","do","teen","char","char","paanch","panch","chheh","saat","aath","nau","das","sau","hazaar",
])

const sanitizeCaptionSegments = (rawSegments) => {
  if (!Array.isArray(rawSegments) || !rawSegments.length) return []
  const cleaned = rawSegments
    .map(s => {
      let w = String(s.word || "").replace(/[{}\\[\\]]/g, "").trim()
      // Guarantee that pure Hindi / Gujarati script is ALWAYS transliterated into Latin Roman (Hinglish / Gujlish)
      if (hasDevanagari(w)) w = devToRoman(w)
      if (hasGujarati(w)) w = gujToRoman(w)
      return {
        word: w,
        start: Number(s.start) || 0,
        end: Number(s.end) || 0
      }
    })
    .filter(s => s.word.length > 0)
  if (!cleaned.length) return []
  cleaned.sort((a, b) => a.start - b.start)

  // Filter out stuttered single consonants (e.g. "K" immediately before "KARNA")
  const deduped = []
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i]
    const next = cleaned[i + 1]
    if (/^[b-df-hj-np-tv-z]$/i.test(cur.word) && next && next.word.toLowerCase().startsWith(cur.word.toLowerCase())) {
      continue
    }
    deduped.push(cur)
  }

  const sanitized = []
  let prevEnd = 0
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i]
    let start = Math.max(cur.start, prevEnd)
    let end = Math.max(cur.end, start + 0.22)
    if (i < deduped.length - 1) {
      const nextRawStart = deduped[i + 1].start
      if (nextRawStart > start) {
        end = Math.min(end, nextRawStart)
      } else {
        end = start + 0.25
      }
    }
    if (end - start > 1.8) end = start + 1.8
    sanitized.push({ word: cur.word, start: +start.toFixed(3), end: +end.toFixed(3) })
    prevEnd = end
  }
  return sanitized
}

const buildAssSubtitles = (rawSegments, videoWidth = 1080, videoHeight = 1920, language = "english", stylePreset = "shortai", selectedFont = null, overrides = {}) => {
  const segments = sanitizeCaptionSegments(rawSegments)
  if (!segments.length) return ""

  const style   = resolveCaptionStyle(stylePreset)
  const ov      = overrides || {}
  const anim    = style.anim || (style.scalePop ? "pop" : "pop")
  const hasDev  = segments.some(w => hasDevanagari(w.word))
  const hasGuj  = segments.some(w => hasGujarati(w.word))

  // Map requested fonts to physical font families installed on the system
  const fontMap = {
    "Bricolage Grotesque": "Bricolage Grotesque 96pt ExtraBold",
    "Montserrat": "Montserrat Bold",
    "Montserrat Bold": "Montserrat Bold",
    "Alex Brush": "Alex Brush",
    "Poppins": "Poppins Bold",
    "Outfit": "Outfit Bold",
  }

  let font = hasDev ? "Noto Sans Devanagari" : hasGuj ? "Noto Sans Gujarati" : (fontMap[style.font] || style.font)
  if (!hasDev && !hasGuj && selectedFont && selectedFont !== "default") {
    font = fontMap[selectedFont] || selectedFont
  }

  // User-editable overrides (text/highlight color, size, position, spacing)
  const fontSize       = ov.fontSize ? Math.round(ov.fontSize) : (style.fontSize || 94)
  const primaryHex     = ov.textColor      || style.primaryColor || "#EDEDE8"
  const highlightHex   = ov.highlightColor || style.highlightColor || "#9DFF4A"
  const letterSpacing  = (hasDev || hasGuj) ? 0 : (ov.letterSpacing != null ? Math.round(ov.letterSpacing) : 1)
  const highlightWords = ov.highlightWords !== false   // default ON
  const posXpct        = ov.positionX != null ? ov.positionX : 50
  const posYpct        = ov.positionY != null ? ov.positionY : (style.position === "center" ? 48 : 76)
  const posX           = Math.round(videoWidth  * posXpct / 100)
  const posY           = Math.round(videoHeight * posYpct / 100)

  const boldFlag = style.bold ? "-1" : "0"
  const italicFlag = style.italic ? "-1" : "0"
  const BOM = "\uFEFF"

  // Colors in ASS format
  const primaryColor   = hexToAss(primaryHex)
  const outlineColor   = hexToAss(style.outlineColor || "#060606")
  const highlightColor = hexToAss(highlightHex)
  const numberColorAss = hexToAss(style.numberColor || "#FFE21F")

  const outline = style.outline !== undefined ? style.outline : 7
  const shadow  = style.shadow !== undefined ? style.shadow : 3

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
Style: S,${font},${fontSize},${primaryColor},&H000000FF,${outlineColor},${bgColor},${boldFlag},${italicFlag},0,0,100,100,${letterSpacing},0,${borderStyle},${outline},${shadow},5,60,60,60,1

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
  const animOf = anim

  // Line-level motion (slide/fade)
  const lineMotion = (x, y) => {
    if (animOf === "slide") return `\\an5\\move(${x},${y - 36},${x},${y},0,180)\\fad(40,20)`
    if (animOf === "fade" || animOf === "typewriter") return `\\an5\\pos(${x},${y})\\fad(70,40)`
    return `\\an5\\pos(${x},${y})`
  }

  const animTagFor = (isNumberWord, isActive, activeColor) => {
    const c = isActive ? activeColor : (isNumberWord ? numberColorAss : primaryColor)
    if (isActive && highlightWords) {
      if (animOf === "discipline") return `{\\fnAlex Brush\\fs${Math.round(fontSize * 1.18)}\\c&H1200E5&\\3c&H000000&\\bord6\\shad4\\fscx110\\fscy110\\t(0,70,\\fscx100\\fscy100)}`
      if (animOf === "crazy") return `{\\c&H008FFF&\\3c&H000000&\\bord7\\shad8\\fscx120\\fscy120\\t(0,70,\\fscx100\\fscy100)}`
      if (animOf === "estate4") return `{\\c&HFFD01C&\\3c&HFFFFFF&\\bord6\\shad6\\fscx112\\fscy112\\t(0,70,\\fscx100\\fscy100)}`
      if (animOf === "pop") return `{\\c${c}&\\3c${outlineColor}&\\fscx112\\fscy112\\t(0,70,\\fscx100\\fscy100)}`
      if (animOf === "bounce") return `{\\c${c}&\\3c${outlineColor}&\\fscx85\\fscy85\\t(0,90,\\fscx124\\fscy124)\\t(90,180,\\fscx104\\fscy104)}`
      if (animOf === "karaoke") return `{\\c${c}&\\3c${outlineColor}&\\bord8\\bs1}`
      if (animOf === "boxed") return `{\\c${c}&\\3c${outlineColor}&\\bord6\\bs1}`
      if (animOf === "neon") return `{\\c${c}&\\3c${highlightColor}&\\shad6\\bord6\\fscx100\\fscy100\\t(0,80,\\fscx114\\fscy114)}`
      if (animOf === "fade" || animOf === "typewriter") return `{\\c${c}&\\3c${outlineColor}&\\fad(50,0)\\fscx95\\fscy95\\t(0,120,\\fscx108\\fscy108)}`
      if (animOf === "slide") return `{\\c${c}&\\3c${outlineColor}&\\fscx95\\fscy95\\t(0,80,\\fscx110\\fscy110)}`
      return `{\\c${c}&\\3c${outlineColor}&\\fscx110\\fscy110\\t(0,70,\\fscx100\\fscy100)}`
    }
    if (animOf === "discipline") return `{\\fnMontserrat Bold\\c${primaryColor}&\\3c${outlineColor}&\\bord6\\shad3}`
    if (animOf === "crazy") return `{\\fnMontserrat Bold\\c${primaryColor}&\\3c${outlineColor}&\\bord6\\shad6}`
    if (animOf === "estate4") return `{\\fnMontserrat Bold\\c${primaryColor}&\\3c${outlineColor}&\\bord6\\shad4}`
    if (animOf === "neon") return `{\\c${c}&\\3c${highlightColor}&\\shad3}`
    return `{\\c${c}&\\3c${outlineColor}&}`
  }

  // Punchy short-form chunking (1-3 words per group, default 2 words)
  const wordsPerGroup = 2
  for (let i = 0; i < segments.length; i += wordsPerGroup) {
    const g = segments.slice(i, i + wordsPerGroup)
    if (!g.length) continue
    const nextG = segments.slice(i + wordsPerGroup, i + 2 * wordsPerGroup)
    const groupEnd = nextG.length ? Math.min(g[g.length - 1].end, nextG[0].start) : g[g.length - 1].end

    for (let wi = 0; wi < g.length; wi++) {
      const cur = g[wi]
      const wStart = (wi === 0) ? cur.start : Math.max(cur.start, g[wi - 1].end)
      let wEnd = (wi < g.length - 1) ? Math.min(g[wi + 1].start, groupEnd) : groupEnd
      if (wEnd <= wStart) wEnd = Math.min(groupEnd, wStart + 0.15)
      if (wEnd <= wStart) continue

      const textParts = []
      for (let idx = 0; idx < g.length; idx++) {
        const w = g[idx]
        let displayWord = w.word
        if (style.uppercase) {
          displayWord = displayWord.toUpperCase()
        }

        const isNumberWord = style.dynamicColor && (/\d/.test(w.word) || NUMBER_WORDS.has(w.word.toLowerCase().replace(/[^\wऀ-ॿ]/g, "")))
        const activeColor = isNumberWord ? numberColorAss : highlightColor

        const tag = animTagFor(isNumberWord, idx === wi && highlightWords, activeColor)
        textParts.push(`${tag}${displayWord}{\\r}`)
      }
      const text = textParts.join(" ")
      lines.push(`Dialogue: 0,${toAss(wStart)},${toAss(wEnd)},S,,0,0,0,,{${lineMotion(posX, posY)}}${text}`)
    }
  }

  return header + lines.join("\n") + "\n"
}

const burnCaptionsAss = async (inputPath, outputPath, segments, language = "english", stylePreset = "shortai", selectedFont = null, overrides = {}) => {
  const assPath = path.join("uploads", `caps_${path.basename(outputPath, ".mp4")}.ass`)
  const dims = await new Promise(resolve => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      const vs = (meta?.streams || []).find(s => s.codec_type === "video") || {}
      resolve({ w: vs.width || 1080, h: vs.height || 1920 })
    })
  })
  
  const sanitized = sanitizeCaptionSegments(segments)
  let assContent = ""
  try {
    const spec = captionEngine.resolveTemplate(stylePreset, {
      width: dims.w,
      height: dims.h,
      overrides: {
        ...overrides,
        ...(selectedFont && selectedFont !== "default" ? { fontFamily: selectedFont } : {})
      }
    })
    assContent = captionEngine.buildAss(spec, sanitized, { width: dims.w, height: dims.h })
  } catch (err) {
    console.warn(`[captions] captionEngine failed for ${stylePreset}, falling back to buildAssSubtitles:`, err.message)
    assContent = buildAssSubtitles(sanitized, dims.w, dims.h, language, stylePreset, selectedFont, overrides)
  }
  await fs.writeFile(assPath, assContent, "utf8")
  
  const fontsDir = path.resolve(__dirname, "fonts")
  const fontsDirSafe = fontsDir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:")
  
  return new Promise((resolve, reject) => {
    const safe = path.resolve(assPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:")
    ffmpeg(inputPath).output(outputPath)
      .videoCodec("libx264").audioCodec("copy")
      .outputOptions([
        "-vf", `ass='${safe}':fontsdir='${fontsDirSafe}'`,
        "-preset", "fast",
        "-crf", "18", "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M", "-movflags", "+faststart",
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
  const isGujlish = lang === "gujlish" || lang === "gu-en" || lang === "gujarati-roman"
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
  const pool = (isHinglish || isGujlish) ? (hinglish[type] || hinglish.general) : isHindi ? (hi[type] || hi.general) : (lang === "gujarati" || lang === "gu" ? (hi[type] || hi.general) : (en[type] || en.general))
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3)
}

const detectVideoTypeAndLanguage = (videoInfo) => {
  const t   = (videoInfo.title||"").toLowerCase()
  const d   = (videoInfo.description||"").toLowerCase()
  const c   = (videoInfo.uploader||"").toLowerCase()
  const has = (...kws) => kws.some(k => t.includes(k)||d.includes(k)||c.includes(k))
  const hasDevanagari   = !!(videoInfo.title||"").match(/[ऀ-ॿ]/) || !!(videoInfo.description||"").match(/[ऀ-ॿ]/)
  const hasGuj          = !!(videoInfo.title||"").match(/[઀-૿]/) || !!(videoInfo.description||"").match(/[઀-૿]/)
  const hasHindiKeyword = has("hindi","हिंदी","हिन्दी","hinglish","#hindi","#hinglish","desi")
  const hasEnglishKeyword = has("english","#english")
  const hasGujKeyword = has("gujarati","ગુજરાત","ગુજરાતી","#gujarati")
  const language = hasGuj || hasGujKeyword ? "gujarati" : hasDevanagari || hasHindiKeyword ? (hasEnglishKeyword ? "english" : "hindi") : "english"
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
    moments.push({ id: uuidv4(), startTime: st, endTime: et, duration: et - st, viralScore: Math.min(98, h.hookScore + 5), title: "AI Hook Moment", reason: "Audio energy peak", pattern: "ai-hook", quality: "1080p", videoType, language, minStartTime: 0, maxEndTime: duration, originalStart: st, originalEnd: et })
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
        moments.push({ id: uuidv4(), startTime: st, endTime: et, duration: et - st, viralScore: Math.min(97, 55 + Math.floor(Math.random() * 38)), title: titlePool[i % titlePool.length], reason: reasonPool[Math.floor(Math.random() * reasonPool.length)], pattern: "segment", quality: "1080p", videoType, language, minStartTime: 0, maxEndTime: duration, originalStart: st, originalEnd: et })
        used.push({ start: st, end: et }); placed = true; break
      }
      if (!placed) {
        const st = Math.round(segStart + segLen / 2)
        const et = Math.round(Math.min(duration - 5, st + 25))
        if (et - st >= 8) {
          const titlePool = CLIP_TITLES[videoType] || CLIP_TITLES.general
          moments.push({ id: uuidv4(), startTime: st, endTime: et, duration: et - st, viralScore: 62, title: titlePool[i % titlePool.length], reason: "Segment coverage", pattern: "fill", quality: "1080p", videoType, language, minStartTime: 0, maxEndTime: duration, originalStart: st, originalEnd: et })
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
  const resolvedOut = path.resolve(outputPath)
  const outDir = path.dirname(resolvedOut)
  try { await fs.mkdir(outDir, { recursive: true }) } catch {}

  // Reuse existing raw clip section if already downloaded and valid (>500KB)
  try {
    const st = await fs.stat(resolvedOut)
    if (st.size > 500 * 1024) {
      console.log(`[dl-section] Reusing existing raw video section on disk (${Math.round(st.size / 1024)} KB): ${resolvedOut}`)
      return
    }
  } catch {}

  // Find ffmpeg directory for yt-dlp muxer
  let ffDir = null
  try {
    const which = require("which")
    const ffExe = which.sync("ffmpeg")
    if (ffExe) ffDir = path.dirname(ffExe)
  } catch {}

  const baseArgs = [
    "--no-playlist",
    "--force-overwrites",
    "--no-part",
    "--retries", "10",
    "--socket-timeout", "45",
    "--format-sort", "res,fps,ext:mp4:m4a",
    "--js-runtimes", "node",
  ]
  if (ffDir) {
    baseArgs.push("--ffmpeg-location", ffDir)
  }

  const runYtDlp = (formatStr) => {
    const args = [
      ...baseArgs,
      "--download-sections", `*${Math.floor(start)}-${Math.ceil(end)}`,
      "-f", formatStr,
      "--merge-output-format", "mp4",
      "-o", resolvedOut,
      url
    ]
    console.log(`[dl-section] CMD: ${binary} ${args.join(" ")}`)
    return new Promise((resolve, reject) => {
      const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], cwd: __dirname })
      let stderr = ""
      proc.stderr.on("data", d => stderr += d.toString())
      const timer = setTimeout(() => { proc.kill(); reject(new Error("Timeout downloading section from YouTube")) }, 120000)
      proc.on("close", (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else {
          console.error(`[dl-section] Failed exit ${code}: ${stderr.slice(-300)}`)
          reject(new Error(`Exit code ${code}: ${stderr.slice(-300)}`))
        }
      })
      proc.on("error", reject)
    })
  }

  const F1080 = "bestvideo*[height=1080]+bestaudio/bestvideo*[height<=1080]+bestaudio/best[height=1080]/best[height<=1080]/best"
  try {
    await runYtDlp(F1080)
  } catch (err) {
    console.warn("[dl-section] Primary 1080p format failed, trying robust fallback:", err.message)
    try {
      await runYtDlp("bestvideo*+bestaudio/best[height<=1080]/best")
    } catch (err2) {
      console.warn("[dl-section] Direct section download failed, trying stream URL fallback...", err2.message)
      const { execSync } = require("child_process")
      const sUrl = execSync(`"${binary}" --js-runtimes node -g -f "best[height<=1080]/best" "${url}"`, { timeout: 25000 }).toString().trim().split("\n")[0]
      if (!sUrl) throw new Error("Could not fetch stream URL")
      await new Promise((res, rej) => {
        ffmpeg(sUrl)
          .setStartTime(start)
          .setDuration(end - start)
          .output(resolvedOut)
          .videoCodec("libx264")
          .audioCodec("aac")
          .outputOptions(["-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p"])
          .on("end", res)
          .on("error", rej)
          .run()
      })
    }
  }
}

const processClipsInParallel = async (videoPath, moments, sessionId, userId, videoType, videoInfo, layout, fullTranscript, sessionLanguage, defaultLayoutMode = "smart") => {
  const clips = [], BATCH = 8
  const { exists: vidExists } = await verifyFile(videoPath, 0.05)
  let streamUrl = null
  if (!vidExists && videoInfo?.url) {
    try {
      const binary = findYtDlpBinary ? findYtDlpBinary() : "yt-dlp"
      const { execSync } = require("child_process")
      console.log("[thumb] Fetching fast stream URL for per-clip unique thumbnails...")
      const out = execSync(`"${binary}" --js-runtimes node -g -f "best[height<=720]/best" "${videoInfo.url}"`, { timeout: 20000 })
      streamUrl = out.toString().trim().split("\n")[0]
      console.log("[thumb] Got stream URL successfully")
    } catch (e) {
      console.warn("[thumb] Could not fetch stream URL for thumbnails:", e.message)
    }
  }

  for (let i = 0; i < moments.length; i += BATCH) {
    const batch = moments.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (moment, bi) => {
      const thumbPath = `uploads/thumbnails/${moment.id}.jpg`
      try {
        if (vidExists) {
          await generateThumbnail(videoPath, thumbPath, moment.startTime + 1)
        } else if (streamUrl) {
          try {
            await new Promise((res, rej) => {
              const { exec } = require("child_process")
              const targetPath = path.resolve(thumbPath)
              exec(`ffmpeg -ss ${Math.max(1, Math.round(moment.startTime + 1))} -i "${streamUrl}" -frames:v 1 -update 1 -q:v 2 "${targetPath}" -y`, { timeout: 15000 }, (err) => {
                if (err) rej(err)
                else res()
              })
            })
          } catch (e) {
            console.warn(`[thumb] Frame extraction fallback for clip ${moment.id}:`, e.message)
            if (videoInfo?.thumbnail) {
              try {
                const resp = await axios.get(videoInfo.thumbnail, { responseType: "arraybuffer", timeout: 8000 })
                await fs.writeFile(thumbPath, resp.data)
              } catch {}
            }
          }
        } else if (videoInfo?.thumbnail) {
          try {
            const resp = await axios.get(videoInfo.thumbnail, { responseType: "arraybuffer", timeout: 8000 })
            await fs.writeFile(thumbPath, resp.data)
          } catch {}
        }
        const clipLang    = sessionLanguage || moment.language || "english"
        let captionSegments, hasRealCaptions
        let transcriptText = ""
        if (moment.transliteratedSegs && moment.transliteratedSegs.length) {
          captionSegments = moment.transliteratedSegs
          hasRealCaptions = true
          transcriptText  = captionSegments.map(s => s.word).join(" ")
        } else if (fullTranscript) {
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

        const isAi = moment.pattern === "ai"
        const genTitles = generateViralTitles(videoInfo, { ...moment, language: clipLang })
        const viralTitles = isAi && moment.title ? [moment.title, ...genTitles].slice(0, 4) : genTitles
        const displayTitle = isAi && moment.title ? moment.title : `${moment.title} – ${moment.reason}`
        const ts = Date.now() + bi
        return {
          id: moment.id, title: displayTitle, viralTitles,
          description: moment.description || "", hashtags: moment.hashtags || [], aiReason: moment.reason || "",
          startTime: moment.startTime, endTime: moment.endTime, duration: moment.duration,
          viralScore: moment.viralScore,
          thumbnail: `/uploads/thumbnails/${moment.id}.jpg`, videoUrl: `/uploads/clips/${moment.id}.mp4`,
          videoUrlFresh: `/uploads/clips/${moment.id}.mp4?v=${ts}`,
          quality: "1080p", videoType: moment.videoType, language: clipLang,
          minStartTime: moment.minStartTime, maxEndTime: moment.maxEndTime,
          originalStart: moment.originalStart, originalEnd: moment.originalEnd,
          canExtend: true, canCut: true, isAiHook: moment.pattern === "ai-hook",
          hasCaptions: false, captionSegments, hasRealCaptions,
          layoutMode: defaultLayoutMode || ((layout === "podcast_split" || layout === "split") ? "split" : "smart"),
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
  if (dbReady && userId && User && clips.length)
    User.findByIdAndUpdate(userId, { $inc: { videosProcessed: 1, clipsGenerated: clips.length } }).catch(() => {})
  return clips
}

const processVideoInBackground = async (sessionId, url) => {
  const session   = processingSessions.get(sessionId)
  const fpsession = session || {}
  const videoPath = `uploads/videos/${sessionId}.mp4`
  const emit = (step, pct, status) => {
    session.currentStep = step; session.progress = pct
    if (status) session.status = status
    io.emit("progress", { sessionId, ...session })
  }
  try {
    emit("🔍 Fetching metadata…", 2, "analysing")
    let videoInfo = {}
    try { videoInfo = await youtubedl(url, { dumpSingleJson: true, noDownload: true, noPlaylist: true, extractorArgs: "youtube:player_client=web,android,ios" }) }
    catch (e) { console.warn("Metadata fetch failed:", e.message) }

    const detected = detectVideoTypeAndLanguage(videoInfo)
    const videoType = detected.videoType
    // "auto" must probe the AUDIO, not guess from title/description text —
    // metadata is usually English even for Hindi/Gujarati videos, which is why
    // auto-detect kept forcing English captions.
    let hintLanguage = session?.languageHint
    if (!hintLanguage || hintLanguage === "auto") hintLanguage = null
    let resolvedLanguage = hintLanguage || detected.language

    // ── 1. Fast Subtitle Extraction from YouTube (takes seconds) ──
    emit("📝 Checking video subtitles…", 3, "analysing")
    let fullTranscript = null
    try {
      const subRes = await fetchYouTubeSubtitles(url, sessionId, hintLanguage)
      if (subRes?.words?.length) {
        fullTranscript   = subRes.words
        resolvedLanguage = hintLanguage || subRes.language || resolvedLanguage
        console.log(`[pipeline] ✅ Subtitles found on YouTube: ${fullTranscript.length} words, lang=${resolvedLanguage}`)
      }
    } catch (e) {
      console.warn("[pipeline] Fast subtitle check skipped:", e.message)
    }

    let duration = videoInfo.duration || 300
    let layout = "smart"
    let finalHooks = []

    // If video is short (<= 10 mins) or if YouTube subtitles were not found, download full video
    const shouldDownloadFull = !fullTranscript || duration <= 600
    if (shouldDownloadFull) {
      emit("⬇️ Downloading…", 8, "downloading")
      const dl = await downloadVideo(url, videoPath, { onProgress: (msg, pct) => emit(msg, pct) })
      emit("📐 Analyzing video…", 22)
      const [realDur, detectedLay, audioHooks] = await Promise.all([
        getRealDuration(videoPath).then(d => (d < 60 && duration > d ? duration : d || duration)),
        detectLayout(videoPath),
        detectAudioHooks(videoPath, duration),
      ])
      duration = realDur
      layout = session?.layoutHint || detectedLay || "smart"
      finalHooks = audioHooks
    } else {
      console.log(`[pipeline] ⚡ Fast section mode active for long video (${Math.round(duration/60)} min) with subtitles`)
      layout = session?.layoutHint || "smart"
    }

    // ── Full transcription fallback (only if YouTube subtitles missing) ──
    if (!fullTranscript && shouldDownloadFull) {
      try {
        emit("📝 Transcribing audio with Whisper…", 26, "transcribing")
        const tr = await transcribeWithWhisper(videoPath, hintLanguage)
        if (tr?.words?.length) {
          fullTranscript   = tr.words
          resolvedLanguage = tr.detectedLanguage || resolvedLanguage
          console.log(`[pipeline] Whisper transcript ready: ${tr.words.length} words, lang=${resolvedLanguage}`)
        } else {
          console.warn("[pipeline] Transcription empty — captions will use placeholders")
        }
      } catch (e) {
        console.error("[pipeline] Transcription failed:", e.message)
      }
    }

    // ── AI clip selection (Google AI Studio Gemini) with heuristic fallback ──
    emit("🤖 AI analyzing viral moments with Google Gemini…", 30, "analysing")
    let moments = null
    try {
      moments = await analyzeTranscriptForClips(fullTranscript, {
        title: videoInfo.title,
        description: videoInfo.description,
        chapters: videoInfo.chapters,
        videoType,
        language: resolvedLanguage,
        duration,
      })
    } catch (e) {
      console.error("[pipeline] Gemini AI analysis failed, falling back:", e.message)
    }
    let usedAi = Array.isArray(moments) && moments.length > 0
    if (!usedAi) {
      console.log("[pipeline] Using heuristic clip planner (no AI results)")
      moments = detectSmartMoments(duration, videoType, resolvedLanguage, videoInfo, finalHooks)
    } else {
      console.log(`[pipeline] ✅ AI selected ${moments.length} viral clips`)
    }

    // Automatically transliterate Hindi/Gujarati into Latin Roman script (Hinglish / Gujlish) as requested
    const hasDevTranscript = fullTranscript?.some(w => hasDevanagari(w.word))
    const hasGujTranscript = fullTranscript?.some(w => hasGujarati(w.word))
    const isGuj = resolvedLanguage === "gujlish" || resolvedLanguage === "gujarati" || resolvedLanguage === "gu" || hasGujTranscript
    const isHi  = resolvedLanguage === "hinglish" || resolvedLanguage === "hindi" || resolvedLanguage === "hi" || hasDevTranscript
    const translitTarget = isGuj ? "gujlish" : (isHi ? "hinglish" : null)

    if (translitTarget && fullTranscript && moments?.length) {
      emit(`🔤 Transliterating top captions to ${translitTarget === "gujlish" ? "Gujlish" : "Hinglish"} with Google Gemini…`, 33)
      // Transliterate top moments upfront in small batches to respect RPM limits;
      // remaining clips are transliterated on demand when clicked/previewed in /api/add-captions
      const upfrontMoments = moments.slice(0, 6)
      console.log(`[pipeline] 🔤 Transliterating top ${upfrontMoments.length} moments to ${translitTarget}...`)
      for (const m of upfrontMoments) {
        const segs = sliceTranscript(fullTranscript, m.startTime, m.endTime)
        if (segs?.length) {
          try {
            m.transliteratedSegs = await transliterateWordsWithGemini(segs, translitTarget)
          } catch (e) {
            console.warn(`[translit] Failed for moment ${m.id}:`, e.message)
          }
        }
        await new Promise(r => setTimeout(r, 200))
      }
      resolvedLanguage = translitTarget
    }

    session.totalSteps = moments.length; session.completedSteps = 0

    emit(`📸 Generating clip screenshots…`, 35, "extracting")
    const clipsRaw = await processClipsInParallel(
      videoPath, moments, sessionId, session.userId,
      videoType, videoInfo, layout, fullTranscript, resolvedLanguage,
      session?.layoutHint || ((layout === "podcast_split" || layout === "split") ? "split" : "smart")
    )

    // Attach AI metadata (description / hashtags) from each moment onto its clip.
    const momentById = new Map(moments.map(m => [m.id, m]))
    const clips = clipsRaw.map(clip => {
      const m = momentById.get(clip.id) || {}
      return {
        ...clip,
        language: resolvedLanguage,
        description: m.description || clip.description || "",
        hashtags: m.hashtags || clip.hashtags || [],
        aiReason: m.reason || clip.reason || "",
      }
    })

    session.videoInfo = {
      title: videoInfo.title || "YouTube Video", duration, originalUrl: url,
      language: resolvedLanguage, videoType,
      quality: (typeof dl !== "undefined" && dl?.quality) || "1080p", fileSize: (typeof dl !== "undefined" && dl?.size) || 0, layout,
      hasRealCaptions: !!fullTranscript,
      aiSelected: usedAi,
      originalVideoPath: videoPath,
      fullTranscript,
    }
    session.status      = "completed"
    session.progress    = 100
    session.currentStep = `✅ ${clips.length} clips ready!`
    session.clips       = clips
    io.emit("progress", { sessionId, ...session })
    await saveSessionsToCache()

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
  const { url, language, languageHint, layout, layoutHint } = req.body || {}
  if (!url) return res.status(400).json({ success: false, error: "YouTube URL required" })
  const sessionId = uuidv4()
  let userId = null
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")
    if (token) { const jwt = require("jsonwebtoken"); userId = jwt.verify(token, process.env.JWT_SECRET || "secret").userId }
  } catch {}
  const langHint = language || languageHint || "auto"
  const layHint = layout || layoutHint || "smart"
  processingSessions.set(sessionId, { url, userId, languageHint: langHint, layoutHint: layHint, status: "starting", progress: 0, currentStep: "Starting…", totalSteps: 0, completedSteps: 0 })
  res.json({ success: true, sessionId })
  processVideoInBackground(sessionId, url)
})

// ── ADD CAPTIONS — accepts captionStyle + layoutMode ────────────────────────
app.post("/api/add-captions/:clipId", async (req, res) => {
  try {
    const { clipId } = req.params
    const { sessionId, captionStyle = "hormozi1", selectedFont = null, overrides = {}, layoutMode } = req.body || {}
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found" })
    const clip = session.clips?.find(c => c.id === clipId)
    if (!clip)  return res.status(404).json({ success: false, error: "Clip not found" })
    if (layoutMode) clip.layoutMode = layoutMode

    // Encode the editable overrides into the filename so each customization is
    // cached separately (and a fresh look never serves a stale burn).
    const ov = overrides || {}
    const ovParts = [
      ov.textColor, ov.highlightColor, ov.fontSize, ov.positionX, ov.positionY,
      ov.letterSpacing, ov.highlightWords === false ? "nohl" : null, selectedFont,
    ].filter(v => v !== undefined && v !== null && v !== "")
    const ovKey = ovParts.length
      ? "_" + require("crypto").createHash("md5").update(ovParts.join("|")).digest("hex").slice(0, 8)
      : ""

    const src        = `uploads/clips/${clipId}.mp4`
    const dest       = `uploads/clips/${clipId}_captioned_${captionStyle}${ovKey}.mp4`
    const legacyDest = `uploads/clips/${clipId}_captioned.mp4`

    if ((await verifyFile(dest, 0.1)).exists) {
      try { await fs.copyFile(dest, legacyDest) } catch {}
      return res.json({
        success: true,
        videoUrl: `/uploads/clips/${clipId}_captioned_${captionStyle}${ovKey}.mp4?v=${Date.now()}`,
        cached: true,
        isReal: clip.hasRealCaptions || false,
        language: clip.language || session.videoInfo?.language || "english",
        style: captionStyle,
        captionSegments: clip.captionSegments || [],
        viralTitles: clip.viralTitles || [],
      })
    }

    const clipLang = clip.language || session.videoInfo?.language || "english"

    // Key by clip + style + overrides. Two styles can be requested at the same
    // time (user switches preset while the first burn is running); joining the
    // wrong promise used to return a URL for a file that did not exist yet and
    // showed up as a black preview.
    const capKey = `${clipId}_${captionStyle}${ovKey}`
    let captionPromise = activeCaptionings.get(capKey)
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
              const { exists: origExists } = await verifyFile(origPath, 0.5)
              if (!origExists) {
                console.log(`[captions] Original video not on disk. Downloading section directly from YouTube at 1080p...`)
                const rawSec = `uploads/clips/raw_${clipId}.mp4`
                await downloadSectionFromYoutube(session.url, clip.startTime, clip.startTime + clip.duration, rawSec)
                await extractClip(rawSec, src, 0, clip.duration, session.videoInfo?.videoType, session.videoInfo?.layout, clip.captionSegments, clip.layoutMode || "smart")
                await safeDelete(rawSec)
              } else {
                await extractClip(origPath, src, clip.startTime, clip.duration, session.videoInfo?.videoType, session.videoInfo?.layout, clip.captionSegments, clip.layoutMode || "smart")
              }
            }
          })()
          activeExtractions.set(clipId, extractPromise)
          extractPromise.finally(() => activeExtractions.delete(clipId)).catch(() => {})
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

        let segs = clip.captionSegments || []
        let currentClipLang = clip.language || clipLang
        const hasDevSegs = segs.some(w => hasDevanagari(w.word))
        const hasGujSegs = segs.some(w => hasGujarati(w.word))
        if (hasDevSegs || hasGujSegs || currentClipLang === "hindi" || currentClipLang === "gujarati") {
          const target = (hasGujSegs || currentClipLang === "gujarati") ? "gujlish" : "hinglish"
          try {
            console.log(`[captions] Transliterating ${segs.length} words to ${target} with Gemini...`)
            segs = await transliterateWordsWithGemini(segs, target)
            clip.captionSegments = segs
            clip.language = target
            currentClipLang = target
          } catch (e) {
            console.warn(`[captions] Transliteration error:`, e.message)
          }
        }
        
        // Groq title updates removed as requested

        console.log(`[captions] Burning ${clipId} | lang: ${currentClipLang} | style: ${captionStyle} | font: ${selectedFont || "default"} | segs: ${segs.length}${ovKey ? " | custom" : ""}`)
        await burnCaptionsAss(src, dest, segs, currentClipLang, captionStyle, selectedFont, ov)

        if (!(await verifyFile(dest, 0.1)).exists) throw new Error("Caption render failed")
        try { await fs.copyFile(dest, legacyDest) } catch {}
        try {
          const rootDest = path.resolve(__dirname, "../uploads/clips", path.basename(dest))
          await fs.copyFile(dest, rootDest)
        } catch {}
      })()
      activeCaptionings.set(capKey, captionPromise)
      captionPromise.finally(() => activeCaptionings.delete(capKey)).catch(() => {})
    }
    await captionPromise

    res.json({
      success: true,
      videoUrl: `/uploads/clips/${clipId}_captioned_${captionStyle}${ovKey}.mp4?v=${Date.now()}`,
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
  const isCaptioned = clipId.includes("_captioned")
  const actualClipId = isCaptioned ? clipId.replace(/_captioned.*$/, "") : clipId

  try {
    const match = await findClipAndSession(actualClipId)
    if (!match) return res.status(404).json({ success: false, error: "Clip context not found" })
    const origPath = match.session.videoInfo?.originalVideoPath || `uploads/videos/${match.sessionId}.mp4`
    const cleanPath = `uploads/clips/${actualClipId}.mp4`

    let servePath = cleanPath
    let downloadFilename = `ShortAI_${actualClipId}_1080p.mp4`

    if (isCaptioned) {
      const clipLang = match.clip.language || match.session.videoInfo?.language || "english"
      const style = req.query.style || match.clip.captionStyle || "shortai"
      const styleOk = CAPTION_STYLE_PRESETS[style] ? style : "shortai"
      const ov = {}
      if (req.query.textColor) ov.textColor = req.query.textColor
      if (req.query.highlightColor) ov.highlightColor = req.query.highlightColor
      if (req.query.fontSize) ov.fontSize = Number(req.query.fontSize)
      if (req.query.positionX != null) ov.positionX = Number(req.query.positionX)
      if (req.query.positionY != null) ov.positionY = Number(req.query.positionY)
      if (req.query.letterSpacing != null) ov.letterSpacing = Number(req.query.letterSpacing)
      if (req.query.highlightWords != null) ov.highlightWords = req.query.highlightWords !== "false"
      const font = req.query.font || null
      const ovParts = [ov.textColor, ov.highlightColor, ov.fontSize, ov.positionX, ov.positionY, ov.letterSpacing, ov.highlightWords === false ? "nohl" : null, font].filter(v => v !== undefined && v !== null && v !== "")
      const ovKey = ovParts.length ? "_" + require("crypto").createHash("md5").update(ovParts.join("|")).digest("hex").slice(0, 8) : ""
      const dest = `uploads/clips/${actualClipId}_captioned_${styleOk}${ovKey}.mp4`
      const layoutMode = req.query.layout || match.clip.layoutMode || "smart"

      servePath = dest
      downloadFilename = `ShortAI_${actualClipId}_${styleOk}_1080p.mp4`

      const { exists: destExists } = await verifyFile(dest, 0.05)
      if (!destExists) {
        console.log(`[download-captions] ${dest} not found, generating on demand...`)
        // 1. Ensure clean clip exists
        const { exists: cleanExists } = await verifyFile(cleanPath, 0.05)
        if (!cleanExists) {
          const { exists: origExists } = await verifyFile(origPath, 0.5)
          if (!origExists) {
            console.log(`[download-clean] Original video file ${origPath} expired/missing. Downloading section directly from YouTube...`)
            const rawSec = `uploads/clips/raw_${actualClipId}.mp4`
            await downloadSectionFromYoutube(match.session.url, match.clip.startTime, match.clip.startTime + match.clip.duration, rawSec)
            await extractClip(rawSec, cleanPath, 0, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments, layoutMode)
            await safeDelete(rawSec)
          } else {
            await extractClip(origPath, cleanPath, match.clip.startTime, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments, layoutMode)
          }
        }

        // 2. Ensure real captions exist
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

        // 3. Burn captions with requested style and overrides!
        let segs = match.clip.captionSegments || []
        let currentClipLang = match.clip.language || clipLang
        const hasDevSegs = segs.some(w => hasDevanagari(w.word))
        const hasGujSegs = segs.some(w => hasGujarati(w.word))
        if (hasDevSegs || hasGujSegs || currentClipLang === "hindi" || currentClipLang === "gujarati") {
          const target = (hasGujSegs || currentClipLang === "gujarati") ? "gujlish" : "hinglish"
          try {
            console.log(`[download-captions] Transliterating ${segs.length} words to ${target} with Gemini...`)
            segs = await transliterateWordsWithGemini(segs, target)
            match.clip.captionSegments = segs
            match.clip.language = target
            currentClipLang = target
          } catch (e) {
            console.warn(`[download-captions] Transliteration error:`, e.message)
          }
        }
        console.log(`[download-captions] Burning ${actualClipId} style=${styleOk} for download...`)
        await burnCaptionsAss(cleanPath, dest, segs, currentClipLang, styleOk, font, ov)
        if (!(await verifyFile(dest, 0.05)).exists) throw new Error("Caption render failed")
      }
    } else {
      // Clean non-captioned clip
      const { exists: cleanExists } = await verifyFile(cleanPath, 0.05)
      if (!cleanExists) {
        const { exists: origExists } = await verifyFile(origPath, 0.5)
        if (!origExists) {
          console.log(`[download-clean] Original video missing. Downloading section directly from YouTube...`)
          const rawSec = `uploads/clips/raw_${actualClipId}.mp4`
          await downloadSectionFromYoutube(match.session.url, match.clip.startTime, match.clip.startTime + match.clip.duration, rawSec)
          await extractClip(rawSec, cleanPath, 0, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments, match.clip.layoutMode || "smart")
          await safeDelete(rawSec)
        } else {
          await extractClip(origPath, cleanPath, match.clip.startTime, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments, match.clip.layoutMode || "smart")
        }
      }
      servePath = cleanPath
    }

    await fs.access(servePath)
    res.download(servePath, downloadFilename)
  } catch (err) {
    console.error("[download] Error:", err.message)
    res.status(500).json({ success: false, error: "Download failed: " + err.message })
  }
})

app.post("/api/extend-cut-clip", async (req, res) => {
  let tempPath = null
  try {
    const { clipId, newStartTime, newEndTime, sessionId, layoutMode } = req.body
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
    const origClip0    = session.clips?.find(c => c.id === clipId)
    const effMode      = layoutMode || origClip0?.layoutMode || ((layout === "podcast_split" || layout === "split") ? "split" : "smart")
    
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

    await extractClip(origPath, `uploads/clips/${newId}.mp4`, clampedStart, dur, videoType, layout, captionSegments, effMode)
    if (!(await verifyFile(`uploads/clips/${newId}.mp4`, 0.05)).exists) throw new Error("Clip extraction failed")
    
    // Clean up temporary section file if downloaded
    if (tempPath) {
      await safeDelete(tempPath).catch(() => {})
      tempPath = null
    }

    await generateThumbnail(origPath, `uploads/thumbnails/${newId}.jpg`, clampedStart + 1)
    if (dbReady && session.userId && User) User.findByIdAndUpdate(session.userId, { $inc: { clipsGenerated: 1 } }).catch(() => {})
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
      captionSegments, hasRealCaptions, layoutMode: effMode,
      minStartTime: 0, maxEndTime: totalDur,
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

// ── SAFE RANGE STREAMING ─────────────────────────────────────────────────────
// Browsers sometimes request a byte range beyond the current file (stale
// metadata after a clip is re-extracted at a different length). Writing 206
// headers before validating used to throw ERR_HTTP_HEADERS_SENT and crash the
// whole server. This helper clamps every range, answers 416 for impossible
// offsets, and destroys the socket on stream errors instead of throwing.
const streamVideoFile = async (req, res, filePath) => {
  let size
  try { size = (await fs.stat(filePath)).size }
  catch { return res.status(404).json({ success: false, error: "Video file not found or expired" }) }

  res.setHeader("Accept-Ranges", "bytes")
  res.setHeader("Content-Type", "video/mp4")
  res.setHeader("Cache-Control", "no-cache")

  const range = req.headers.range
  if (!range) {
    res.setHeader("Content-Length", size); res.writeHead(200)
    const s = fsSync.createReadStream(filePath)
    s.on("error", () => { try { res.destroy() } catch {} })
    return s.pipe(res)
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!m) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end() }
  let start = m[1] === "" ? null : parseInt(m[1], 10)
  let end   = m[2] === "" ? null : parseInt(m[2], 10)
  if (start === null && end === null) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end() }
  if (start === null) { start = Math.max(0, size - end); end = size - 1 }   // suffix range
  if (start >= size || start < 0) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end() }
  end = end === null ? Math.min(start + 1024 * 1024, size - 1) : Math.min(end, size - 1)
  if (end < start) end = size - 1

  res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 })
  const s = fsSync.createReadStream(filePath, { start, end })
  s.on("error", () => { try { res.destroy() } catch {} })
  s.pipe(res)
}

app.get("/api/preview-original/:sessionId", async (req, res) => {
  try {
    const session = processingSessions.get(req.params.sessionId)
    const p = session?.videoInfo?.originalVideoPath || `uploads/videos/${req.params.sessionId}.mp4`
    await streamVideoFile(req, res, p)
  } catch {
    if (!res.headersSent) res.status(404).json({ success: false, error: "Original video file not found or expired" })
  }
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
            await extractClip(origPath, p, match.clip.startTime, match.clip.duration, match.session.videoInfo?.videoType, match.session.videoInfo?.layout, match.clip.captionSegments, match.clip.layoutMode || "smart")
          }
        }
      })()
      activeExtractions.set(clipId, extractPromise)
      extractPromise.finally(() => activeExtractions.delete(clipId)).catch(() => {})
    }
    await extractPromise

    await streamVideoFile(req, res, p)
  } catch (err) {
    console.error("[preview] Error:", err.message)
    if (!res.headersSent) res.status(404).json({ success: false, error: err.message || "Clip not found" })
  }
})

app.get("/api/health", (_, res) => res.json({
  status: "OK", version: "17.1",
  whisper: WHISPER_AVAILABLE, whisperCmd: WHISPER_CMD,
  captionStyles: Object.keys(CAPTION_STYLE_PRESETS),
  languages: ["english", "hindi", "hinglish", "gujarati", "gujlish", "auto"],
  dbReady,
}))

app.get("/api/caption-templates", (req, res) => {
  try {
    const list = captionEngine.listTemplates()
    res.json({ success: true, ...list })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post("/api/cleanup/:sessionId", async (req, res) => {
  const s = processingSessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ success: false, error: "Not found" })
  if (s.videoInfo?.originalVideoPath) { await safeDelete(s.videoInfo.originalVideoPath); delete s.videoInfo.originalVideoPath }
  res.json({ success: true })
})

// ── EDIT CAPTION TEXT — fix wrong words, then re-burn ──────────────────────
app.put("/api/clips/:clipId/captions", async (req, res) => {
  try {
    const { sessionId, segments } = req.body || {}
    if (!sessionId) return res.status(400).json({ success: false, error: "sessionId required" })
    if (!Array.isArray(segments) || !segments.length) return res.status(400).json({ success: false, error: "segments[] required" })
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found" })
    const clip = session.clips?.find(c => c.id === req.params.clipId)
    if (!clip) return res.status(404).json({ success: false, error: "Clip not found" })
    const cleaned = segments
      .map(s => ({ word: String(s.word || "").trim(), start: Number(s.start), end: Number(s.end) }))
      .filter(s => s.word && isFinite(s.start) && isFinite(s.end) && s.end > s.start)
      .sort((a, b) => a.start - b.start)
    clip.captionSegments = cleaned
    res.json({ success: true, captionSegments: cleaned })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── RE-LAYOUT / REFRAME — switch a clip between Split / Inverted / Smart / Left / Right / Center / Fit ─────────
const handleReLayout = async (req, res) => {
  try {
    const { sessionId, clipId, layoutMode } = req.body || {}
    const allowed = ["smart", "split", "split_reverse", "left", "right", "center", "fit"]
    if (!sessionId || !clipId || !allowed.includes(layoutMode))
      return res.status(400).json({ success: false, error: `sessionId, clipId and layoutMode (${allowed.join("|")}) required` })
    const session = processingSessions.get(sessionId)
    if (!session) return res.status(404).json({ success: false, error: "Session not found" })
    const clip = session.clips?.find(c => c.id === clipId)
    if (!clip) return res.status(404).json({ success: false, error: "Clip not found" })
    
    clip.layoutMode = layoutMode
    const origPath = session.videoInfo?.originalVideoPath || `uploads/videos/${sessionId}.mp4`
    const cleanPath = `uploads/clips/${clipId}.mp4`

    if (!fsSync.existsSync(origPath) && session.url) {
      console.log(`[reframe] Original video not on disk. Downloading section for ${clipId} (${clip.startTime}s - ${clip.startTime + clip.duration}s)...`)
      const rawSec = path.join("uploads", "clips", `raw_${clipId}.mp4`)
      await downloadSectionFromYoutube(session.url, clip.startTime, clip.startTime + clip.duration, rawSec)
      await extractClip(rawSec, cleanPath, 0, clip.duration, session.videoInfo?.videoType, session.videoInfo?.layout, clip.captionSegments, layoutMode)
      await safeDelete(rawSec)
    } else {
      await extractClip(origPath, cleanPath, clip.startTime, clip.duration, session.videoInfo?.videoType, session.videoInfo?.layout, clip.captionSegments, layoutMode)
    }

    // Mirror clean clip to root uploads
    try {
      const rootClean = path.resolve(__dirname, "../uploads/clips", `${clipId}.mp4`)
      await fs.copyFile(cleanPath, rootClean)
    } catch {}

    // Regenerate thumbnail from the newly framed video (at 1 sec)
    const ts = Date.now()
    const thumbPath = path.join("uploads", "thumbnails", `${clipId}.jpg`)
    try {
      await generateThumbnail(cleanPath, thumbPath, 1)
      const rootThumb = path.resolve(__dirname, "../uploads/thumbnails", `${clipId}.jpg`)
      try { await fs.copyFile(thumbPath, rootThumb) } catch {}
    } catch (e) {
      console.warn("[reframe] Thumbnail generation error:", e.message)
    }

    // Invalidate old burns across all upload dirs so next caption/download uses the new layout.
    const dirsToClean = [
      path.join(process.cwd(), "uploads", "clips"),
      path.resolve(__dirname, "../uploads/clips")
    ]
    for (const dir of dirsToClean) {
      try {
        const files = await fs.readdir(dir)
        for (const f of files) if (f.startsWith(`${clipId}_captioned`)) await safeDelete(path.join(dir, f))
      } catch {}
    }

    clip.videoUrl = `/uploads/clips/${clipId}.mp4?v=${ts}`
    clip.thumbnail = `/uploads/thumbnails/${clipId}.jpg?v=${ts}`
    await saveSessionsToCache()
    res.json({
      success: true,
      clipId,
      layoutMode,
      videoUrl: `/uploads/clips/${clipId}.mp4?v=${ts}`,
      thumbnail: `/uploads/thumbnails/${clipId}.jpg?v=${ts}`
    })
  } catch (err) {
    console.error("[reframe] Error:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
app.post("/api/re-layout", handleReLayout)
app.post("/api/reframe", handleReLayout)

// ── UPLOAD VIDEO → captions/clips (for users who already have the file) ────
const processUploadedVideo = async (sessionId, videoPath, opts = {}) => {
  const session = processingSessions.get(sessionId)
  if (!session) return
  const emit = (step, pct, status) => {
    session.currentStep = step; session.progress = pct
    if (status) session.status = status
    io.emit("progress", { sessionId, ...session })
  }
  try {
    emit("📐 Analyzing uploaded video…", 10, "analysing")
    const duration = await getRealDuration(videoPath) || 300
    const layout = await detectLayout(videoPath)
    const videoInfo = { title: opts.filename || "Uploaded Video" }
    const videoType = opts.videoType || "general"
    // Same rule as YouTube: "auto" probes the actual audio, never defaults to
    // English from metadata.
    let hintLanguage = opts.language
    if (!hintLanguage || hintLanguage === "auto") hintLanguage = null
    let resolvedLanguage = hintLanguage || "english"
    const audioHooks = await detectAudioHooks(videoPath, duration)

    let fullTranscript = null
    try {
      emit("📝 Transcribing audio…", 26, "transcribing")
      const tr = await transcribeWithWhisper(videoPath, hintLanguage)
      if (tr?.words?.length) {
        fullTranscript = tr.words
        resolvedLanguage = tr.detectedLanguage || resolvedLanguage
      }
    } catch (e) { console.error("[upload-pipeline] Transcription failed:", e.message) }

    emit("🤖 Google Gemini selecting viral clips…", 34, "analysing")
    let moments = null
    try {
      moments = await analyzeTranscriptForClips(fullTranscript, {
        title: videoInfo.title,
        description: videoInfo.description,
        chapters: videoInfo.chapters,
        videoType,
        language: resolvedLanguage,
        duration,
      })
    } catch (e) {
      console.error("[upload-pipeline] Gemini AI failed:", e.message)
    }
    if (!Array.isArray(moments) || !moments.length) {
      moments = detectSmartMoments(duration, videoType, resolvedLanguage, videoInfo, audioHooks)
    }
    session.totalSteps = moments.length; session.completedSteps = 0
    emit("📸 Generating clip screenshots…", 38, "extracting")
    const clipsRaw = await processClipsInParallel(videoPath, moments, sessionId, null, videoType, videoInfo, layout, fullTranscript, resolvedLanguage, opts.layout || "smart")
    const momentById = new Map(moments.map(m => [m.id, m]))
    const clips = clipsRaw.map(clip => {
      const m = momentById.get(clip.id) || {}
      return { ...clip, language: resolvedLanguage, description: m.description || clip.description || "", hashtags: m.hashtags || clip.hashtags || [], aiReason: m.reason || clip.reason || "" }
    })
    const st = await fs.stat(videoPath).catch(() => null)
    session.videoInfo = {
      title: videoInfo.title, duration, originalUrl: "upload",
      language: resolvedLanguage, videoType,
      quality: "1080p", fileSize: st ? Math.round(st.size / 1048576) : 0, layout,
      hasRealCaptions: !!fullTranscript,
      originalVideoPath: videoPath, fullTranscript,
    }
    session.status = "completed"; session.progress = 100
    session.currentStep = `✅ ${clips.length} clips ready!`
    session.clips = clips
    io.emit("progress", { sessionId, ...session })
    await saveSessionsToCache()
  } catch (err) {
    console.error("❌ Upload pipeline failed:", err.message)
    session.status = "error"; session.currentStep = `❌ ${err.message}`; session.error = err.message
    io.emit("progress", { sessionId, ...session })
  }
}

app.post("/api/upload", (req, res) => {
  if (!multer) return res.status(503).json({ success: false, error: "Upload unavailable — run `npm install multer` in backend folder." })
  const sessionId = uuidv4()
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req2, file, cb) => cb(null, path.resolve("uploads/videos")),
      filename: (req2, file, cb) => cb(null, `${sessionId}.mp4`),
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  }).single("video")
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message })
    if (!req.file) return res.status(400).json({ success: false, error: "No video file uploaded (field: video)" })
    await ensureUploadsDir()
    const videoPath = `uploads/videos/${sessionId}.mp4`
    const { language, videoType, layout } = req.body || {}
    processingSessions.set(sessionId, {
      url: "upload", userId: null, languageHint: language || "auto", layoutHint: layout || "smart",
      status: "starting", progress: 0, currentStep: "Starting…", totalSteps: 0, completedSteps: 0,
    })
    res.json({ success: true, sessionId })
    processUploadedVideo(sessionId, videoPath, { filename: req.file.originalname, language: language || "auto", videoType: videoType || "general", layout: layout || "smart" })
  })
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

// GET /api/clips/history — paginated clip history per user (DB optional)
app.get("/api/clips/history", async (req, res) => {
  if (!dbReady) return res.json({ success: true, clips: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } })
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

// POST /api/clips — save a generated clip to history (skipped without DB)
app.post("/api/clips", async (req, res) => {
  if (!dbReady) return res.json({ success: true, skipped: true })
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
    const encoded = encodeURIComponent(filename)
    const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${fontName.toLowerCase()}/${encoded}`
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "arraybuffer",
      timeout: 15000
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
  Promise.all([
    downloadGoogleFont("poppins", "Poppins-Bold.ttf"),
    downloadGoogleFont("montserrat", "Montserrat-Bold.ttf"),
    downloadGoogleFont("outfit", "Outfit-Bold.ttf"),
    downloadGoogleFont("notosansdevanagari", "NotoSansDevanagari[wdth,wght].ttf"),
    downloadGoogleFont("notosansgujarati", "NotoSansGujarati[wdth,wght].ttf"),
  ]).catch(() => {})
  server.listen(PORT, () => {
    console.log(`\n🎯 ShortAI API v17 on port ${PORT}`)
    console.log(`   Whisper:        ${WHISPER_AVAILABLE ? `✅ ${WHISPER_CMD}` : "❌ NOT FOUND — captions will use placeholders"}`)
    console.log(`   Caption styles: ${Object.keys(CAPTION_STYLE_PRESETS).length} styles`)
    console.log(`   DB:             ${dbReady ? "✅ MongoDB" : "ℹ️ in-memory (auth free)"}`)
    console.log(`   Session rejoin: socket.on("rejoin") ✅`)
    console.log(`   Health:         http://localhost:${PORT}/api/health`)
  })
}
startServer()