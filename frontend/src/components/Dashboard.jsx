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
  LogOut, RefreshCw, History, X, Maximize,
  Link2, ChevronRight, BarChart2, Layers,
  SlidersHorizontal, Move,
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
  if (n >= 90) return { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Viral", glow: "shadow-[0_0_12px_rgba(16,185,129,0.2)]" }
  if (n >= 75) return { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Hot", glow: "shadow-[0_0_12px_rgba(245,158,11,0.2)]" }
  return { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", label: "Good", glow: "" }
}

export const CAPTION_STYLES = {
  // ── Premium preset library (21 styles) ─────────────────────────────────────
  hormozi1:  { id: "hormozi1",  name: "HORMOZI 1",  preview: "HORMOZI 1",         font: "Impact",         fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#00E676", outlineColor: "#000000", position: "center", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "White bold with green active word" },
  hormozi2:  { id: "hormozi2",  name: "HORMOZI 2",  preview: "HORMOZI 2",         font: "Impact",         fontSize: 94, primaryColor: "#FFFFFF", highlightColor: "#FFE600", outlineColor: "#000000", position: "center", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "White bold with yellow active word" },
  beast:     { id: "beast",     name: "BEAST",      preview: "BEAST",             font: "Arial Black",    fontSize: 92, primaryColor: "#FFD400", highlightColor: "#FF3B30", outlineColor: "#000000", position: "center", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, italic: true, description: "MrBeast yellow with red pops" },
  negativa:  { id: "negativa",  name: "Negativa",   preview: "Negativa",          font: "Montserrat",     fontSize: 74, primaryColor: "#FFFFFF", highlightColor: "#B0B0B0", outlineColor: "#000000", position: "bottom", animation: "line", bold: true,  bgBox: true,  bgColor: "rgba(0,0,0,0.85)", description: "Clean white on black card" },
  cove:      { id: "cove",      name: "Cove",       preview: "Cove",              font: "Poppins",        fontSize: 82, primaryColor: "#FFFFFF", highlightColor: "#9AD0FF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Soft white text with glow" },
  leon:      { id: "leon",      name: "LEON",       preview: "LEON",              font: "Arial Black",    fontSize: 80, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: true,  bgColor: "rgba(230,50,40,0.95)", uppercase: true, description: "Bold white on red block" },
  laguna:    { id: "laguna",    name: "LAGUNA",     preview: "LAGUNA",            font: "Montserrat",     fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "line", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Big clean uppercase white" },
  tuba:      { id: "tuba",      name: "Tuba",       preview: "Tuba",              font: "Outfit",         fontSize: 78, primaryColor: "#FFFFFF", highlightColor: "#FFD400", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Friendly rounded white" },
  splitz:    { id: "splitz",    name: "Splitz",     preview: "Splitz",            font: "Georgia",        fontSize: 80, primaryColor: "#E8A15A", highlightColor: "#F6C177", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      italic: true, description: "Warm serif italic" },
  aria:      { id: "aria",      name: "Aria",       preview: "Aria",              font: "Poppins",        fontSize: 82, primaryColor: "#FFC93C", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Golden headline text" },
  stack:     { id: "stack",     name: "Stack",      preview: "Stack",             font: "Montserrat",     fontSize: 80, primaryColor: "#FFFFFF", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: true,  bgColor: "rgba(0,0,0,0.55)", uppercase: true, description: "Bold white on soft block" },
  lume:      { id: "lume",      name: "Lume",       preview: "Lume",              font: "Poppins",        fontSize: 78, primaryColor: "#D9B382", highlightColor: "#F0DCB4", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Muted warm tan" },
  marca:     { id: "marca",     name: "MARCA",      preview: "MARCA",             font: "Arial Black",    fontSize: 78, primaryColor: "#111111", highlightColor: "#111111", outlineColor: "#FFD400", position: "bottom", animation: "word", bold: true,  bgBox: true,  bgColor: "rgba(255,214,0,0.95)", uppercase: true, description: "Dark text on yellow marker" },
  canto:     { id: "canto",     name: "Canto",      preview: "Canto",             font: "Georgia",        fontSize: 80, primaryColor: "#F0E6D2", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "line", bold: false, bgBox: false, bgColor: "transparent",      italic: true, description: "Elegant cream serif" },
  silk:      { id: "silk",      name: "Silk",       preview: "Silk",              font: "Poppins",        fontSize: 80, primaryColor: "#34D5C8", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Smooth teal text" },
  slash:     { id: "slash",     name: "SLASH",      preview: "SLASH",             font: "Arial Black",    fontSize: 86, primaryColor: "#FF3D9A", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Bold magenta punch" },
  dense:     { id: "dense",     name: "Dense",      preview: "Dense",             font: "Arial Black",    fontSize: 90, primaryColor: "#B6FF3C", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "center", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Heavy lime green" },
  open:      { id: "open",      name: "Open",       preview: "Open",              font: "Montserrat",     fontSize: 82, primaryColor: "#2FD891", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Fresh green outline" },
  vibe:      { id: "vibe",      name: "Vibe",       preview: "Vibe",              font: "Poppins",        fontSize: 84, primaryColor: "#34D058", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      description: "Energetic green" },
  rise:      { id: "rise",      name: "Rise",       preview: "Rise",              font: "Montserrat",     fontSize: 84, primaryColor: "#FFC01E", highlightColor: "#FFFFFF", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Rising gold" },
  prism:     { id: "prism",     name: "PRISM",      preview: "PRISM",             font: "Poppins",        fontSize: 84, primaryColor: "#B98CFF", highlightColor: "#FF7AD9", outlineColor: "#000000", position: "bottom", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Violet-to-pink gradient pops" },
  pop:       { id: "pop",       name: "Pop",        preview: "3 MAIN STEPS",       font: "Montserrat",     fontSize: 90, primaryColor: "#FFFFFF", highlightColor: "#37B6FF", outlineColor: "#001322", position: "center", animation: "word", bold: true,  bgBox: false, bgColor: "transparent",      uppercase: true, description: "Cyan active word + auto-yellow numbers" },
}

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

export default function Dashboard({ user, onLogout }) {
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
  const [globalCaptionStyle, setGlobalCaptionStyle] = useState("hormozi1")
  const [pastClips, setPastClips]           = useState([])
  const [splitScreenMode, setSplitScreenMode]             = useState({})
  const [autoDetectedSplitScreen, setAutoDetectedSplitScreen] = useState({})
  const [fullscreenClip, setFullscreenClip] = useState(null) // custom 9:16 fullscreen
  const [captionOverrides, setCaptionOverrides] = useState({}) // per-clip { textColor, highlightColor, fontSize, positionX, positionY, letterSpacing, highlightWords }
  const [editingCaps, setEditingCaps]       = useState(null)   // clipId whose caption editor is open
  const pollRef = useRef(null)

  const setOverride = (clipId, patch) =>
    setCaptionOverrides(p => ({ ...p, [clipId]: { ...(p[clipId] || {}), ...patch } }))

  useEffect(() => { loadPastClipsHistory() }, [user])

  const loadPastClipsHistory = async () => {
    try {
      if (!user?.id && !user?._id) return
      const userId = user.id || user._id
      const response = await axios.get(`${API_BASE}/clips/history?userId=${userId}&limit=50`)
      if (response.data.success) setPastClips(response.data.clips || [])
    } catch { setPastClips([]) }
  }

  useEffect(() => { loadToken(); setSavedSessions(loadSavedSessions()) }, [])

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
    const detected = {}
    clips.forEach(clip => {
      if (clip.speakerCount > 1 || clip.layout === "podcast_split") {
        detected[clip.id] = true
        setSplitScreenMode(p => ({ ...p, [clip.id]: true }))
      }
    })
    setAutoDetectedSplitScreen(detected)
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
    setClips([]); setCustomClips([]); setVideoInfo(null); setCaptionState({}); setCaptionUrl({})
    try {
      const r = await axios.post(`${API_BASE}/generate-clips`, { url })
      if (r.data.success) setSessionId(r.data.sessionId)
      else { setError(r.data.error || "Failed"); setProcessing(false) }
    } catch {
      setError("Cannot connect to server — is the backend running?"); setProcessing(false)
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
      const id = captioned ? `${clipId}_captioned?style=${style}` : clipId
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
      const r = await axios.post(`${API_BASE}/add-captions/${clipId}`, { sessionId, captionStyle: style, selectedFont: selectedFonts[clipId] || "default", overrides: captionOverrides[clipId] || {} })
      if (r.data.success) {
        setCaptionUrl(p => ({ ...p, [clipId]: r.data.videoUrl }))
        setCaptionState(p => ({ ...p, [clipId]: "ready" }))
        const updateClipsList = (list) => list.map(c => c.id === clipId ? { ...c, hasRealCaptions: r.data.isReal, language: r.data.language, captionSegments: r.data.captionSegments || [], viralTitles: r.data.viralTitles?.length > 0 ? r.data.viralTitles : c.viralTitles } : c)
        setClips(prev => updateClipsList(prev)); setCustomClips(prev => updateClipsList(prev))
      } else { setCaptionState(p => ({ ...p, [clipId]: "error" })) }
    } catch { setCaptionState(p => ({ ...p, [clipId]: "error" })) }
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

  const saveGeneratedClips = async (clipsToSave) => {
    if (!user?.id && !user?._id) return
    const userId = user.id || user._id
    try {
      for (const clip of clipsToSave) {
        await axios.post(`${API_BASE}/clips`, { clipId: clip.id, userId, sessionId, title: clip.title || "Untitled", videoUrl: clip.videoUrl || "", thumbnail: clip.thumbnail || "", videoPath: clip.videoPath || "", duration: clip.duration || 0, startTime: clip.startTime || 0, viralScore: clip.viralScore || 0, videoType: clip.videoType || "general", language: clip.language || "en", captionStyle: globalCaptionStyle, splitScreenMode: splitScreenMode[clip.id] || false, speakerCount: clip.speakerCount || 1, tags: [clip.videoType, clip.language].filter(Boolean) })
      }
      await loadPastClipsHistory()
    } catch {}
  }

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
    <div className="min-h-screen bg-[#0A0A0B] text-white font-sans">
      {/* Ambient background */}
      <div className="fixed inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "72px 72px" }} />
      <div className="fixed top-0 left-1/3 w-[700px] h-[700px] rounded-full opacity-[0.04] pointer-events-none" style={{ background: "radial-gradient(circle, #F59E0B, transparent 70%)" }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03] pointer-events-none" style={{ background: "radial-gradient(circle, #8B5CF6, transparent 70%)" }} />

      <Navbar user={user} onLogout={onLogout} showHistoryBtn={true} onToggleHistory={() => setShowHistory(!showHistory)} clipsCount={allClips.length} videoInfo={videoInfo} />

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
          onClose={() => setFullscreenClip(null)}
        />
      )}

      {/* ── History Panel ───────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowHistory(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[360px] h-full bg-[#0E0E10] border-l border-white/[0.07] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                  <History size={13} className="text-amber-400" />
                </div>
                <span className="text-[14px] font-black text-white">Session History</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/[0.06] text-white/30 hover:text-white transition-all">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {savedSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/15">
                  <History size={28} className="mb-3 opacity-30" />
                  <p className="text-[13px] font-medium">No sessions yet</p>
                  <p className="text-[11px] mt-1">Your history will appear here</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {savedSessions.slice().reverse().map(s => (
                    <button key={s.sessionId} onClick={() => restoreSession(s.sessionId)} className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-amber-500/15 transition-all text-left w-full group">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <Film size={13} className="text-white/30 group-hover:text-amber-400 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-white/60 truncate">{s.url?.slice(0, 42)}…</div>
                        <div className="text-[10px] text-white/20 mt-0.5">{new Date(s.startedAt).toLocaleString()} · <span className={s.status === "completed" ? "text-emerald-400/70" : "text-amber-400/70"}>{s.status}</span></div>
                      </div>
                      <ChevronRight size={12} className="text-white/15 group-hover:text-white/40 transition-colors flex-shrink-0" />
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
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold tracking-widest uppercase mb-4">
                <Flame size={9} strokeWidth={3} />
                AI Shorts Generator
              </div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tighter leading-tight mb-2">
                Forge viral clips
                <span className="text-white/20 ml-3 text-2xl font-semibold">in seconds</span>
              </h1>
              <p className="text-[14px] text-white/30">Drop a YouTube URL · AI detects the gold · 9:16 clips ready to post</p>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { icon: <Film size={14} />, v: user?.videosProcessed || 0, l: "Processed" },
                { icon: <Scissors size={14} />, v: user?.clipsGenerated || 0, l: "Clips Made" },
                { icon: <BarChart2 size={14} />, v: "85%", l: "Avg Score" },
              ].map(({ icon, v, l }) => (
                <div key={l} className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#111113] border border-white/[0.06]">
                  <span className="text-amber-400">{icon}</span>
                  <div>
                    <div className="text-[18px] font-black text-white leading-none">{v}</div>
                    <div className="text-[10px] text-white/30 mt-0.5">{l}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── URL Input Card ────────────────────────────────────────── */}
          <div className="relative bg-[#111113] border border-white/[0.08] rounded-2xl p-6 overflow-hidden">
            {/* Subtle amber glow */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />

            <div className="flex items-center gap-2 mb-4">
              <Link2 size={13} className="text-amber-400" />
              <span className="text-[11px] font-bold tracking-widest uppercase text-white/25">YouTube URL</span>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1 group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-amber-400 transition-colors">
                  <Link2 size={15} />
                </div>
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !processing && handleGenerate()}
                  disabled={processing}
                  className="w-full bg-[#0A0A0B] border border-white/[0.07] focus:border-amber-500/40 rounded-xl pl-11 pr-4 py-3.5 text-[14px] text-white placeholder-white/20 outline-none transition-all disabled:opacity-50 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.07)]"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={processing}
                className="flex items-center gap-2 px-6 py-3.5 bg-amber-400 hover:bg-amber-300 disabled:bg-amber-400/40 text-[#0A0A0B] text-[14px] font-black rounded-xl transition-all hover:shadow-[0_0_24px_rgba(245,158,11,0.3)] active:scale-[0.97] whitespace-nowrap"
              >
                {processing
                  ? <><span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Processing…</>
                  : <><Zap size={15} strokeWidth={2.5} /> Generate Clips</>
                }
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 mt-4 px-4 py-3 bg-red-500/[0.06] border border-red-500/20 rounded-xl text-[13px] text-red-400">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                {error}
              </div>
            )}

            {!processing && !videoInfo && (
              <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-white/[0.05]">
                {[["🎯","AI Hook Detection"],["✂️","Smart 9:16 Crop"],["🎙️","Whisper Captions"],["📺","True 1080p"],["🇮🇳","Hindi Support"],["⚡","4× Parallel Encode"],["🎨","11 Caption Styles"],["📦","Background Process"]].map(([icon, label]) => (
                  <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white/30 bg-white/[0.02] border border-white/[0.04] rounded-full hover:border-white/[0.08] hover:text-white/50 transition-all">
                    <span>{icon}</span><span>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {processing && (
              <div className="mt-5 pt-5 border-t border-white/[0.05]">
                <div className="relative h-1.5 bg-white/[0.05] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(245,158,11,0.4)]" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] text-white/40">{progressMsg}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/25 font-mono">
                    <Clock size={10} /> {fmt(elapsed)} · {progressPct}%
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/[0.03] border border-amber-500/10 rounded-xl text-[11px] text-amber-400/50">
                  <Zap size={11} />
                  Processing continues even if you close this tab — come back anytime.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Info Ribbon ──────────────────────────────────────────────── */}
        {videoInfo && (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 bg-[#111113] border border-white/[0.07] rounded-2xl mb-8">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[11px] font-black text-emerald-400">
              <Check size={10} strokeWidth={3} /> Complete
            </div>
            {[{ e: "🎬", v: videoInfo.videoType }, { e: videoInfo.language === "hindi" ? "🇮🇳" : "🇺🇸", v: videoInfo.language }, { e: "⏱", v: `${Math.floor(videoInfo.duration / 60)}m` }, { e: "📺", v: videoInfo.quality }, { e: "💾", v: `${videoInfo.fileSize}MB` }].map(({ e, v }) => v && (
              <span key={v} className="text-[12px] text-white/35 flex items-center gap-1">{e} {v}</span>
            ))}
            <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/20">
              <Zap size={11} className="text-amber-400" strokeWidth={2.5} />
              <span className="text-[12px] font-black text-amber-400">{allClips.length} clips ready</span>
            </div>
          </div>
        )}

        {/* Whisper warning */}
        {allClips.length > 0 && !videoInfo?.hasRealCaptions && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/[0.04] border border-amber-500/10 rounded-xl mb-6 text-[12px] text-amber-400/60 flex-wrap">
            ⚠️ <strong className="text-amber-400/80">Placeholder captions</strong> — install whisper for real word-by-word captions
          </div>
        )}

        {/* ── Processing loading state ─────────────────────────────────── */}
        {processing && (
          <div className="flex flex-col items-center text-center py-20 px-8 bg-[#111113] border border-white/[0.06] rounded-2xl mb-8">
            <div className="relative w-16 h-16 flex items-center justify-center mb-6">
              <div className="absolute inset-0 border-2 border-transparent border-t-amber-400 rounded-full animate-spin" />
              <div className="absolute inset-[5px] border-2 border-transparent border-t-amber-400/40 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.7s" }} />
              <Film size={20} className="text-white/20" />
            </div>
            <h3 className="text-[22px] font-black mb-2 tracking-tight">AI is forging your clips</h3>
            <p className="text-[13px] text-white/30 mb-10 max-w-sm">Close the tab freely — processing runs in the background and you can return anytime</p>
            <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
              {[["🎵","Detecting high-energy audio hooks"],["✂️","Planning 9:16 crop + layout"],["🎙️","Whisper transcription"],["📦","4× parallel encoding"]].map(([icon, text]) => (
                <div key={text} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-base">{icon}</span>
                  <span className="text-[11px] text-white/30 text-left leading-snug">{text}</span>
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
                <h2 className="flex items-center gap-2.5 text-[22px] font-black tracking-tight mb-1">
                  <TrendingUp size={20} className="text-amber-400" />
                  {allClips.length} Clips Ready
                </h2>
                <p className="text-[12px] text-white/25">1080p · seekable player · word-by-word captions{videoInfo?.hasRealCaptions ? " · Whisper ✅" : ""}</p>
              </div>

              {/* Global caption style */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-white/20 font-semibold whitespace-nowrap uppercase tracking-wider">Default style:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.values(CAPTION_STYLES).map(st => (
                    <button key={st.id} onClick={() => setGlobalCaptionStyle(st.id)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${globalCaptionStyle === st.id ? "bg-amber-500/15 border border-amber-500/30 text-amber-400" : "text-white/25 hover:text-white/50 border border-transparent hover:border-white/[0.06]"}`}>
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-7 flex-wrap">
              {filters.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all border ${activeFilter === f.key ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-white/[0.02] border-white/[0.05] text-white/30 hover:text-white/55 hover:border-white/[0.08]"}`}>
                  <span className={activeFilter === f.key ? "text-amber-400" : "text-white/20"}>{f.icon}</span>
                  {f.label}
                  {f.count > 0 && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${activeFilter === f.key ? "bg-amber-500/20 text-amber-400" : "bg-white/[0.06] text-white/25"}`}>
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
                    onFullscreen={() => setFullscreenClip(clip)}
                    overrides={captionOverrides[clip.id] || {}}
                    onSetOverride={(patch) => setOverride(clip.id, patch)}
                    onResetOverrides={() => setCaptionOverrides(p => { const n = { ...p }; delete n[clip.id]; return n })}
                    editing={editingCaps === clip.id}
                    onToggleEdit={() => setEditingCaps(editingCaps === clip.id ? null : clip.id)}
                  />
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="flex flex-col items-center py-20 text-white/15">
                <Layers size={28} className="mb-3 opacity-40" />
                <p className="text-[14px] font-medium">No clips match this filter</p>
              </div>
            )}
          </section>
        )}

        {/* ── Past Clips ──────────────────────────────────────────────── */}
        {pastClips.length > 0 && (
          <section className="mt-16">
            <h2 className="flex items-center gap-2.5 text-[20px] font-black tracking-tight mb-6">
              <History size={18} className="text-amber-400" />
              Past Clips
              <span className="text-[13px] font-semibold text-white/25 ml-1">({pastClips.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {pastClips.slice(0, 12).map((clip) => (
                <div key={clip.clipId} className="bg-[#111113] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.11] hover:-translate-y-0.5 transition-all group">
                  <div className="relative h-40 bg-black overflow-hidden">
                    <img src={clip.thumbnail || ""} alt={clip.title} className="w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />
                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-white/60">{fmt(clip.duration || 0)}</div>
                    {clip.viralScore && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm text-[10px] font-black text-amber-400">🔥 {clip.viralScore}%</div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <h3 className="text-[12px] font-bold text-white/75 mb-1 line-clamp-2 leading-snug">{clip.title || "Untitled Clip"}</h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-white/20 mb-3">
                      <span>{clip.videoType || "general"}</span>
                      <span>·</span>
                      <span>{clip.language === "hindi" ? "🇮🇳" : "🇺🇸"}</span>
                    </div>
                    <a href={`${API_ROOT}/api/download/${clip.clipId}`} download={`${clip.clipId}.mp4`} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-400/[0.07] border border-amber-400/15 text-amber-400 text-[11px] font-bold hover:bg-amber-400/12 transition-all">
                      <Download size={11} /> Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
            {pastClips.length > 12 && (
              <p className="text-center mt-5 text-[11px] text-white/20">Showing 12 of {pastClips.length} past clips</p>
            )}
          </section>
        )}
      </div>

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
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Custom 9:16 Fullscreen Player ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function FullscreenPlayer({ clip, captionState, captionVideoUrl, captionStyle, overrides = {}, onSetOverride, onApply, onClose }) {
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
    const handler = (e) => { if (e.key === "Escape") onClose() }
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
          onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration || 0) }}
          onClick={() => { if (!posEdit) togglePlay() }}
        />

        {/* Draggable caption position guide (position-edit mode only) */}
        {posEdit && (
          <div
            onMouseDown={onCapDragStart}
            className="absolute z-30 cursor-move select-none px-3 py-1.5 rounded-lg border-2 border-dashed border-amber-400/80 bg-black/30 flex items-center gap-1.5"
            style={{ left: `${cap.positionX}%`, top: `${cap.positionY}%`, transform: "translate(-50%,-50%)", maxWidth: "92%" }}
            title="Drag to reposition captions"
          >
            <Move size={14} className="text-amber-400 flex-shrink-0" />
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
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 border border-amber-500/30 text-amber-400">
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
              onClick={onClose}
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
            <div className="absolute left-0 h-[3px] bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            {/* Amber thumb */}
            <div className="absolute w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)] -translate-x-1/2 transition-all" style={{ left: `${pct}%` }} />
            <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer" min="0" max="100" step="0.1" value={pct} onChange={handleSeek} onClick={e => e.stopPropagation()} />
          </div>

          {/* Caption position editor (toggle with the Move button) */}
          {onSetOverride && posEdit && (
            <div className="flex items-center gap-2 mb-3 bg-black/50 border border-amber-400/25 rounded-xl px-3 py-2" onClick={e => e.stopPropagation()}>
              <Move size={12} className="text-amber-400 flex-shrink-0" />
              <span className="text-[10px] font-bold text-white/50 whitespace-nowrap">Height</span>
              <input type="range" min="6" max="94" value={cap.positionY} onChange={e => onSetOverride({ positionY: Number(e.target.value) })} className="flex-1 accent-amber-400 h-1" />
              <span className="text-[10px] font-mono text-white/50 w-9 text-right">{cap.positionY}%</span>
              <button onClick={onApply} className="px-3 py-1 rounded-lg bg-amber-400 text-[#0A0A0B] text-[11px] font-black hover:bg-amber-300 transition-all whitespace-nowrap">Apply</button>
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 text-white transition-all" onClick={() => skip(-5)}>
                <SkipBack size={15} />
              </button>
              <button className="w-11 h-11 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-300 text-[#0A0A0B] transition-all shadow-[0_0_16px_rgba(245,158,11,0.3)]" onClick={togglePlay}>
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>
              <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 text-white transition-all" onClick={() => skip(5)}>
                <SkipForward size={15} />
              </button>
              <span className="text-[11px] font-mono text-white/50 ml-1">{fmt(currentTime)} / {fmt(duration || clip.duration)}</span>
            </div>

            <div className="flex items-center gap-2">
              {onSetOverride && (
                <button className={`w-9 h-9 flex items-center justify-center rounded-full border transition-all ${posEdit ? "bg-amber-400 text-[#0A0A0B] border-amber-400" : "bg-white/10 hover:bg-white/18 text-white border-transparent"}`} onClick={() => setPosEdit(v => !v)} title="Move captions">
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
// ── Caption Style Picker ──────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function CaptionStylePicker({ currentStyle, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-[500px] max-h-[80vh] flex flex-col bg-[#0E0E10] border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Palette size={13} className="text-amber-400" />
            </div>
            <span className="text-[14px] font-black text-white">Caption Style</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/[0.06] text-white/30 hover:text-white transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-2 gap-2.5">
          {Object.values(CAPTION_STYLES).map(style => (
            <button key={style.id} onClick={() => onSelect(style.id)} className={`relative text-left p-3.5 rounded-xl transition-all border ${currentStyle === style.id ? "bg-amber-500/[0.08] border-amber-500/25" : "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.09] hover:bg-white/[0.04]"}`}>
              <div className="bg-black rounded-xl px-2 py-3 flex items-center justify-center mb-2.5 min-h-[44px]">
                <span style={{ fontFamily: style.font, fontSize: 13, fontWeight: style.bold ? 700 : 400, color: style.primaryColor, background: style.bgBox ? style.bgColor : "transparent", padding: style.bgBox ? "2px 8px" : 0, borderRadius: style.id === "pill" ? 99 : 4 }}>
                  {style.preview}
                </span>
              </div>
              <div className="text-[11px] font-bold text-white/80 mb-0.5">{style.name}</div>
              <div className="text-[9px] text-white/30 leading-tight">{style.description}</div>
              {currentStyle === style.id && (
                <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                  <Check size={9} className="text-black" strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Clip Card ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function ClipCard({ clip, captionState, captionVideoUrl, dlLoading, copiedId, expanded, captionStyle, showStylePicker, onToggleStylePicker, onSetCaptionStyle, onExpand, onDownloadClean, onAddCaptions, onDownloadCaptioned, onEdit, onCopyTitle, selectedFont, onSetCaptionFont, onFullscreen, overrides = {}, onSetOverride, onResetOverrides, editing, onToggleEdit }) {
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

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (playing) videoRef.current.pause()
    else videoRef.current.play().catch(() => {})
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
      className={`group bg-[#111113] border rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${hovered ? "border-white/[0.14] shadow-[0_16px_48px_rgba(0,0,0,0.5)] -translate-y-1" : "border-white/[0.06]"} ${clip.isAiHook ? "border-amber-500/15" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowControls(true) }}
    >
      {/* ── Video pane ── */}
      <div ref={paneRef} className="relative bg-black cursor-pointer overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: 320 }} onMouseMove={autoHideControls} onClick={togglePlay}>
        <video
          key={videoKey} ref={videoRef} src={baseVideoSrc}
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
          {clip.isAiHook && <span className="px-2 py-1 rounded-lg bg-amber-400/80 text-[9px] font-black text-[#0A0A0B]">🎯 Hook</span>}
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
            <div className="absolute left-0 h-[3px] bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
            <div className="absolute w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)] -translate-x-1/2 opacity-0 group-hover/seek:opacity-100 transition-opacity" style={{ left: `${pct}%` }} />
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
              <span className="text-[9px] font-mono text-white/35 ml-1">{fmt(currentTime)} / {fmt(duration || clip.duration)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white transition-colors" onClick={toggleMute}>
                {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
              {/* Custom fullscreen button */}
              <button
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-400/20 hover:bg-amber-400/35 text-amber-400 transition-all"
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
          <h3 className="text-[13px] font-bold text-white leading-snug mb-1 line-clamp-2">{clip.title}</h3>
          <p className="text-[11px] text-white/25 font-mono">{fmt(clip.startTime)} – {fmt(clip.endTime)}</p>
        </div>

        {/* Viral titles */}
        {clip.viralTitles?.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-amber-400/60 mb-2.5">
              <Sparkles size={9} /> Viral Titles
            </div>
            {clip.viralTitles.map((t, i) => {
              const key = `${clip.id}-${i}`
              return (
                <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                  <span className="text-[11px] text-white/55 flex-1 leading-snug">{t}</span>
                  <button onClick={() => onCopyTitle(t, key)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white/20 hover:text-amber-400 transition-all">
                    {copiedId === key ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* AI Description */}
        {clip.description && (
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-emerald-400/60">
                <Sparkles size={9} /> AI Description
              </div>
              <button onClick={() => onCopyTitle(clip.description, `${clip.id}-desc`)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white/20 hover:text-emerald-400 transition-all">
                {copiedId === `${clip.id}-desc` ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
              </button>
            </div>
            <p className="text-[11px] text-white/55 leading-snug">{clip.description}</p>
          </div>
        )}

        {/* AI Hashtags */}
        {clip.hashtags?.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-sky-400/60">
                <Sparkles size={9} /> Hashtags
              </div>
              <button onClick={() => onCopyTitle(clip.hashtags.map(h => `#${h}`).join(" "), `${clip.id}-tags`)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white/20 hover:text-sky-400 transition-all">
                {copiedId === `${clip.id}-tags` ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {clip.hashtags.map((h, i) => (
                <span key={i} className="text-[10px] font-semibold text-sky-400/70 bg-sky-400/[0.06] border border-sky-400/12 rounded-md px-1.5 py-0.5">#{h}</span>
              ))}
            </div>
          </div>
        )}

        {/* Captions section */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest uppercase text-blue-400/60">
              <Captions size={9} /> Captions
              <span className="text-white/15 normal-case font-medium ml-1">{clip.hasRealCaptions ? "· Whisper ✅" : "· placeholder"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={onToggleStylePicker} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] text-[9px] font-bold text-white/35 hover:text-white/60 transition-all">
                <Palette size={8} /> {styleInfo.name}
              </button>
              <button onClick={onToggleEdit} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-all ${editing ? "bg-amber-400/12 border-amber-400/25 text-amber-400" : "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.05] text-white/35 hover:text-white/60"}`}>
                <SlidersHorizontal size={8} /> Edit
              </button>
            </div>
          </div>

          {/* ── Edit Captions panel ── */}
          {editing && (
            <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 mb-2.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black tracking-widest uppercase text-amber-400/70 flex items-center gap-1"><SlidersHorizontal size={9} /> Customize · drag position in fullscreen</span>
                <button onClick={onResetOverrides} className="text-[9px] font-bold text-white/30 hover:text-white/70 flex items-center gap-1"><RotateCcw size={8} /> Reset</button>
              </div>

              {/* Colors */}
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-between gap-2 bg-white/[0.03] border border-white/[0.05] rounded-lg px-2 py-1.5">
                  <span className="text-[10px] font-semibold text-white/40">Text</span>
                  <input type="color" value={cap.textColor} onChange={e => onSetOverride({ textColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                </label>
                <label className="flex-1 flex items-center justify-between gap-2 bg-white/[0.03] border border-white/[0.05] rounded-lg px-2 py-1.5">
                  <span className="text-[10px] font-semibold text-white/40">Highlight</span>
                  <input type="color" value={cap.highlightColor} onChange={e => onSetOverride({ highlightColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                </label>
              </div>

              {/* Sliders */}
              {[
                { key: "fontSize",      label: "Size",     min: 48,  max: 140, val: cap.fontSize,      suffix: "px" },
                { key: "letterSpacing", label: "Spacing",  min: 0,   max: 12,  val: cap.letterSpacing, suffix: "" },
              ].map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-white/40 w-14">{s.label}</span>
                  <input type="range" min={s.min} max={s.max} value={s.val} onChange={e => onSetOverride({ [s.key]: Number(e.target.value) })} className="flex-1 accent-amber-400 h-1" />
                  <span className="text-[10px] font-mono text-white/50 w-12 text-right">{s.val}{s.suffix}</span>
                </div>
              ))}

              {/* Highlight words toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-white/40">Highlight active word</span>
                <button onClick={() => onSetOverride({ highlightWords: !cap.highlightWords })} className={`relative w-9 h-5 rounded-full transition-colors ${cap.highlightWords ? "bg-amber-400" : "bg-white/15"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cap.highlightWords ? "left-4" : "left-0.5"}`} />
                </button>
              </div>

              {captionState === "ready" && (
                <button onClick={onAddCaptions} className="w-full py-2 rounded-lg bg-amber-400/12 border border-amber-400/25 text-amber-400 text-[11px] font-bold hover:bg-amber-400/20 transition-all flex items-center justify-center gap-1.5">
                  <RefreshCw size={11} /> Apply changes
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1 text-[9px] font-bold text-white/20 uppercase tracking-wider">
              <Type size={8} /> Font
            </div>
            <select value={selectedFont} onChange={e => onSetCaptionFont(e.target.value)} className="bg-white/[0.03] border border-white/[0.05] rounded-lg text-[10px] text-white/50 px-2 py-1 font-semibold outline-none cursor-pointer">
              <option value="default">Default</option>
              <option value="Poppins">Poppins</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Outfit">Outfit</option>
              <option value="Impact">Impact</option>
              <option value="Arial Black">Arial Black</option>
            </select>
          </div>

          {captionState === "idle" && (
            <button onClick={onAddCaptions} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-blue-500/[0.06] border border-blue-500/12 text-blue-400 text-[11px] font-bold hover:bg-blue-500/10 transition-all">
              <Plus size={11} /> {clip.hasRealCaptions ? "Burn Real Captions" : "Burn Captions"}
              <span className="text-[9px] opacity-40">({styleInfo.name})</span>
            </button>
          )}
          {capLoad && (
            <div className="flex items-center gap-2 py-1 text-[11px] text-white/35">
              <div className="w-3 h-3 border-2 border-white/15 border-t-white/50 rounded-full animate-spin" /> Burning captions…
            </div>
          )}
          {capReady && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-emerald-400 font-semibold">✅ Captions active</span>
              <button onClick={onAddCaptions} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] text-[10px] text-white/30 hover:text-white/55 transition-all">
                <RotateCcw size={8} /> Re-apply
              </button>
            </div>
          )}
          {capErr && (
            <button onClick={onAddCaptions} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-red-500/[0.06] border border-red-500/12 text-red-400 text-[11px] font-bold hover:bg-red-500/10 transition-all">
              <RotateCcw size={11} /> Retry
            </button>
          )}
        </div>

        {/* Downloads */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
          <div className="text-[9px] font-black tracking-widest uppercase text-white/15 mb-2.5">Download</div>
          <div className="flex gap-2">
            <button onClick={onDownloadClean} disabled={!!dlLoading[`${clip.id}-clean`]} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] font-bold text-white/50 hover:text-white transition-all disabled:opacity-50">
              {dlLoading[`${clip.id}-clean`] ? <><div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> Saving…</> : <><Download size={11} /> Clean MP4</>}
            </button>
            <button onClick={capReady ? onDownloadCaptioned : undefined} disabled={!capReady || !!dlLoading[`${clip.id}-cap`]} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-bold transition-all ${capReady ? "bg-amber-400/[0.07] border-amber-400/18 text-amber-400 hover:bg-amber-400/12" : "bg-white/[0.02] border-white/[0.04] text-white/15 cursor-not-allowed"}`}>
              {dlLoading[`${clip.id}-cap`] ? <><div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" /> Saving…</> : <><Captions size={11} /> Captioned</>}
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 justify-between items-center">
          <button
            onClick={onFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/[0.06] hover:bg-amber-400/12 border border-amber-400/12 text-[11px] font-semibold text-amber-400/60 hover:text-amber-400 transition-all"
          >
            <Maximize size={11} /> Fullscreen 9:16
          </button>
          <div className="flex gap-2">
            {!clip.isCustom && (
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] text-[11px] font-semibold text-white/30 hover:text-white/65 transition-all">
                <Scissors size={10} /> Edit
              </button>
            )}
            <button onClick={onExpand} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] text-[11px] font-semibold text-white/30 hover:text-white/65 transition-all">
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />} Info
            </button>
          </div>
        </div>

        {/* Expanded info */}
        {expanded && (
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 space-y-2">
            {[["Type", clip.videoType], ["Language", clip.language], ["Start", fmt(clip.startTime)], ["End", fmt(clip.endTime)], ["Duration", `${clip.duration}s`], ["Score", `${clip.viralScore}%`], ["Captions", clip.hasRealCaptions ? "Real (Whisper)" : "Placeholder"], ["Caption Style", styleInfo.name]].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center">
                <span className="text-[11px] text-white/20">{k}</span>
                <span className="text-[11px] text-white/55 font-semibold">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showStylePicker && <CaptionStylePicker currentStyle={captionStyle} onSelect={onSetCaptionStyle} onClose={onToggleStylePicker} />}
    </div>
  )
}