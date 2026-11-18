import { useState, useEffect, useRef, useCallback } from "react"
import axios from "axios"
import { io } from "socket.io-client"
import {
  Download, Scissors, Zap, Clock, TrendingUp,
  Copy, Check, Sparkles, Captions,
  ChevronDown, ChevronUp, RotateCcw,
  Film, Star, Flame, Plus,
  Play, Pause, Volume2, VolumeX,
  SkipBack, SkipForward, Type, Palette,
  RefreshCw, History, X, Maximize,
  Link2, ChevronRight, BarChart2, Layers,
  SlidersHorizontal, Move, Upload, Pencil, LayoutGrid,
} from "lucide-react"
import ExtendCutModal from "./ExtendCutModal"
import Navbar from "./Navbar"

const API_BASE = "http://localhost:5000/api"
const API_ROOT = "http://localhost:5000"

let _socket = null
const getSocket = () => {
  if (!_socket) {
    _socket = io(API_ROOT, {
      reconnection: true, reconnectionAttempts: Infinity,
      reconnectionDelay: 1000, reconnectionDelayMax: 5000,
    })
  }
  return _socket
}

const fmt = (s) => {
  if (!s && s !== 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, "0")
  return `${m}:${sec}`
}

const isYT = (u) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(u)

const scoreMeta = (n) => {
  if (n >= 90) return { color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20", label: "Viral", glow: "shadow-[0_0_12px_rgba(16,185,129,0.2)]" }
  if (n >= 75) return { color: "text-[#FF6B35]", bg: "bg-[#FF6B35]/15", border: "border-[#FF6B35]/30", label: "Hot", glow: "shadow-[0_0_12px_rgba(255,107,53,0.25)]" }
  return { color: "text-sky-300", bg: "bg-sky-500/15", border: "border-sky-500/20", label: "Good", glow: "" }
}

export const CAPTION_STYLES = {
  // ── 2025-26 WhiteStair & Trending Library ────────────────────────────────
  shortai:   { id: "shortai",   name: "SHORTAI EDITORIAL", preview: "VIRAL SHORTS", font: "Bricolage Grotesque", fontSize: 96, primaryColor: "#EDEDE8", highlightColor: "#9DFF4A", outlineColor: "#060606", position: "center", animation: "pop", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "ShortAI signature editorial style: bold grotesque, warm white & electric acid green pop" },
  discipline:{ id: "discipline",name: "DISCIPLINE", preview: "visual storytelling.", font: "Montserrat", fontSize: 96, primaryColor: "#FFFFFF", highlightColor: "#E50012", outlineColor: "#000000", position: "center", animation: "slide-up", bold: true, bgBox: false, bgColor: "transparent", uppercase: false, description: "WhiteStair Discipline: Bold hero with Alex Brush cursive red accent" },
  crazy:     { id: "crazy",     name: "CRAZY", preview: "FINALLY DYNAMIC", font: "Montserrat", fontSize: 100, primaryColor: "#FFFFFF", highlightColor: "#FF8F00", outlineColor: "#000000", position: "center", animation: "pop-in", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair Crazy: 3D metallic gold/orange extruded punch" },
  estate4:   { id: "estate4",   name: "ESTATE 4", preview: "trending templates", font: "Montserrat", fontSize: 92, primaryColor: "#FFFFFF", highlightColor: "#1CD0FF", outlineColor: "#000000", position: "center", animation: "slide-up", bold: true, bgBox: false, bgColor: "transparent", uppercase: false, description: "WhiteStair Estate 4: Headline with 3D cyan extruded hero" },
  master:    { id: "master",    name: "MASTER", preview: "VIRAL IMPACT", font: "Inter", fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#9DFF4A", outlineColor: "#000000", position: "center", animation: "appear-zoom", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair Master: High-contrast punchy appear-zoom" },
  "mrbeast-classic": { id: "mrbeast-classic", name: "MRBEAST", preview: "MRBEAST CLASSIC", font: "Lato", fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#FFE500", outlineColor: "#000000", position: "bottom", animation: "pop-in", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair MrBeast: Signature yellow pop-in" },
  "impact-glow": { id: "impact-glow", name: "IMPACT GLOW", preview: "IMPACT GLOW", font: "Oswald", fontSize: 96, primaryColor: "#FFFFFF", highlightColor: "#00E5FF", outlineColor: "#000000", position: "center", animation: "slam", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair Impact: Slam entrance with glowing neon cyan" },
  vogue:     { id: "vogue",     name: "VOGUE", preview: "VOGUE SLIDE", font: "Anton", fontSize: 92, primaryColor: "#FFFFFF", highlightColor: "#FF2D55", outlineColor: "#000000", position: "center", animation: "slide-left", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair Vogue: Anton headline slide from left" },
  "glowly-1":{ id: "glowly-1",  name: "GLOWLY NEON", preview: "GLOWLY NEON", font: "Montserrat", fontSize: 92, primaryColor: "#00E5FF", highlightColor: "#FF007F", outlineColor: "#000000", position: "bottom", animation: "pop-in", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair Glowly: Cyan to magenta neon glow" },
  "karaoke-classic": { id: "karaoke-classic", name: "KARAOKE CLASSIC", preview: "KARAOKE TIMING", font: "Montserrat", fontSize: 88, primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#000000", position: "bottom", animation: "fade", bold: true, bgBox: false, bgColor: "transparent", uppercase: true, description: "WhiteStair Karaoke: Live spoken word tracking" },
  boxed:     { id: "boxed",     name: "BOXED", preview: "boxed caption", font: "Inter", fontSize: 86, primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", animation: "pop-in", bold: true, bgBox: true, bgColor: "rgba(44,74,94,0.92)", description: "WhiteStair Boxed: Contrast slate box" },
  hormozi1:  { id: "hormozi1",  name: "HORMOZI 1",  preview: "HORMOZI 1",         font: "Impact",         fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#00E676", outlineColor: "#000000", position: "center", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "White bold with green active word" },
  hormozi2:  { id: "hormozi2",  name: "HORMOZI 2",  preview: "HORMOZI 2",         font: "Impact",         fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#FFE600", outlineColor: "#000000", position: "center", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "White bold with yellow active word" },
  beast:     { id: "beast",     name: "BEAST",      preview: "BEAST",             font: "Arial Black",    fontSize: 92, primaryColor: "#FFD400", highlightColor: "#FF3B30", outlineColor: "#000000", position: "center", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, italic: true, description: "MrBeast yellow with red pops" },
  karaoke:   { id: "karaoke",   name: "KARAOKE",    preview: "KARAOKE POP",       font: "Montserrat",     fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#001322", position: "center", animation: "karaoke",    bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Karaoke box highlight" },
  bounce:    { id: "bounce",    name: "BOUNCE",     preview: "BOUNCE!",           font: "Arial Black",    fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#FF6B35", outlineColor: "#1A1A1A", position: "center", animation: "bounce",     bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Energetic overshoot bounce" },
  neon:      { id: "neon",      name: "NEON",       preview: "NEON",              font: "Outfit",         fontSize: 88, primaryColor: "#7DF9FF", highlightColor: "#FF7AD9", outlineColor: "#12041F", position: "bottom", animation: "neon",       bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Glowing neon edges" },
  fire:      { id: "fire",      name: "FIRE",       preview: "FIRE!",             font: "Arial Black",    fontSize: 88, primaryColor: "#FFD400", highlightColor: "#FF6B35", outlineColor: "#4A0E00", position: "bottom", animation: "bounce",     bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Fire-trail yellow/orange" },
  minimal:   { id: "minimal",   name: "MINIMAL",    preview: "minimal",           font: "Poppins",        fontSize: 78, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "fade",       bold: false, bgBox: true,  bgColor: "rgba(0,0,0,0.55)",      description: "Clean fade on soft card" },
  brutal:    { id: "brutal",    name: "BRUTALIST",  preview: "BRUTAL",            font: "Impact",         fontSize: 98, primaryColor: "#FFFFFF", highlightColor: "#FFE600", outlineColor: "#000000", position: "center", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Massive hard-shadow punch" },
  typewriter:{ id: "typewriter",name: "TYPEWRITER", preview: "typewriter",        font: "Outfit",         fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#00E676", outlineColor: "#000000", position: "bottom", animation: "typewriter", bold: true,  bgBox: false, bgColor: "transparent",      description: "Fade + scale reveal" },
  slide:     { id: "slide",     name: "SLIDE UP",   preview: "SLIDE UP",          font: "Poppins",        fontSize: 86, primaryColor: "#FFFFFF", highlightColor: "#FF6B35", outlineColor: "#000000", position: "bottom", animation: "slide",      bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Rising slide motion" },
  fadeIn:    { id: "fadeIn",    name: "FADE IN",    preview: "fade in",           font: "Montserrat",     fontSize: 84, primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", animation: "fade",       bold: true,  bgBox: false, bgColor: "transparent",      description: "Smooth opacity fade" },
  pill:      { id: "pill",      name: "PILL",       preview: "pill",              font: "Poppins",        fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#FF6B35", outlineColor: "#000000", position: "bottom", animation: "pill",       bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Rounded pill per word" },
  pop:       { id: "pop",       name: "POP",        preview: "3 MAIN STEPS",      font: "Montserrat",     fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#001322", position: "center", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Cyan active word + auto-yellow numbers" },
  negativa:  { id: "negativa",  name: "Negativa",   preview: "Negativa",          font: "Montserrat",     fontSize: 74, primaryColor: "#FFFFFF", highlightColor: "#B0B0B0", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: true,  bgColor: "rgba(0,0,0,0.85)",   description: "Clean white on black card" },
  cove:      { id: "cove",      name: "Cove",       preview: "Cove",              font: "Poppins",        fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#9AD0FF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      description: "Soft white text with glow" },
  leon:      { id: "leon",      name: "LEON",       preview: "LEON",              font: "Arial Black",    fontSize: 80, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: true,  bgColor: "rgba(230,50,40,0.95)",  uppercase: true, description: "Bold white on red block" },
  laguna:    { id: "laguna",    name: "LAGUNA",     preview: "LAGUNA",            font: "Montserrat",     fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "fade",       bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Big clean uppercase white" },
  tuba:      { id: "tuba",      name: "Tuba",       preview: "Tuba",              font: "Outfit",         fontSize: 78, primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      description: "Friendly rounded white" },
  splitz:    { id: "splitz",    name: "Splitz",     preview: "Splitz",            font: "Georgia",        fontSize: 80, primaryColor: "#E8A15A", highlightColor: "#F6C177", outlineColor: "#000000", position: "bottom", animation: "fade",       bold: true,  bgBox: false, bgColor: "transparent",      italic: true, description: "Warm serif italic" },
  aria:      { id: "aria",      name: "Aria",       preview: "Aria",              font: "Poppins",        fontSize: 82, primaryColor: "#FFC93C", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      description: "Golden headline text" },
  stack:     { id: "stack",     name: "Stack",      preview: "Stack",             font: "Montserrat",     fontSize: 80, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "boxed",      bold: true,  bgBox: true,  bgColor: "rgba(0,0,0,0.55)",    uppercase: true, description: "Bold white on soft block" },
  lume:      { id: "lume",      name: "Lume",       preview: "Lume",              font: "Poppins",        fontSize: 78, primaryColor: "#D9B382", highlightColor: "#F0DCB4", outlineColor: "#000000", position: "bottom", animation: "fade",       bold: true,  bgBox: false, bgColor: "transparent",      description: "Muted warm tan" },
  marca:     { id: "marca",     name: "MARCA",      preview: "MARCA",             font: "Arial Black",    fontSize: 78, primaryColor: "#111111", highlightColor: "#111111", outlineColor: "#FFD400", position: "bottom", animation: "boxed",      bold: true,  bgBox: true,  bgColor: "rgba(255,214,0,0.95)",  uppercase: true, description: "Dark text on yellow marker" },
  canto:     { id: "canto",     name: "Canto",      preview: "Canto",             font: "Georgia",        fontSize: 80, primaryColor: "#F0E6D2", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "fade",       bold: false, bgBox: false, bgColor: "transparent",      italic: true, description: "Elegant cream serif" },
  silk:      { id: "silk",      name: "Silk",       preview: "Silk",              font: "Poppins",        fontSize: 80, primaryColor: "#34D5C8", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      description: "Smooth teal text" },
  slash:     { id: "slash",     name: "SLASH",      preview: "SLASH",             font: "Arial Black",    fontSize: 86, primaryColor: "#FF3D9A", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Bold magenta punch" },
  dense:     { id: "dense",     name: "Dense",      preview: "Dense",             font: "Arial Black",    fontSize: 90, primaryColor: "#B6FF3C", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "center", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Heavy lime green" },
  open:      { id: "open",      name: "Open",       preview: "Open",              font: "Montserrat",     fontSize: 82, primaryColor: "#2FD891", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      description: "Fresh green outline" },
  vibe:      { id: "vibe",      name: "Vibe",       preview: "Vibe",              font: "Poppins",        fontSize: 84, primaryColor: "#34D058", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "pop",        bold: true,  bgBox: false, bgColor: "transparent",      description: "Energetic green" },
  rise:      { id: "rise",      name: "Rise",       preview: "Rise",              font: "Montserrat",     fontSize: 84, primaryColor: "#FFC01E", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "slide",      bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Rising gold" },
  prism:     { id: "prism",     name: "PRISM",      preview: "PRISM",             font: "Poppins",        fontSize: 84, primaryColor: "#B98CFF", highlightColor: "#FF7AD9", outlineColor: "#000000", position: "bottom", animation: "neon",       bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Violet-to-pink gradient pops" },
}

const LAYOUT_OPTIONS = [
  { id: "smart",  label: "Smart Crop", desc: "Active speaker pan" },
  { id: "split",  label: "Split 2-Person", desc: "Top / bottom podcast" },
  { id: "center", label: "Center", desc: "Static 9:16 center" },
  { id: "fit",    label: "Fit", desc: "Pad full frame" },
]
const LANGUAGE_OPTIONS = [
  { id: "auto",      label: "Auto-detect (Hinglish / Gujlish / English)" },
  { id: "hinglish",  label: "Hinglish (Hindi in English)" },
  { id: "gujlish",   label: "Gujlish (Gujarati in English)" },
  { id: "english",   label: "English" },
]

const SESSIONS_KEY = "clipforge_sessions"
const TOKEN_KEY    = "clipforge_token"
const loadSavedSessions = () => { try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]") } catch { return [] } }
const saveSessions       = (s) => { try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(s.slice(-20))) } catch {} }
const saveToken          = (t) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch {} }
const loadToken          = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }

const DEMO_VIDEO_INFO = { title: "The Future of Organic Farming & Artificial Intelligence (Joe Rogan Experience)", videoType: "Podcast", language: "english", duration: 5760, quality: "1080p", fileSize: "412", hasRealCaptions: true }
const DEMO_CLIPS = [
  { id: "demo-clip-1", title: "Why soil biology is the ultimate AI model", startTime: 120, endTime: 150, duration: 30, viralScore: 94, isAiHook: true,  explanation: "Highly engaging hook about natural farming, using AI as a metaphor.", language: "english", thumbnail: "https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?w=600&auto=format&fit=crop",  videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-vegetables-in-a-market-basket-40344-large.mp4",     viralTitles: ["AI is hidden inside your soil 🤯", "Why soil biology is the ultimate AI model", "The tech sector is learning from organic farmers!"], captionSegments: [{ start: 120, end: 123, text: "So if you look at soil biology," }, { start: 123, end: 127, text: "it's actually the ultimate artificial intelligence model" }] },
  { id: "demo-clip-2", title: "How corporate agriculture ruined the gut microbiome", startTime: 650, endTime: 710, duration: 60, viralScore: 88, isAiHook: false, explanation: "Strong emotional hook about wellness and microbiome health.", language: "english", thumbnail: "https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=600&auto=format&fit=crop",  videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-fresh-salad-ingredients-being-washed-40294-large.mp4", viralTitles: ["The silent killer in your groceries 🤢", "Corporate agriculture vs. your gut health", "How we lost 50% of our gut microbiome diversity"], captionSegments: [{ start: 650, end: 653, text: "Modern chemical farming has systematically" }] },
  { id: "demo-clip-3", title: "The Indian farming technique saving water", startTime: 1820, endTime: 1865, duration: 45, viralScore: 91, isAiHook: false, explanation: "Fascinating case study of water conservation in organic farming.", language: "hindi",   thumbnail: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=600&auto=format&fit=crop",  videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-small-stream-flowing-through-rocks-42825-large.mp4",  viralTitles: ["यह तकनीक लाखों गैलन पानी बचा रही है! 🇮🇳", "The ancient water hack saving modern farms", "Traditional Indian organic farming goes viral"], captionSegments: [{ start: 1820, end: 1823, text: "यह पारंपरिक भारतीय जैविक कृषि पद्धति" }] },
]

export default function Dashboard() {
  const [url, setUrl]                       = useState("")
  const [processing, setProcessing]         = useState(false)
  const [clips, setClips]                   = useState(DEMO_CLIPS)
  const [customClips, setCustomClips]       = useState([])
  const [error, setError]                   = useState("")
  const [progressMsg, setProgressMsg]       = useState("")
  const [progressPct, setProgressPct]       = useState(0)
  const [videoInfo, setVideoInfo]           = useState(DEMO_VIDEO_INFO)
  const [elapsed, setElapsed]               = useState(0)
  const [sessionId, setSessionId]           = useState("demo-session")
  const [editingClip, setEditingClip]       = useState(null)
  const [copiedId, setCopiedId]             = useState(null)
  const [language, setLanguage]             = useState("auto")
  const [layout, setLayout]                 = useState("smart")
  const [uploadFile, setUploadFile]         = useState(null)
  const [captionState, setCaptionState]     = useState({ "demo-clip-1": "ready", "demo-clip-2": "ready", "demo-clip-3": "ready" })
  const [captionUrl, setCaptionUrl]         = useState({ "demo-clip-1": "demo-clip-1", "demo-clip-2": "demo-clip-2", "demo-clip-3": "demo-clip-3" })
  const [dlLoading, setDlLoading]           = useState({})
  const [expanded, setExpanded]             = useState({})
  const [activeFilter, setActiveFilter]     = useState("all")
  const [savedSessions, setSavedSessions]   = useState([])
  const [showHistory, setShowHistory]       = useState(false)
  const [captionStyles, setCaptionStyles]   = useState({})
  const [selectedFonts, setSelectedFonts]   = useState({})
  const [showStylePicker, setShowStylePicker] = useState(null)
  const [showGlobalPicker, setShowGlobalPicker] = useState(false)
  const [globalCaptionStyle, setGlobalCaptionStyle] = useState("hormozi1")
  const [pastClips, setPastClips]           = useState([])
  const [clipLayouts, setClipLayouts]       = useState({})
  const [fullscreenClip, setFullscreenClip] = useState(null) // custom 9:16 fullscreen
  const [resumeTime, setResumeTime]     = useState({}) // clipId → position to continue from
  const [captionOverrides, setCaptionOverrides] = useState({}) // per-clip { textColor, highlightColor, fontSize, positionX, positionY, letterSpacing, highlightWords }
  const [editingCaps, setEditingCaps]       = useState(null)   // clipId whose style editor is open
  const [editingText, setEditingText]       = useState(null)   // clipId whose word-text editor is open
  const pollRef = useRef(null)

  const setOverride = (clipId, patch) =>
    setCaptionOverrides(p => ({ ...p, [clipId]: { ...(p[clipId] || {}), ...patch } }))

  // Open 9:16 fullscreen without any double-playback: pause EVERY video first,
  // carry the card's position into the fullscreen player.
  const handleOpenFullscreen = (clip) => {
    document.querySelectorAll("video").forEach(v => { try { v.pause() } catch {} })
    const cardVid = document.querySelector(`video[data-clip-video="${clip.id}"]`)
    setResumeTime(p => ({ ...p, [clip.id]: cardVid ? cardVid.currentTime : 0 }))
    setFullscreenClip(clip)
  }
  const closeFullscreen = (t) => {
    if (t != null && fullscreenClip) setResumeTime(p => ({ ...p, [fullscreenClip.id]: t }))
    setFullscreenClip(null)
  }

  const loadPastClipsHistory = async () => { setPastClips([]) }

  useEffect(() => { setSavedSessions(loadSavedSessions()) }, [])

  useEffect(() => {
    if (!sessionId || sessionId === "demo-session") return
    const sessions = loadSavedSessions()
    const exists = sessions.find(s => s.sessionId === sessionId)
    if (!exists) {
      const updated = [...sessions, { sessionId, url, startedAt: Date.now(), status: "processing" }]
      saveSessions(updated); setSavedSessions(updated)
    }
  }, [sessionId])

  useEffect(() => {
    let iv
    if (processing) iv = setInterval(() => setElapsed(e => e + 1), 1000)
    else setElapsed(0)
    return () => clearInterval(iv)
  }, [processing])

  useEffect(() => {
    const socket = getSocket()
    const handler = (data) => {
      if (data.sessionId !== sessionId) return
      setProgressMsg(data.currentStep || ""); setProgressPct(data.progress || 0)
      if (data.status === "completed") {
        setClips(data.clips || []); setVideoInfo(data.videoInfo || null)
        setProcessing(false); setProgressMsg("")
        const sessions = loadSavedSessions()
        saveSessions(sessions.map(s => s.sessionId === sessionId ? { ...s, status: "completed", completedAt: Date.now() } : s))
        setSavedSessions(loadSavedSessions())
      } else if (data.status === "error") {
        setError(data.error || "Processing failed"); setProcessing(false); setProgressMsg("")
      }
    }
    socket.on("progress", handler)
    return () => socket.off("progress", handler)
  }, [sessionId])

  useEffect(() => {
    const layouts = {}
    clips.forEach(clip => { if (clip.layoutMode) layouts[clip.id] = clip.layoutMode })
    if (Object.keys(layouts).length) setClipLayouts(p => ({ ...p, ...layouts }))
  }, [clips])

  useEffect(() => {
    if (!sessionId || !processing) { clearInterval(pollRef.current); return }
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API_BASE}/session/${sessionId}`)
        if (!r.data.success) return
        const s = r.data.session
        setProgressMsg(s.currentStep || ""); setProgressPct(s.progress || 0)
        if (s.status === "completed") {
          const newClips = s.clips || []
          setClips(newClips); setVideoInfo(s.videoInfo || null)
          setProcessing(false); clearInterval(pollRef.current)
          if (newClips.length > 0) saveGeneratedClips(newClips).catch(() => {})
        } else if (s.status === "error") {
          setError(s.error || "Processing failed"); setProcessing(false); clearInterval(pollRef.current)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [sessionId, processing])

  useEffect(() => {
    const sessions = loadSavedSessions()
    const inProgress = sessions.find(s => s.status === "processing")
    if (!inProgress) return
    const ageMin = (Date.now() - inProgress.startedAt) / 60000
    if (ageMin > 60) return
    setClips([]); setVideoInfo(null); setCaptionState({}); setCaptionUrl({})
    setSessionId(inProgress.sessionId); setUrl(inProgress.url || "")
    setProcessing(true); setProgressMsg("Reconnecting to background session…")
    const socket = getSocket()
    socket.emit("rejoin", { sessionId: inProgress.sessionId })
  }, [])

  const handleGenerate = async () => {
    if (!url.trim()) return setError("Please enter a YouTube URL")
    if (!isYT(url)) return setError("Please enter a valid YouTube URL")
    setProcessing(true); setError(""); setProgressMsg("Starting…"); setProgressPct(0)
    setClips([]); setCustomClips([]); setVideoInfo(null); setCaptionState({}); setCaptionUrl({}); setClipLayouts({})
    try {
      const r = await axios.post(`${API_BASE}/generate-clips`, { url, language, layout })
      if (r.data.success) setSessionId(r.data.sessionId)
      else { setError(r.data.error || "Failed"); setProcessing(false) }
    } catch {
      setError("Cannot connect to server — is the backend running?"); setProcessing(false)
    }
  }

  const handleUpload = async () => {
    if (!uploadFile) return setError("Choose a video file to upload")
    setProcessing(true); setError(""); setProgressMsg("Uploading…"); setProgressPct(0)
    setClips([]); setCustomClips([]); setVideoInfo(null); setCaptionState({}); setCaptionUrl({}); setClipLayouts({})
    try {
      const fd = new FormData()
      fd.append("video", uploadFile)
      fd.append("language", language)
      fd.append("layout", layout)
      const r = await axios.post(`${API_BASE}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } })
      if (r.data.success) setSessionId(r.data.sessionId)
      else { setError(r.data.error || "Upload failed"); setProcessing(false) }
    } catch (e) {
      setError(e?.response?.data?.error || "Upload failed — is the backend running?"); setProcessing(false)
    }
  }

  const restoreSession = async (sid) => {
    setShowHistory(false)
    try {
      const r = await axios.get(`${API_BASE}/session/${sid}`)
      if (!r.data.success) { alert("Session not found"); return }
      const s = r.data.session
      setSessionId(sid); setProgressMsg(s.currentStep || ""); setProgressPct(s.progress || 0)
      if (s.status === "completed") {
        const restoredClips = s.clips || []
        setClips(restoredClips); setVideoInfo(s.videoInfo || null); setProcessing(false)
        if (restoredClips.length > 0) saveGeneratedClips(restoredClips).catch(() => {})
      } else if (s.status === "processing") {
        setProcessing(true); setUrl(s.url || "")
      }
    } catch { alert("Session not found or expired") }
  }

  const download = async (clipId, filename, captioned = false) => {
    const key = `${clipId}-${captioned ? "cap" : "clean"}`
    setDlLoading(p => ({ ...p, [key]: true }))
    try {
      if (clipId.startsWith("demo-")) {
        const demoClip = DEMO_CLIPS.find(c => c.id === clipId) || customClips.find(c => c.id === clipId)
        if (demoClip) { const a = document.createElement("a"); a.href = demoClip.videoUrl; a.target = "_blank"; a.download = filename; document.body.appendChild(a); a.click(); a.remove() }
        return
      }
      const style = captionStyles[clipId] || globalCaptionStyle
      const ov = captionOverrides[clipId] || {}
      const lay = clipLayouts[clipId] || layout || "smart"
      const qs = new URLSearchParams({ style, layout: lay })
      if (ov.textColor) qs.set("textColor", ov.textColor)
      if (ov.highlightColor) qs.set("highlightColor", ov.highlightColor)
      if (ov.fontSize) qs.set("fontSize", ov.fontSize)
      if (ov.positionX != null) qs.set("positionX", ov.positionX)
      if (ov.positionY != null) qs.set("positionY", ov.positionY)
      if (ov.letterSpacing != null) qs.set("letterSpacing", ov.letterSpacing)
      if (ov.highlightWords === false) qs.set("highlightWords", "false")
      const id = captioned ? `${clipId}_captioned?${qs.toString()}` : clipId
      const r = await axios.get(`${API_BASE}/download/${id}`, { responseType: "blob" })
      const blobUrl = window.URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement("a"); a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch { alert("Download failed — try again.") }
    finally { setDlLoading(p => ({ ...p, [key]: false })) }
  }

  const handleAddCaptions = async (clipId) => {
    if (captionState[clipId] === "loading") return
    setCaptionState(p => ({ ...p, [clipId]: "loading" }))
    const style = captionStyles[clipId] || globalCaptionStyle
    if (clipId.startsWith("demo-")) {
      setTimeout(() => {
        const demoClip = DEMO_CLIPS.find(c => c.id === clipId) || customClips.find(c => c.id === clipId)
        setCaptionUrl(p => ({ ...p, [clipId]: demoClip.videoUrl }))
        setCaptionState(p => ({ ...p, [clipId]: "ready" }))
      }, 1000)
      return
    }
    try {
      const r = await axios.post(`${API_BASE}/add-captions/${clipId}`, { sessionId, captionStyle: style, selectedFont: selectedFonts[clipId] || "default", overrides: captionOverrides[clipId] || {}, layoutMode: clipLayouts[clipId] || layout || "smart" })
      if (r.data.success) {
        setCaptionUrl(p => ({ ...p, [clipId]: r.data.videoUrl }))
        setCaptionState(p => ({ ...p, [clipId]: "ready" }))
        const updateClipsList = (list) => list.map(c => c.id === clipId ? { ...c, hasRealCaptions: r.data.isReal, language: r.data.language, captionSegments: r.data.captionSegments || [], viralTitles: r.data.viralTitles?.length > 0 ? r.data.viralTitles : c.viralTitles } : c)
        setClips(prev => updateClipsList(prev)); setCustomClips(prev => updateClipsList(prev))
      } else { setCaptionState(p => ({ ...p, [clipId]: "error" })) }
    } catch { setCaptionState(p => ({ ...p, [clipId]: "error" })) }
  }

  const handleReLayout = async (clipId, mode) => {
    setClipLayouts(p => ({ ...p, [clipId]: mode }))
    if (clipId.startsWith("demo-")) return
    try {
      await axios.post(`${API_BASE}/re-layout`, { sessionId, clipId, layoutMode: mode })
      setCaptionState(p => ({ ...p, [clipId]: "idle" }))
      setCaptionUrl(p => { const n = { ...p }; delete n[clipId]; return n })
    } catch { alert("Layout change failed — try again.") }
  }

  const saveCaptionText = async (clipId, segments) => {
    const r = await axios.put(`${API_BASE}/clips/${clipId}/captions`, { sessionId, segments })
    if (r.data.success) {
      const update = (list) => list.map(c => c.id === clipId ? { ...c, captionSegments: r.data.captionSegments } : c)
      setClips(prev => update(prev)); setCustomClips(prev => update(prev))
      await handleAddCaptions(clipId)
    }
  }

  const handleExtendCut = async (clip, newStart, newEnd) => {
    if (clip.id.startsWith("demo-")) {
      setProgressMsg("Creating custom clip…")
      setTimeout(() => {
        const newClip = { ...clip, id: `demo-custom-${Date.now()}`, title: `${clip.title} (Custom Cut)`, startTime: newStart, endTime: newEnd, duration: newEnd - newStart, isCustom: true, isAiHook: false, viralScore: Math.round(clip.viralScore * 0.95), captionSegments: (clip.captionSegments || []).filter(s => s.start >= newStart && s.end <= newEnd) }
        setCustomClips(p => [...p, newClip]); setEditingClip(null); setProgressMsg("")
      }, 1000)
      return
    }
    try {
      setProgressMsg("Creating custom clip…")
      const r = await axios.post(`${API_BASE}/extend-cut-clip`, { clipId: clip.id, newStartTime: newStart, newEndTime: newEnd, sessionId })
      if (r.data.success) { setCustomClips(p => [...p, r.data.clip]); setEditingClip(null) }
      else alert(r.data.error || "Failed to create custom clip")
    } catch (e) { alert(e?.response?.data?.error || "Failed to create custom clip") }
    finally { setProgressMsg("") }
  }

  const openEdit = (clip) => setEditingClip({ ...clip, newStartTime: clip.startTime, newEndTime: clip.endTime, minStartTime: clip.minStartTime ?? Math.max(0, clip.startTime - 30), maxEndTime: clip.maxEndTime ?? clip.endTime + 30, originalStart: clip.originalStart ?? clip.startTime, originalEnd: clip.originalEnd ?? clip.endTime })

  const copyTitle = (text, key) => { navigator.clipboard.writeText(text); setCopiedId(key); setTimeout(() => setCopiedId(null), 1500) }

  const saveGeneratedClips = async () => {}

  const allClips = [...clips, ...customClips]
  const filters = [
    { key: "all",    label: "All Clips",   count: allClips.length,                              icon: <Layers size={11} /> },
    { key: "hook",   label: "AI Hooks",    count: allClips.filter(c => c.isAiHook).length,      icon: <Zap size={11} /> },
    { key: "high",   label: "Score 90+",   count: allClips.filter(c => c.viralScore >= 90).length, icon: <Flame size={11} /> },
    { key: "custom", label: "Custom Cuts", count: customClips.length,                            icon: <Scissors size={11} /> },
  ]
  const filtered = allClips.filter(c => {
    if (activeFilter === "hook")   return c.isAiHook
    if (activeFilter === "high")   return c.viralScore >= 90
    if (activeFilter === "custom") return c.isCustom
    return true
  })

  return (
    <div className="min-h-screen bg-[#F5F4F0] text-[#1A1A1A] font-sans" style={{ fontFamily: "Outfit, Inter, sans-serif" }}>
      {/* Ambient background */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(#2C4A5E 1px, transparent 1px), linear-gradient(90deg, #2C4A5E 1px, transparent 1px)", backgroundSize: "72px 72px" }} />
      <div className="fixed top-0 left-1/3 w-[700px] h-[700px] rounded-full opacity-[0.08] pointer-events-none" style={{ background: "radial-gradient(circle, #FF6B35, transparent 70%)" }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.06] pointer-events-none" style={{ background: "radial-gradient(circle, #2C4A5E, transparent 70%)" }} />

      <Navbar showHistoryBtn={true} onToggleHistory={() => setShowHistory(!showHistory)} clipsCount={allClips.length} videoInfo={videoInfo} />

      {/* ── Custom 9:16 Fullscreen Modal ───────────────────────────── */}
      {fullscreenClip && (
        <FullscreenPlayer
          clip={fullscreenClip}
          captionState={captionState[fullscreenClip.id] || "idle"}
          captionVideoUrl={captionUrl[fullscreenClip.id]}
          captionStyle={captionStyles[fullscreenClip.id] || globalCaptionStyle}
          overrides={captionOverrides[fullscreenClip.id] || {}}
          onSetOverride={(patch) => setOverride(fullscreenClip.id, patch)}
          onApply={() => handleAddCaptions(fullscreenClip.id)}
          onClose={closeFullscreen}
          startAt={resumeTime[fullscreenClip.id] || 0}
          layout={clipLayouts[fullscreenClip.id] || layout || "smart"}
          onSetLayout={(mode) => handleReLayout(fullscreenClip.id, mode)}
        />
      )}

      {/* ── History Panel ───────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowHistory(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[360px] h-full bg-white border-l border-[#2C4A5E]/10 flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2C4A5E]/8">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#FF6B35]/12 border border-[#FF6B35]/30 flex items-center justify-center">
                  <History size={13} className="text-[#FF6B35]" />
                </div>
                <span className="text-[14px] font-black text-[#2C4A5E]">Session History</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#2C4A5E]/6 text-[#2C4A5E]/40 hover:text-[#2C4A5E] transition-all">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {savedSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-[#2C4A5E]/25">
                  <History size={28} className="mb-3 opacity-30" />
                  <p className="text-[13px] font-medium">No sessions yet</p>
                  <p className="text-[11px] mt-1">Your history will appear here</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {savedSessions.slice().reverse().map(s => (
                    <button key={s.sessionId} onClick={() => restoreSession(s.sessionId)} className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F5F4F0] hover:bg-[#FF6B35]/8 border border-[#2C4A5E]/8 hover:border-[#FF6B35]/30 transition-all text-left w-full group">
                      <div className="w-8 h-8 rounded-lg bg-white border border-[#2C4A5E]/8 flex items-center justify-center flex-shrink-0">
                        <Film size={13} className="text-[#2C4A5E]/40 group-hover:text-[#FF6B35] transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-[#2C4A5E]/75 truncate">{s.url?.slice(0, 42)}…</div>
                        <div className="text-[10px] text-[#2C4A5E]/40 mt-0.5">{new Date(s.startedAt).toLocaleString()} · <span className={s.status === "completed" ? "text-emerald-700/70" : "text-[#FF6B35]/70"}>{s.status}</span></div>
                      </div>
                      <ChevronRight size={12} className="text-[#2C4A5E]/25 group-hover:text-[#2C4A5E]/60 transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-24 pt-24">

        {/* ── Dashboard Hero ──────────────────────────────────────────── */}
        <div className="mb-10">
          {/* Top row */}
          <div className="flex flex-col lg:flex-row lg:items-end gap-6 mb-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF6B35]/10 border border-[#FF6B35]/25 text-[#FF6B35] text-[10px] font-bold tracking-widest uppercase mb-4">
                <Flame size={9} strokeWidth={3} />
                AI Shorts Generator
              </div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tighter leading-tight mb-2 text-[#2C4A5E]">
                Forge viral clips
                <span className="text-[#2C4A5E]/30 ml-3 text-2xl font-semibold">in seconds</span>
              </h1>
              <p className="text-[14px] text-[#2C4A5E]/60">Paste a YouTube link or upload a video · AI finds the gold · 9:16 clips with Hinglish / Hindi / Gujarati captions</p>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { icon: <Film size={14} />, v: savedSessions.length, l: "Sessions" },
                { icon: <Scissors size={14} />, v: allClips.length, l: "Clips Made" },
                { icon: <Captions size={14} />, v: "33", l: "Caption Styles" },
              ].map(({ icon, v, l }) => (
                <div key={l} className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white border border-[#2C4A5E]/10 shadow-[0_4px_18px_rgba(44,74,94,0.06)]">
                  <span className="text-[#FF6B35]">{icon}</span>
                  <div>
                    <div className="text-[18px] font-black text-[#2C4A5E] leading-none">{v}</div>
                    <div className="text-[10px] text-[#2C4A5E]/45 mt-0.5">{l}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── URL Input Card ────────────────────────────────────────── */}
          <div className="relative bg-white border border-[#2C4A5E]/10 rounded-2xl p-6 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FF6B35]/40 to-transparent" />

            <div className="flex items-center gap-2 mb-4">
              <Link2 size={13} className="text-[#FF6B35]" />
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#2C4A5E]/60">YouTube URL</span>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row">
              <div className="relative flex-1 group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2C4A5E]/30 group-focus-within:text-[#FF6B35] transition-colors">
                  <Link2 size={15} />
                </div>
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !processing && handleGenerate()}
                  disabled={processing}
                  className="w-full bg-[#F5F4F0] border border-[#2C4A5E]/15 focus:border-[#FF6B35]/50 rounded-xl pl-11 pr-4 py-3.5 text-[14px] text-[#2C4A5E] placeholder-[#2C4A5E]/40 outline-none transition-all disabled:opacity-50 focus:shadow-[0_0_0_3px_rgba(255,107,53,0.10)]"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={processing}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-[#FF6B35] hover:bg-[#e85a28] disabled:bg-[#FF6B35]/40 text-white text-[14px] font-black rounded-xl transition-all hover:shadow-[0_0_24px_rgba(255,107,53,0.35)] active:scale-[0.97] whitespace-nowrap"
              >
                {processing
                  ? <><span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Processing…</>
                  : <><Zap size={15} strokeWidth={2.5} /> Generate Clips</>
                }
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-3 mt-4">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#2C4A5E]/50 mb-1.5">Caption language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} disabled={processing}
                  className="w-full px-3 py-2.5 bg-[#F5F4F0] border border-[#2C4A5E]/15 rounded-xl text-[13px] text-[#2C4A5E] font-semibold outline-none disabled:opacity-50 focus:border-[#FF6B35]/50">
                  {LANGUAGE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#2C4A5E]/50 mb-1.5">Framing</label>
                <select value={layout} onChange={e => setLayout(e.target.value)} disabled={processing}
                  className="w-full px-3 py-2.5 bg-[#F5F4F0] border border-[#2C4A5E]/15 rounded-xl text-[13px] text-[#2C4A5E] font-semibold outline-none disabled:opacity-50 focus:border-[#FF6B35]/50">
                  {LAYOUT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label} — {o.desc}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#2C4A5E]/50 mb-1.5">Or upload a video</label>
                <div className="flex gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2C4A5E] hover:bg-[#3a6076] text-white text-[13px] font-bold cursor-pointer transition-all">
                    <Upload size={14} /> {uploadFile ? uploadFile.name.slice(0, 18) : "Choose video"}
                    <input type="file" accept="video/*" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} disabled={processing} />
                  </label>
                  <button onClick={handleUpload} disabled={processing || !uploadFile}
                    className="px-4 py-2.5 rounded-xl bg-[#FF6B35] hover:bg-[#e85a28] disabled:opacity-40 text-white text-[13px] font-black transition-all">Caption it</button>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 mt-4 px-4 py-3 bg-red-500/[0.06] border border-red-500/20 rounded-xl text-[13px] text-red-400">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                {error}
              </div>
            )}

            {!processing && !videoInfo && (
              <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-[#2C4A5E]/10">
                {[["🎯","AI Hook Detection"],["✂️","Smart 9:16 Crop"],["🎙️","Whisper Captions"],["📺","True 1080p"],["🇮🇳","Hindi + Hinglish"],["🇬🇺","Gujarati"],["🎨","33 Caption Styles"],["📦","Background Process"]].map(([icon, label]) => (
                  <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[#2C4A5E]/60 bg-[#F5F4F0] border border-[#2C4A5E]/10 rounded-full hover:border-[#FF6B35]/40 hover:text-[#2C4A5E] transition-all">
                    <span>{icon}</span><span>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {processing && (
              <div className="mt-5 pt-5 border-t border-[#2C4A5E]/8">
                <div className="relative h-1.5 bg-[#2C4A5E]/8 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-[#FF6B35] rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(255,107,53,0.35)]" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] text-[#2C4A5E]/55">{progressMsg}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-[#2C4A5E]/45 font-mono">
                    <Clock size={10} /> {fmt(elapsed)} · {progressPct}%
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FF6B35]/[0.05] border border-[#FF6B35]/15 rounded-xl text-[11px] text-[#FF6B35]/80">
                  <Zap size={11} />
                  Processing continues even if you close this tab — come back anytime.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Info Ribbon ──────────────────────────────────────────────── */}
        {videoInfo && (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 bg-white border border-[#2C4A5E]/10 shadow-[0_4px_18px_rgba(44,74,94,0.06)] rounded-2xl mb-8">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600/10 border border-emerald-600/20 rounded-lg text-[11px] font-black text-emerald-700">
              <Check size={10} strokeWidth={3} /> Complete
            </div>
            {[{ e: "🎬", v: videoInfo.videoType }, { e: ["hindi","hinglish","gujarati","gujlish"].includes(videoInfo.language) ? "🇮🇳" : "🇺🇸", v: videoInfo.language }, { e: "⏱", v: `${Math.floor(videoInfo.duration / 60)}m` }, { e: "📺", v: videoInfo.quality }, { e: "💾", v: `${videoInfo.fileSize}MB` }].map(({ e, v }) => v && (
              <span key={v} className="text-[12px] text-[#2C4A5E]/50 flex items-center gap-1">{e} {v}</span>
            ))}
            <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF6B35]/10 border border-[#FF6B35]/25">
              <Zap size={11} className="text-[#FF6B35]" strokeWidth={2.5} />
              <span className="text-[12px] font-black text-[#FF6B35]">{allClips.length} clips ready</span>
            </div>
          </div>
        )}

        {/* Whisper warning */}
        {allClips.length > 0 && !videoInfo?.hasRealCaptions && (
          <div className="flex items-center gap-2 px-4 py-3 bg-[#FF6B35]/[0.06] border border-[#FF6B35]/15 rounded-xl mb-6 text-[12px] text-[#2C4A5E]/60 flex-wrap">
            ⚠️ <strong className="text-[#FF6B35]">Placeholder captions</strong> — install whisper for real word-by-word captions
          </div>
        )}

        {/* ── Processing loading state ─────────────────────────────────── */}
        {processing && (
          <div className="flex flex-col items-center text-center py-20 px-8 bg-white border border-[#2C4A5E]/10 shadow-[0_8px_30px_rgba(44,74,94,0.07)] rounded-2xl mb-8">
            <div className="relative w-16 h-16 flex items-center justify-center mb-6">
              <div className="absolute inset-0 border-2 border-transparent border-t-[#FF6B35] rounded-full animate-spin" />
              <div className="absolute inset-[5px] border-2 border-transparent border-t-[#FF6B35]/40 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.7s" }} />
              <Film size={20} className="text-[#2C4A5E]/25" />
            </div>
            <h3 className="text-[22px] font-black mb-2 tracking-tight text-[#2C4A5E]">AI is forging your clips</h3>
            <p className="text-[13px] text-[#2C4A5E]/50 mb-10 max-w-sm">Close the tab freely — processing runs in the background and you can return anytime</p>
            <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
              {[["🎵","Detecting high-energy audio hooks"],["✂️","Planning 9:16 crop + layout"],["🎙️","Whisper transcription"],["📦","4× parallel encoding"]].map(([icon, text]) => (
                <div key={text} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#F5F4F0] border border-[#2C4A5E]/8">
                  <span className="text-base">{icon}</span>
                  <span className="text-[11px] text-[#2C4A5E]/60 text-left leading-snug">{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Clips Section ──────────────────────────────────────────────── */}
        {allClips.length > 0 && !processing && (
          <section>
            {/* Section header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="flex items-center gap-2.5 text-[22px] font-black tracking-tight mb-1 text-[#2C4A5E]">
                  <TrendingUp size={20} className="text-[#FF6B35]" />
                  {allClips.length} Clips Ready
                </h2>
                <p className="text-[12px] text-[#2C4A5E]/50">1080p · seekable player · word-by-word captions{videoInfo?.hasRealCaptions ? " · Whisper ✅" : ""}</p>
              </div>

              {/* Global caption style — visual preset gallery (like CapCut presets) */}
              <div className="w-full sm:w-auto">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[10px] text-[#2C4A5E]/40 font-semibold uppercase tracking-wider">Default style</span>
                  <button
                    onClick={() => setShowGlobalPicker(true)}
                    className="text-[10px] font-bold text-[#FF6B35] hover:text-[#e85a28] flex items-center gap-1 transition-colors"
                  >
                    View all 33 <ChevronRight size={11} />
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1.5 max-w-full sm:max-w-[640px] preset-scroll">
                  {Object.values(CAPTION_STYLES).map(st => (
                    <div key={st.id} className="w-[96px] flex-shrink-0">
                      <StylePreviewCard
                        style={st}
                        active={globalCaptionStyle === st.id}
                        onClick={() => setGlobalCaptionStyle(st.id)}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-7 flex-wrap">
              {filters.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all border ${activeFilter === f.key ? "bg-[#FF6B35]/10 border-[#FF6B35]/30 text-[#FF6B35]" : "bg-white/80 border-[#2C4A5E]/10 text-[#2C4A5E]/55 hover:text-[#2C4A5E] hover:border-[#2C4A5E]/25"}`}>
                  <span className={activeFilter === f.key ? "text-[#FF6B35]" : "text-[#2C4A5E]/30"}>{f.icon}</span>
                  {f.label}
                  {f.count > 0 && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${activeFilter === f.key ? "bg-[#FF6B35]/20 text-[#FF6B35]" : "bg-[#2C4A5E]/8 text-[#2C4A5E]/40"}`}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((clip, idx) => (
                <div key={clip.id} style={{ animation: `slideUp 0.4s ease ${idx * 0.06}s both` }}>
                  <ClipCard
                    clip={clip}
                    captionState={captionState[clip.id] || "idle"}
                    captionVideoUrl={captionUrl[clip.id]}
                    dlLoading={dlLoading}
                    copiedId={copiedId}
                    expanded={!!expanded[clip.id]}
                    captionStyle={captionStyles[clip.id] || globalCaptionStyle}
                    showStylePicker={showStylePicker === clip.id}
                    onToggleStylePicker={() => setShowStylePicker(showStylePicker === clip.id ? null : clip.id)}
                    onSetCaptionStyle={(style) => { setCaptionStyles(p => ({ ...p, [clip.id]: style })); setShowStylePicker(null) }}
                    onExpand={() => setExpanded(p => ({ ...p, [clip.id]: !p[clip.id] }))}
                    onDownloadClean={() => download(clip.id, `${clip.id}_clean.mp4`, false)}
                    onAddCaptions={() => handleAddCaptions(clip.id)}
                    onDownloadCaptioned={() => download(clip.id, `${clip.id}_captioned.mp4`, true)}
                    onEdit={() => openEdit(clip)}
                    onCopyTitle={copyTitle}
                    selectedFont={selectedFonts[clip.id] || "default"}
                    onSetCaptionFont={(font) => setSelectedFonts(p => ({ ...p, [clip.id]: font }))}
                    onFullscreen={() => handleOpenFullscreen(clip)}
                    resumeTime={resumeTime[clip.id] || 0}
                    overrides={captionOverrides[clip.id] || {}}
                    onSetOverride={(patch) => setOverride(clip.id, patch)}
                    onResetOverrides={() => setCaptionOverrides(p => { const n = { ...p }; delete n[clip.id]; return n })}
                    editing={editingCaps === clip.id}
                    onToggleEdit={() => setEditingCaps(editingCaps === clip.id ? null : clip.id)}
                    editingText={editingText === clip.id}
                    onToggleText={() => setEditingText(editingText === clip.id ? null : clip.id)}
                    onSaveText={(segments) => saveCaptionText(clip.id, segments)}
                    layout={clipLayouts[clip.id] || layout || "smart"}
                    onSetLayout={(mode) => handleReLayout(clip.id, mode)}
                  />
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="flex flex-col items-center py-20 text-[#2C4A5E]/25">
                <Layers size={28} className="mb-3 opacity-40" />
                <p className="text-[14px] font-medium">No clips match this filter</p>
              </div>
            )}
          </section>
        )}

        {/* ── Past Clips ──────────────────────────────────────────────── */}
        {pastClips.length > 0 && (
          <section className="mt-16">
            <h2 className="flex items-center gap-2.5 text-[20px] font-black tracking-tight mb-6 text-[#2C4A5E]">
              <History size={18} className="text-[#FF6B35]" />
              Past Clips
              <span className="text-[13px] font-semibold text-[#2C4A5E]/35 ml-1">({pastClips.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {pastClips.slice(0, 12).map((clip) => (
                <div key={clip.clipId} className="bg-white border border-[#2C4A5E]/10 rounded-2xl overflow-hidden hover:border-[#FF6B35]/35 hover:-translate-y-0.5 transition-all group">
                  <div className="relative h-40 bg-black overflow-hidden">
                    <img src={clip.thumbnail || ""} alt={clip.title} className="w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />
                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-white/60">{fmt(clip.duration || 0)}</div>
                    {clip.viralScore && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm text-[10px] font-black text-[#FF6B35]">🔥 {clip.viralScore}%</div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <h3 className="text-[12px] font-bold text-[#2C4A5E] mb-1 line-clamp-2 leading-snug">{clip.title || "Untitled Clip"}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#2C4A5E]/35 mb-3">
                      <span>{clip.videoType || "general"}</span>
                      <span>·</span>
                      <span>{["hindi","hinglish","gujarati","gujlish"].includes(clip.language) ? "🇮🇳" : "🇺🇸"}</span>
                    </div>
                    <a href={`${API_ROOT}/api/download/${clip.clipId}`} download={`${clip.clipId}.mp4`} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#FF6B35]/10 border border-[#FF6B35]/25 text-[#FF6B35] text-[11px] font-bold hover:bg-[#FF6B35]/20 transition-all">
                      <Download size={11} /> Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
            {pastClips.length > 12 && (
              <p className="text-center mt-5 text-[11px] text-[#2C4A5E]/35">Showing 12 of {pastClips.length} past clips</p>
            )}
          </section>
        )}
      </div>

      {showGlobalPicker && (
        <CaptionStylePicker
          currentStyle={globalCaptionStyle}
          onSelect={(style) => { setGlobalCaptionStyle(style); setShowGlobalPicker(false) }}
          onClose={() => setShowGlobalPicker(false)}
        />
      )}

      {editingClip && (
        <ExtendCutModal
          clip={editingClip}
          onClose={() => setEditingClip(null)}
          onSave={handleExtendCut}
          formatDuration={fmt}
          videoUrl={API_ROOT + "/api/preview-original/" + sessionId}
        />
      )}

      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fsIn   { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes sp-pop { 0%,100%{transform:scale(1)} 45%{transform:scale(1.12)} }
        @keyframes sp-bounce { 0%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(-4px) scale(1.1)} }
        @keyframes sp-karaoke { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.5)} }
        @keyframes sp-neon { 0%,100%{filter:drop-shadow(0 0 2px currentColor)} 50%{filter:drop-shadow(0 0 10px currentColor)} }
        @keyframes sp-slide { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(-4px);opacity:.9} }
        @keyframes sp-fade { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes sp-pill { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes sp-typewriter { 0%,100%{clip-path:inset(0 0 0 0)} 50%{clip-path:inset(0 10% 0 0)} }
        .style-card:hover .sp-anim-pop { animation: sp-pop 1.5s ease-in-out infinite; }
        .style-card:hover .sp-anim-bounce { animation: sp-bounce 1.3s ease-in-out infinite; }
        .style-card:hover .sp-anim-karaoke { animation: sp-karaoke 1.4s ease-in-out infinite; }
        .style-card:hover .sp-anim-neon { animation: sp-neon 1.5s ease-in-out infinite; }
        .style-card:hover .sp-anim-slide { animation: sp-slide 1.6s ease-in-out infinite; }
        .style-card:hover .sp-anim-fade { animation: sp-fade 1.8s ease-in-out infinite; }
        .style-card:hover .sp-anim-pill { animation: sp-pill 1.4s ease-in-out infinite; }
        .style-card:hover .sp-anim-typewriter { animation: sp-typewriter 1.6s steps(6,end) infinite; }
        .style-card:hover .sp-anim-boxed { animation: sp-karaoke 1.5s ease-in-out infinite; }
        .preset-scroll { scrollbar-width: thin; scrollbar-color: rgba(44,74,94,0.2) transparent; }
        .preset-scroll::-webkit-scrollbar { height: 5px; }
        .preset-scroll::-webkit-scrollbar-thumb { background: rgba(44,74,94,0.18); border-radius: 99px; }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Custom 9:16 Fullscreen Player ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function FullscreenPlayer({ clip, captionState, captionVideoUrl, captionStyle, overrides = {}, onSetOverride, onApply, onClose, startAt = 0, layout = "smart", onSetLayout }) {
  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [showUI, setShowUI]           = useState(true)
  const [posEdit, setPosEdit]         = useState(false)
  const hideTimer = useRef(null)
  const score = clip.viralScore || 0
  const sm    = scoreMeta(score)

  const styleInfo = CAPTION_STYLES[captionStyle] || CAPTION_STYLES.hormozi1
  const cap = {
    textColor: styleInfo.primaryColor,
    fontSize: styleInfo.fontSize,
    positionX: 50,
    positionY: styleInfo.position === "center" ? 44 : 79,
    ...overrides,
  }

  const capReady = captionState === "ready"
  const src = capReady && captionVideoUrl
    ? (captionVideoUrl.startsWith("http") ? captionVideoUrl : API_ROOT + captionVideoUrl)
    : clip.id.startsWith("demo-")
    ? clip.videoUrl
    : `${API_ROOT}/api/preview/${clip.id}`

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) videoRef.current.pause()
    else videoRef.current.play().catch(() => {})
  }

  // Close reports the playback position back so the card resumes from here.
  const requestClose = () => {
    try { videoRef.current?.pause() } catch {}
    onClose?.(videoRef.current?.currentTime ?? 0)
  }

  const onCapDragStart = (e) => {
    e.stopPropagation(); e.preventDefault()
    const move = (ev) => {
      if (!stageRef.current) return
      const rect = stageRef.current.getBoundingClientRect()
      const cx = ((ev.clientX - rect.left) / rect.width) * 100
      const cy = ((ev.clientY - rect.top) / rect.height) * 100
      onSetOverride?.({ positionX: Math.round(Math.max(6, Math.min(94, cx))), positionY: Math.round(Math.max(6, Math.min(94, cy))) })
    }
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up) }
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up)
  }

  const handleSeek = (e) => {
    if (!videoRef.current || !duration) return
    videoRef.current.currentTime = (parseFloat(e.target.value) / 100) * duration
  }

  const skip = (s) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + s)) }

  const revealUI = () => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (playing) hideTimer.current = setTimeout(() => setShowUI(false), 3000)
  }

  useEffect(() => {
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [])

  useEffect(() => {
    if (!playing) { setShowUI(true); if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [playing])

  // Esc to close
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") requestClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex items-center justify-center"
      style={{ animation: "fsIn 0.2s ease both" }}
      onMouseMove={revealUI}
      onClick={revealUI}
    >
      {/* Blurred background */}
      <div className="absolute inset-0">
        <img src={clip.thumbnail} alt="" className="w-full h-full object-cover opacity-20 blur-2xl scale-110" />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      {/* ── 9:16 video container ── */}
      <div ref={stageRef} className="relative z-10 h-full flex items-center justify-center overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: "100vh", maxWidth: "calc(100vh * 9/16)" }} onClick={e => e.stopPropagation()}>

        <video
          ref={videoRef}
          src={src}
          poster={clip.thumbnail?.startsWith("http") ? clip.thumbnail : API_ROOT + clip.thumbnail}
          className="w-full h-full object-cover"
          playsInline
          muted={muted}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrentTime(0) }}
          onTimeUpdate={() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime) }}
          onLoadedMetadata={() => {
            if (!videoRef.current) return
            setDuration(videoRef.current.duration || 0)
            // Continue seamlessly from the card (no "click play again"):
            if (startAt > 0.3) {
              try { videoRef.current.currentTime = startAt } catch {}
              videoRef.current.play().catch(() => {})
            }
          }}
          onClick={() => { if (!posEdit) togglePlay() }}
        />

        {/* Draggable caption position guide (position-edit mode only) */}
        {posEdit && (
          <div
            onMouseDown={onCapDragStart}
            className="absolute z-30 cursor-move select-none px-3 py-1.5 rounded-lg border-2 border-dashed border-[#FF6B35]/80 bg-black/30 flex items-center gap-1.5"
            style={{ left: `${cap.positionX}%`, top: `${cap.positionY}%`, transform: "translate(-50%,-50%)", maxWidth: "92%" }}
            title="Drag to reposition captions"
          >
            <Move size={14} className="text-[#FF6B35] flex-shrink-0" />
            <span style={{ fontFamily: styleInfo.font, fontWeight: styleInfo.bold ? 800 : 500, fontStyle: styleInfo.italic ? "italic" : "normal", color: cap.textColor, fontSize: Math.max(14, Math.round(cap.fontSize / 3.2)), lineHeight: 1, whiteSpace: "nowrap", textShadow: "0 2px 6px #000, 0 0 3px #000", textTransform: styleInfo.uppercase ? "uppercase" : "none" }}>
              {styleInfo.preview || "Caption"}
            </span>
          </div>
        )}

        {/* ── Top bar ── */}
        <div className={`absolute top-0 left-0 right-0 px-4 pt-4 pb-8 transition-opacity duration-300 ${showUI ? "opacity-100" : "opacity-0"}`}
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)" }}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 mr-3">
              <h3 className="text-[14px] font-black text-white leading-snug line-clamp-2 mb-1">{clip.title}</h3>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${sm.bg} ${sm.border} ${sm.color}`}>
                  🔥 {score}%
                </span>
                {clip.isAiHook && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FF6B35]/20 border border-[#FF6B35]/30 text-[#FF6B35]">
                    <Zap size={8} strokeWidth={3} /> Hook
                  </span>
                )}
                {capReady && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                    📝 Captions
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={requestClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Center play/pause tap indicator ── */}
        {!playing && !posEdit && (
          <button
            className="absolute inset-0 flex items-center justify-center"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center hover:bg-white/25 transition-all">
              <Play size={24} fill="white" color="white" className="ml-1" />
            </div>
          </button>
        )}

        {/* ── Bottom controls ── */}
        <div className={`absolute bottom-0 left-0 right-0 px-4 pb-5 pt-10 transition-opacity duration-300 ${showUI ? "opacity-100" : "opacity-0"}`}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}>

          {/* Seek bar */}
          <div className="relative h-6 flex items-center mb-3 group cursor-pointer" onClick={e => e.stopPropagation()}>
            <div className="absolute left-0 right-0 h-[3px] bg-white/15 rounded-full" />
            <div className="absolute left-0 h-[3px] bg-[#FF6B35] rounded-full transition-all" style={{ width: `${pct}%` }} />
            {/* Orange thumb */}
            <div className="absolute w-3.5 h-3.5 rounded-full bg-[#FF6B35] shadow-[0_0_8px_rgba(255,107,53,0.6)] -translate-x-1/2 transition-all" style={{ left: `${pct}%` }} />
            <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer" min="0" max="100" step="0.1" value={pct} onChange={handleSeek} onClick={e => e.stopPropagation()} />
          </div>

          {/* Caption position editor (toggle with the Move button) */}
          {onSetOverride && posEdit && (
            <div className="flex items-center gap-2 mb-3 bg-black/50 border border-[#FF6B35]/25 rounded-xl px-3 py-2" onClick={e => e.stopPropagation()}>
              <Move size={12} className="text-[#FF6B35] flex-shrink-0" />
              <span className="text-[10px] font-bold text-white/50 whitespace-nowrap">Height</span>
              <input type="range" min="6" max="94" value={cap.positionY} onChange={e => onSetOverride({ positionY: Number(e.target.value) })} className="flex-1 accent-[#FF6B35] h-1" />
              <span className="text-[10px] font-mono text-white/50 w-9 text-right">{cap.positionY}%</span>
              <button onClick={onApply} className="px-3 py-1 rounded-lg bg-[#FF6B35] text-white text-[11px] font-black hover:bg-[#e85a28] transition-all whitespace-nowrap">Apply</button>
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 text-white transition-all" onClick={() => skip(-5)}>
                <SkipBack size={15} />
              </button>
              <button className="w-11 h-11 flex items-center justify-center rounded-full bg-[#FF6B35] hover:bg-[#e85a28] text-white transition-all shadow-[0_0_16px_rgba(255,107,53,0.4)]" onClick={togglePlay}>
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>
              <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 text-white transition-all" onClick={() => skip(5)}>
                <SkipForward size={15} />
              </button>
              <span className="text-[11px] font-mono text-white/50 ml-1">{fmt(currentTime)} / {fmt(duration || clip.duration)}</span>
            </div>
            {onSetLayout && (
              <div className="flex items-center gap-1">
                {LAYOUT_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => onSetLayout(o.id)} title={o.desc}
                    className={`px-2 py-1 rounded-full text-[9px] font-black transition-all ${layout === o.id ? "bg-[#FF6B35] text-white" : "bg-white/10 text-white/60 hover:text-white"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              {onSetOverride && (
                <button className={`w-9 h-9 flex items-center justify-center rounded-full border transition-all ${posEdit ? "bg-[#FF6B35] text-white border-[#FF6B35]" : "bg-white/10 hover:bg-white/18 text-white border-transparent"}`} onClick={() => setPosEdit(v => !v)} title="Move captions">
                  <Move size={15} />
                </button>
              )}
              <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 text-white transition-all" onClick={() => { if (videoRef.current) { videoRef.current.muted = !muted; setMuted(!muted) } }}>
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              {/* Aspect ratio label */}
              <div className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-black text-white/60">
                9:16
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-white/20 transition-opacity duration-300 ${showUI ? "opacity-100" : "opacity-0"}`}>
        Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/30 font-mono text-[10px]">Esc</kbd> to close
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Caption Text Editor (fix wrong Whisper words, then re-burn) ──────────────
// ─────────────────────────────────────────────────────────────────────────────
function CaptionTextEditor({ clip, onClose, onSave }) {
  const [draft, setDraft] = useState(() => (clip.captionSegments || []).map(s => s.word ?? s.text ?? ""))
  const [saving, setSaving] = useState(false)
  const update = (i, v) => setDraft(d => d.map((w, j) => (j === i ? v : w)))
  const handleSave = async () => {
    setSaving(true)
    try {
      const base = clip.captionSegments || []
      const segments = draft.map((w, i) => ({
        word: w.trim() || (base[i]?.word || ""),
        start: base[i]?.start ?? i * 0.4,
        end: base[i]?.end ?? i * 0.4 + 0.35,
      }))
      await onSave(segments)
      onClose()
    } catch { alert("Failed to save captions.") }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-[#2C4A5E]/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[560px] max-h-[80vh] flex flex-col bg-white border border-[#2C4A5E]/10 rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(44,74,94,0.25)]" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-[#2C4A5E]/8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#FF6B35]/12 border border-[#FF6B35]/30 flex items-center justify-center">
              <Pencil size={13} className="text-[#FF6B35]" />
            </div>
            <div>
              <span className="text-[14px] font-black text-[#2C4A5E] block leading-none">Edit caption words</span>
              <span className="text-[10px] text-[#2C4A5E]/45">Fix any misheard words, then re-burn.</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#2C4A5E]/6 text-[#2C4A5E]/40 hover:text-[#2C4A5E] transition-all"><X size={14} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            {(clip.captionSegments || []).map((_, i) => (
              <input key={i} value={draft[i] ?? ""} onChange={e => update(i, e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-[#F5F4F0] border border-[#2C4A5E]/10 text-[12px] text-[#2C4A5E] font-semibold outline-none focus:border-[#FF6B35]/60"
                style={{ width: `${Math.max(64, (draft[i]?.length || 4) * 8 + 20)}px` }} />
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 flex gap-2 px-4 py-3 border-t border-[#2C4A5E]/8">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-[#2C4A5E]/10 text-[12px] font-semibold text-[#2C4A5E]/55 hover:text-[#2C4A5E]">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-[#FF6B35] hover:bg-[#e85a28] text-white text-[12px] font-black disabled:opacity-50">
            {saving ? "Re-burning…" : "Save & re-burn captions"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Caption Style Picker ──────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ── Caption Style Gallery — visual preset cards (mirrors the burned look) ────
// ─────────────────────────────────────────────────────────────────────────────
const previewSpanStyle = (style, compact) => {
  const scale = compact ? 0.145 : 0.21
  return {
    fontFamily: `'${style.font}', Outfit, sans-serif`,
    fontWeight: style.bold ? 800 : 500,
    fontStyle: style.italic ? "italic" : "normal",
    textTransform: style.uppercase ? "uppercase" : "none",
    color: style.primaryColor,
    fontSize: Math.max(12, Math.round((style.fontSize || 88) * scale)),
    lineHeight: 1.05,
    letterSpacing: "0.01em",
    textAlign: "center",
    padding: style.bgBox ? (compact ? "2px 7px" : "3px 10px") : 0,
    borderRadius: style.id === "pill" ? 99 : 6,
    background: style.bgBox ? style.bgColor : "transparent",
    WebkitTextStroke: !style.bgBox ? `0.5px ${style.outlineColor}` : "none",
    textShadow: style.bgBox ? "none" : "0 2px 8px rgba(0,0,0,0.5)",
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  }
}

function StylePreviewCard({ style, active, onClick, size = "md" }) {
  const compact = size === "sm"
  const spanStyle = previewSpanStyle(style, compact)
  return (
    <button
      onClick={onClick}
      title={style.description}
      className={`style-card group relative flex w-full flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 ${
        active
          ? "border-[#FF6B35] bg-[#0E1116] shadow-[0_10px_30px_rgba(255,107,53,0.28)]"
          : "border-[#2C4A5E]/12 bg-[#0E1116] hover:border-[#FF6B35]/55 hover:shadow-[0_10px_26px_rgba(44,74,94,0.2)]"
      }`}
    >
      <div className="flex items-center justify-between gap-1 px-2.5 pt-2 pb-1">
        <span className="truncate text-[9px] font-bold uppercase tracking-wider text-white/60 group-hover:text-white/85">{style.name}</span>
        {active && (
          <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-[#FF6B35]">
            <Check size={8} className="text-white" strokeWidth={4} />
          </span>
        )}
      </div>
      <div
        className="mx-2 mb-2 flex items-center justify-center overflow-hidden rounded-lg bg-[#191D24]"
        style={{ height: compact ? 50 : 78, padding: "0 8px" }}
      >
        <span className={`sp-anim-${style.animation || "pop"}`} style={spanStyle}>
          This is a{" "}
          <span style={{ color: style.highlightColor, WebkitTextStroke: spanStyle.WebkitTextStroke }}>
            sample
          </span>
        </span>
      </div>
    </button>
  )
}

function CaptionStylePicker({ currentStyle, onSelect, onClose }) {
  const current = CAPTION_STYLES[currentStyle] || CAPTION_STYLES.hormozi1
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#2C4A5E]/45 backdrop-blur-md" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[900px] flex-col overflow-hidden rounded-3xl border border-[#2C4A5E]/10 bg-[#F7F6F2] shadow-[0_30px_90px_rgba(44,74,94,0.3)]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#2C4A5E]/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#FF6B35]/30 bg-[#FF6B35]/12">
              <Palette size={15} className="text-[#FF6B35]" />
            </div>
            <div>
              <h3 className="text-[15px] font-black leading-tight text-[#2C4A5E]">Caption presets</h3>
              <p className="text-[10px] text-[#2C4A5E]/45">33 animated styles · preview = download</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#2C4A5E]/40 transition-all hover:bg-[#2C4A5E]/6 hover:text-[#2C4A5E]">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.values(CAPTION_STYLES).map(style => (
              <StylePreviewCard key={style.id} style={style} active={currentStyle === style.id} onClick={() => onSelect(style.id)} size="md" />
            ))}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#2C4A5E]/8 bg-white/60 px-6 py-3">
          <span className="text-[10px] text-[#2C4A5E]/40">Hover a card to see its animation</span>
          <span className="text-[10px] font-bold text-[#FF6B35]">Selected · {current.name}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Clip Card ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function ClipCard({ clip, captionState, captionVideoUrl, dlLoading, copiedId, expanded, captionStyle, showStylePicker, onToggleStylePicker, onSetCaptionStyle, onExpand, onDownloadClean, onAddCaptions, onDownloadCaptioned, onEdit, onCopyTitle, selectedFont, onSetCaptionFont, onFullscreen, resumeTime = 0, overrides = {}, onSetOverride, onResetOverrides, editing, onToggleEdit, editingText, onToggleText, onSaveText, layout = "smart", onSetLayout }) {
  const videoRef   = useRef(null)
  const [playing, setPlaying]       = useState(false)
  const [muted, setMuted]           = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [buffered, setBuffered]     = useState(0)
  const [hovered, setHovered]       = useState(false)
  const [videoKey, setVideoKey]     = useState(0)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef(null)

  const score     = clip.viralScore || 0
  const sm        = scoreMeta(score)
  const capReady  = captionState === "ready"
  const capLoad   = captionState === "loading"
  const capErr    = captionState === "error"
  const styleInfo = CAPTION_STYLES[captionStyle] || CAPTION_STYLES.hormozi1
  const paneRef = useRef(null)

  // Effective caption settings = style defaults overlaid with user edits.
  const capDefaults = {
    textColor: styleInfo.primaryColor,
    highlightColor: styleInfo.highlightColor,
    fontSize: styleInfo.fontSize,
    positionX: 50,
    positionY: styleInfo.position === "center" ? 44 : 79,
    letterSpacing: 1,
    highlightWords: true,
  }
  const cap = { ...capDefaults, ...overrides }

  const baseVideoSrc = capReady && captionVideoUrl
    ? (captionVideoUrl.startsWith("http") ? captionVideoUrl : API_ROOT + captionVideoUrl)
    : clip.id.startsWith("demo-")
    ? clip.videoUrl
    : `${API_ROOT}/api/preview/${clip.id}`

  useEffect(() => {
    if (capReady && captionVideoUrl) {
      setPlaying(false)
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.load() }
      setCurrentTime(0); setVideoKey(k => k + 1)
    }
  }, [captionVideoUrl, capReady])

  // Position transfer from the fullscreen player — seek when the reported
  // resume time changes (also fires when fullscreen advances past the card).
  useEffect(() => {
    if (resumeTime > 0.3 && videoRef.current && videoRef.current.readyState > 0) {
      try { videoRef.current.currentTime = resumeTime } catch {}
      setCurrentTime(resumeTime)
    }
  }, [resumeTime])

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (playing) { videoRef.current.pause() }
    else {
      // Exclusive playback — pause every other video (fixes two clips
      // playing at once when switching around / exiting fullscreen).
      document.querySelectorAll("video").forEach(v => { if (v !== videoRef.current) { try { v.pause() } catch {} } })
      videoRef.current.play().catch(() => {})
    }
  }, [playing])

  const toggleMute = () => { if (!videoRef.current) return; videoRef.current.muted = !muted; setMuted(!muted) }
  const handleSeek = (e) => { if (!videoRef.current || !duration) return; videoRef.current.currentTime = (parseFloat(e.target.value) / 100) * duration; setCurrentTime(videoRef.current.currentTime) }
  const skip = (secs) => { if (!videoRef.current) return; videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + secs)) }

  const onTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
    if (videoRef.current.buffered.length > 0) setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1))
  }

  const pct     = duration > 0 ? (currentTime / duration) * 100 : 0
  const buffPct = duration > 0 ? (buffered / duration) * 100 : 0

  const autoHideControls = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setShowControls(true)
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 2500)
  }

  useEffect(() => {
    if (!playing) setShowControls(true)
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [playing])

  return (
    <div
      className={`group bg-white border rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${hovered ? "border-[#FF6B35]/45 shadow-[0_16px_44px_rgba(44,74,94,0.16)] -translate-y-1" : "border-[#2C4A5E]/10 shadow-[0_4px_18px_rgba(44,74,94,0.06)]"} ${clip.isAiHook ? "border-[#FF6B35]/25" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowControls(true) }}
    >
      {/* ── Video pane ── */}
      <div ref={paneRef} className="relative bg-black cursor-pointer overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: 320 }} onMouseMove={autoHideControls} onClick={togglePlay}>
        <video
          key={videoKey} ref={videoRef} src={baseVideoSrc} data-clip-video={clip.id}
          poster={clip.thumbnail?.startsWith("http") ? clip.thumbnail : API_ROOT + clip.thumbnail}
          className="w-full h-full object-cover block"
          playsInline preload="none"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrentTime(0) }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration || 0) }}
          muted={muted}
        />

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

        {/* Top-left badge: quality */}
        <div className="absolute top-2.5 left-2.5">
          <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-black text-white/70">
            {clip.quality || "1080p"}
          </span>
        </div>

        {/* Top-right badges */}
        <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5">
          <span className={`px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm text-[9px] font-black border ${sm.border} ${sm.color}`}>
            🔥 {score}%
          </span>
          {clip.isAiHook && <span className="px-2 py-1 rounded-lg bg-[#FF6B35] text-[9px] font-black text-white">🎯 Hook</span>}
          {clip.isCustom && <span className="px-2 py-1 rounded-lg bg-purple-500/80 text-[9px] font-black text-white">✂️ Custom</span>}
          {capReady && <span className="px-2 py-1 rounded-lg bg-emerald-500/70 text-[9px] font-bold text-white">📝 CC</span>}
        </div>

        {/* Center play button */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center group-hover:bg-white/25 transition-all">
              <Play size={18} fill="white" color="white" className="ml-0.5" />
            </div>
          </div>
        )}

        {/* Bottom controls overlay */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-opacity duration-200 ${showControls || !playing ? "opacity-100" : "opacity-0"}`}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}
        >
          {/* Seek bar */}
          <div className="relative h-5 mx-3 flex items-center cursor-pointer group/seek" onClick={e => e.stopPropagation()}>
            <div className="absolute left-0 right-0 h-[3px] bg-white/10 rounded-full" />
            <div className="absolute left-0 h-[3px] bg-white/20 rounded-full" style={{ width: `${buffPct}%` }} />
            <div className="absolute left-0 h-[3px] bg-[#FF6B35] rounded-full" style={{ width: `${pct}%` }} />
            <div className="absolute w-3 h-3 rounded-full bg-[#FF6B35] shadow-[0_0_6px_rgba(255,107,53,0.8)] -translate-x-1/2 opacity-0 group-hover/seek:opacity-100 transition-opacity" style={{ left: `${pct}%` }} />
            <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer" min="0" max="100" step="0.1" value={pct} onChange={handleSeek} onClick={e => e.stopPropagation()} />
          </div>

          {/* Button row */}
          <div className="flex items-center justify-between px-3 pb-2.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white transition-colors" onClick={() => skip(-5)}><SkipBack size={12} /></button>
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-all" onClick={togglePlay}>
                {playing ? <Pause size={13} fill="white" color="white" /> : <Play size={13} fill="white" color="white" />}
              </button>
              <button className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white transition-colors" onClick={() => skip(5)}><SkipForward size={12} /></button>
              <span className="text-[9px] font-mono text-white/45 ml-1">{fmt(currentTime)} / {fmt(duration || clip.duration)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white transition-colors" onClick={toggleMute}>
                {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
              {/* Custom fullscreen button */}
              <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#FF6B35] text-white hover:bg-[#e85a28] transition-all"
                onClick={(e) => { e.stopPropagation(); onFullscreen() }}
                title="Open in 9:16 fullscreen"
              >
                <Maximize size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* Title + time */}
        <div>
          <h3 className="text-[13px] font-bold text-[#2C4A5E] leading-snug mb-1 line-clamp-2">{clip.title}</h3>
          <p className="text-[11px] text-[#2C4A5E]/40 font-mono">{fmt(clip.startTime)} – {fmt(clip.endTime)}</p>
        </div>

        {/* Viral titles */}
        {clip.viralTitles?.length > 0 && (
          <div className="bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[#FF6B35] mb-2.5">
              <Sparkles size={9} /> Viral Titles
            </div>
            {clip.viralTitles.map((t, i) => {
              const key = `${clip.id}-${i}`
              return (
                <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                  <span className="text-[11px] text-[#2C4A5E]/75 flex-1 leading-snug">{t}</span>
                  <button onClick={() => onCopyTitle(t, key)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-[#2C4A5E]/8 hover:border-[#FF6B35]/40 text-[#2C4A5E]/30 hover:text-[#FF6B35] transition-all">
                    {copiedId === key ? <Check size={9} className="text-emerald-600" /> : <Copy size={9} />}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* AI Description */}
        {clip.description && (
          <div className="bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-emerald-700/80">
                <Sparkles size={9} /> AI Description
              </div>
              <button onClick={() => onCopyTitle(clip.description, `${clip.id}-desc`)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-[#2C4A5E]/8 hover:border-emerald-600/40 text-[#2C4A5E]/30 hover:text-emerald-700 transition-all">
                {copiedId === `${clip.id}-desc` ? <Check size={9} className="text-emerald-600" /> : <Copy size={9} />}
              </button>
            </div>
            <p className="text-[11px] text-[#2C4A5E]/75 leading-snug">{clip.description}</p>
          </div>
        )}

        {/* AI Hashtags */}
        {clip.hashtags?.length > 0 && (
          <div className="bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[#2C4A5E]/50">
                <Sparkles size={9} /> Hashtags
              </div>
              <button onClick={() => onCopyTitle(clip.hashtags.map(h => `#${h}`).join(" "), `${clip.id}-tags`)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-[#2C4A5E]/8 hover:border-[#FF6B35]/40 text-[#2C4A5E]/30 hover:text-[#FF6B35] transition-all">
                {copiedId === `${clip.id}-tags` ? <Check size={9} className="text-emerald-600" /> : <Copy size={9} />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {clip.hashtags.map((h, i) => (
                <span key={i} className="text-[10px] font-semibold text-[#2C4A5E]/70 bg-[#2C4A5E]/[0.06] border border-[#2C4A5E]/12 rounded-md px-1.5 py-0.5">#{h}</span>
              ))}
            </div>
          </div>
        )}

        {/* Captions section */}
        <div className="bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-[#2C4A5E]/55">
              <Captions size={9} /> Captions
              <span className="text-[#2C4A5E]/35 normal-case font-medium ml-1">{clip.hasRealCaptions ? "· Whisper ✅" : "· placeholder"}</span>
              <span className="text-[#2C4A5E]/45 normal-case font-medium">· {styleInfo.animation}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={onToggleStylePicker} title="Pick one of 33 animated caption styles" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FF6B35]/10 hover:bg-[#FF6B35]/20 border border-[#FF6B35]/30 text-[9px] font-bold text-[#FF6B35] transition-all">
                <Palette size={8} /> {styleInfo.name}
              </button>
              <button onClick={onToggleText} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-white border border-[#2C4A5E]/10 text-[9px] font-bold text-[#2C4A5E]/55 hover:text-[#FF6B35] hover:border-[#FF6B35]/30 transition-all">
                <Pencil size={8} /> Words
              </button>
              <button onClick={onToggleEdit} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-all ${editing ? "bg-[#FF6B35]/12 border-[#FF6B35]/35 text-[#FF6B35]" : "bg-white border-[#2C4A5E]/10 text-[#2C4A5E]/55 hover:text-[#FF6B35] hover:border-[#FF6B35]/30"}`}>
                <SlidersHorizontal size={8} /> Edit
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="text-[9px] font-bold text-[#2C4A5E]/40 uppercase tracking-wider flex items-center gap-1"><LayoutGrid size={9} /> Framing</span>
            {LAYOUT_OPTIONS.map(o => (
              <button key={o.id} onClick={() => onSetLayout?.(o.id)} title={o.desc}
                className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${layout === o.id ? "bg-[#FF6B35]/15 border border-[#FF6B35]/40 text-[#FF6B35]" : "bg-white border border-[#2C4A5E]/10 text-[#2C4A5E]/45 hover:text-[#FF6B35] hover:border-[#FF6B35]/30"}`}>
                {o.label}
              </button>
            ))}
          </div>
          {editingText && <CaptionTextEditor clip={clip} onClose={onToggleText} onSave={onSaveText} />}

          {/* ── Edit Captions panel ── */}
          {editing && (
            <div className="bg-white border border-[#2C4A5E]/10 rounded-xl p-3 mb-2.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black tracking-widest uppercase text-[#FF6B35] flex items-center gap-1"><SlidersHorizontal size={9} /> Customize · drag position in fullscreen</span>
                <button onClick={onResetOverrides} className="text-[9px] font-bold text-[#2C4A5E]/40 hover:text-[#2C4A5E] flex items-center gap-1"><RotateCcw size={8} /> Reset</button>
              </div>

              {/* Colors */}
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-between gap-2 bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-lg px-2 py-1.5">
                  <span className="text-[10px] font-semibold text-[#2C4A5E]/50">Text</span>
                  <input type="color" value={cap.textColor} onChange={e => onSetOverride({ textColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                </label>
                <label className="flex-1 flex items-center justify-between gap-2 bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-lg px-2 py-1.5">
                  <span className="text-[10px] font-semibold text-[#2C4A5E]/50">Highlight</span>
                  <input type="color" value={cap.highlightColor} onChange={e => onSetOverride({ highlightColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                </label>
              </div>

              {/* Sliders */}
              {[
                { key: "fontSize",      label: "Size",     min: 48,  max: 140, val: cap.fontSize,      suffix: "px" },
                { key: "letterSpacing", label: "Spacing",  min: 0,   max: 12,  val: cap.letterSpacing, suffix: "" },
              ].map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-[#2C4A5E]/50 w-14">{s.label}</span>
                  <input type="range" min={s.min} max={s.max} value={s.val} onChange={e => onSetOverride({ [s.key]: Number(e.target.value) })} className="flex-1 accent-[#FF6B35] h-1" />
                  <span className="text-[10px] font-mono text-[#2C4A5E]/60 w-12 text-right">{s.val}{s.suffix}</span>
                </div>
              ))}

              {/* Highlight words toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[#2C4A5E]/50">Highlight active word</span>
                <button onClick={() => onSetOverride({ highlightWords: !cap.highlightWords })} className={`relative w-9 h-5 rounded-full transition-colors ${cap.highlightWords ? "bg-[#FF6B35]" : "bg-[#2C4A5E]/20"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cap.highlightWords ? "left-4" : "left-0.5"}`} />
                </button>
              </div>

              {captionState === "ready" && (
                <button onClick={onAddCaptions} className="w-full py-2 rounded-lg bg-[#FF6B35]/10 border border-[#FF6B35]/30 text-[#FF6B35] text-[11px] font-bold hover:bg-[#FF6B35]/20 transition-all flex items-center justify-center gap-1.5">
                  <RefreshCw size={11} /> Apply changes
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1 text-[9px] font-bold text-[#2C4A5E]/35 uppercase tracking-wider">
              <Type size={8} /> Font
            </div>
            <select value={selectedFont} onChange={e => onSetCaptionFont(e.target.value)} className="bg-white border border-[#2C4A5E]/12 rounded-lg text-[10px] text-[#2C4A5E]/60 px-2 py-1 font-semibold outline-none cursor-pointer focus:border-[#FF6B35]/50">
              <option value="default">Default</option>
              <option value="Poppins">Poppins</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Outfit">Outfit</option>
              <option value="Impact">Impact</option>
              <option value="Arial Black">Arial Black</option>
            </select>
          </div>

          {captionState === "idle" && (
            <button onClick={onAddCaptions} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-[#FF6B35]/10 border border-[#FF6B35]/30 text-[#FF6B35] text-[11px] font-bold hover:bg-[#FF6B35]/20 transition-all">
              <Plus size={11} /> {clip.hasRealCaptions ? "Burn Real Captions" : "Burn Captions"}
              <span className="text-[9px] opacity-50">({styleInfo.name})</span>
            </button>
          )}
          {capLoad && (
            <div className="flex items-center gap-2 py-1 text-[11px] text-[#2C4A5E]/50">
              <div className="w-3 h-3 border-2 border-[#2C4A5E]/15 border-t-[#FF6B35] rounded-full animate-spin" /> Burning captions…
            </div>
          )}
          {capReady && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-emerald-700 font-semibold">✅ Captions active</span>
              <button onClick={onAddCaptions} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-[#2C4A5E]/10 text-[10px] text-[#2C4A5E]/40 hover:text-[#FF6B35] hover:border-[#FF6B35]/30 transition-all">
                <RotateCcw size={8} /> Re-apply
              </button>
            </div>
          )}
          {capErr && (
            <button onClick={onAddCaptions} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-red-500/[0.06] border border-red-500/15 text-red-500 text-[11px] font-bold hover:bg-red-500/10 transition-all">
              <RotateCcw size={11} /> Retry
            </button>
          )}
        </div>

        {/* Downloads */}
        <div className="bg-white border border-[#2C4A5E]/10 rounded-xl p-3">
          <div className="text-[9px] font-black tracking-widest uppercase text-[#2C4A5E]/30 mb-2.5">Download</div>
          <div className="flex gap-2">
            <button onClick={onDownloadClean} disabled={!!dlLoading[`${clip.id}-clean`]} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white hover:bg-[#F5F4F0] border border-[#2C4A5E]/12 text-[11px] font-bold text-[#2C4A5E]/60 hover:text-[#2C4A5E] transition-all disabled:opacity-50">
              {dlLoading[`${clip.id}-clean`] ? <><div className="w-3 h-3 border-2 border-[#2C4A5E]/20 border-t-[#2C4A5E]/60 rounded-full animate-spin" /> Saving…</> : <><Download size={11} /> Clean MP4</>}
            </button>
            <button onClick={capReady ? onDownloadCaptioned : undefined} disabled={!capReady || !!dlLoading[`${clip.id}-cap`]} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-bold transition-all ${capReady ? "bg-[#FF6B35] border-[#FF6B35] text-white hover:bg-[#e85a28] shadow-[0_4px_14px_rgba(255,107,53,0.25)]" : "bg-[#F5F4F0] border-[#2C4A5E]/8 text-[#2C4A5E]/25 cursor-not-allowed"}`}>
              {dlLoading[`${clip.id}-cap`] ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</> : <><Captions size={11} /> Captioned</>}
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 justify-between items-center">
          <button
            onClick={onFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6B35]/10 hover:bg-[#FF6B35]/20 border border-[#FF6B35]/25 text-[11px] font-semibold text-[#FF6B35] transition-all"
          >
            <Maximize size={11} /> Fullscreen 9:16
          </button>
          <div className="flex gap-2">
            {!clip.isCustom && (
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F4F0] border border-[#2C4A5E]/10 text-[11px] font-semibold text-[#2C4A5E]/45 hover:text-[#2C4A5E] transition-all">
                <Scissors size={10} /> Edit
              </button>
            )}
            <button onClick={onExpand} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F4F0] border border-[#2C4A5E]/10 text-[11px] font-semibold text-[#2C4A5E]/45 hover:text-[#2C4A5E] transition-all">
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />} Info
            </button>
          </div>
        </div>

        {/* Expanded info */}
        {expanded && (
          <div className="bg-[#F5F4F0] border border-[#2C4A5E]/8 rounded-xl p-3 space-y-2">
            {[["Type", clip.videoType], ["Language", clip.language], ["Start", fmt(clip.startTime)], ["End", fmt(clip.endTime)], ["Duration", `${clip.duration}s`], ["Score", `${clip.viralScore}%`], ["Captions", clip.hasRealCaptions ? "Real (Whisper)" : "Placeholder"], ["Caption Style", styleInfo.name]].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center">
                <span className="text-[11px] text-[#2C4A5E]/35">{k}</span>
                <span className="text-[11px] text-[#2C4A5E]/70 font-semibold">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showStylePicker && <CaptionStylePicker currentStyle={captionStyle} onSelect={onSetCaptionStyle} onClose={onToggleStylePicker} />}
    </div>
  )
}