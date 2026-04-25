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
  LogOut, RefreshCw, History, X,
} from "lucide-react"
import ExtendCutModal from "./ExtendCutModal"

const API_BASE = "http://localhost:5000/api"
const API_ROOT = "http://localhost:5000"

// ── Socket singleton with reconnection ────────────────────────────────────────
let _socket = null
const getSocket = () => {
  if (!_socket) {
    _socket = io(API_ROOT, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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

const isYT = (u) =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(u)

const scoreMeta = (n) => {
  if (n >= 90) return { color: "#f43f5e", label: "Viral", glow: "rgba(244,63,94,0.4)" }
  if (n >= 75) return { color: "#f97316", label: "Hot", glow: "rgba(249,115,22,0.4)" }
  return { color: "#06b6d4", label: "Good", glow: "rgba(6,182,212,0.4)" }
}

// ── Caption Style Presets ──────────────────────────────────────────────────────
export const CAPTION_STYLES = {
  classic: {
    id: "classic", name: "Classic", preview: "Hello World",
    font: "Arial Black", fontSize: 82, primaryColor: "#FFFFFF",
    highlightColor: "#FFFF00", outlineColor: "#000000",
    position: "bottom", animation: "word", bold: true,
    bgBox: false, bgColor: "rgba(0,0,0,0.5)",
    description: "Clean white text, yellow highlight",
  },
  neon: {
    id: "neon", name: "Neon", preview: "Hello World",
    font: "Impact", fontSize: 90, primaryColor: "#FFFFFF",
    highlightColor: "#FF0080", outlineColor: "#000000",
    position: "bottom", animation: "word", bold: true,
    bgBox: false, bgColor: "transparent",
    description: "Bold Impact with neon pink highlight",
  },
  tiktok: {
    id: "tiktok", name: "TikTok", preview: "Hello World",
    font: "Montserrat", fontSize: 78, primaryColor: "#FFFFFF",
    highlightColor: "#FE2C55", outlineColor: "#000000",
    position: "center", animation: "word", bold: true,
    bgBox: true, bgColor: "rgba(0,0,0,0.75)",
    description: "TikTok-style centered captions",
  },
  minimal: {
    id: "minimal", name: "Minimal", preview: "Hello World",
    font: "Helvetica Neue", fontSize: 68, primaryColor: "#FFFFFF",
    highlightColor: "#FFFFFF", outlineColor: "#000000",
    position: "bottom", animation: "line", bold: false,
    bgBox: false, bgColor: "transparent",
    description: "Clean, elegant, no highlights",
  },
  fire: {
    id: "fire", name: "🔥 Fire", preview: "Hello World",
    font: "Arial Black", fontSize: 88, primaryColor: "#FFF176",
    highlightColor: "#FF3D00", outlineColor: "#000000",
    position: "bottom", animation: "word", bold: true,
    bgBox: false, bgColor: "transparent",
    description: "Fiery yellow-orange palette",
  },
  hindi: {
    id: "hindi", name: "Hindi", preview: "नमस्ते",
    font: "Noto Sans", fontSize: 82, primaryColor: "#FFFFFF",
    highlightColor: "#00FFEA", outlineColor: "#000000",
    position: "bottom", animation: "word", bold: true,
    bgBox: false, bgColor: "transparent",
    description: "Noto Sans for Devanagari script",
  },
}

// ── Session persistence helpers ────────────────────────────────────────────────
const SESSIONS_KEY = "shortai_sessions"
const TOKEN_KEY    = "shortai_token"

const loadSavedSessions = () => {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]") }
  catch { return [] }
}
const saveSessions = (sessions) => {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-20))) }
  catch {}
}
const saveToken = (token) => {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY) }
  catch {}
}
const loadToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

// ── Inject global CSS ──────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("shortai-global")) {
  const s = document.createElement("style")
  s.id = "shortai-global"
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap');
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
    @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes glow    { 0%,100%{box-shadow:0 0 20px rgba(244,63,94,0.3)} 50%{box-shadow:0 0 40px rgba(244,63,94,0.6)} }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { background: #030305 !important; }
    input:focus { outline: none !important; }
    button { transition: all 0.15s ease !important; }
    button:active { transform: scale(0.96) !important; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
    .video-slider { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; outline: none; }
    .video-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #f43f5e; cursor: pointer; box-shadow: 0 0 8px rgba(244,63,94,0.8); }
    .card-enter { animation: slideUp 0.4s ease forwards; }
    .shimmer-bg { background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 100%); background-size: 200% 100%; animation: shimmer 2s infinite; }
    .glow-border { animation: glow 2s ease-in-out infinite; }
  `
  document.head.appendChild(s)
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard({ user, onLogout }) {
  const [url, setUrl]                   = useState("")
  const [processing, setProcessing]     = useState(false)
  const [clips, setClips]               = useState([])
  const [customClips, setCustomClips]   = useState([])
  const [error, setError]               = useState("")
  const [progressMsg, setProgressMsg]   = useState("")
  const [progressPct, setProgressPct]   = useState(0)
  const [videoInfo, setVideoInfo]       = useState(null)
  const [elapsed, setElapsed]           = useState(0)
  const [sessionId, setSessionId]       = useState(null)
  const [editingClip, setEditingClip]   = useState(null)
  const [copiedId, setCopiedId]         = useState(null)
  const [captionState, setCaptionState] = useState({})
  const [captionUrl, setCaptionUrl]     = useState({})
  const [dlLoading, setDlLoading]       = useState({})
  const [expanded, setExpanded]         = useState({})
  const [activeFilter, setActiveFilter] = useState("all")
  const [savedSessions, setSavedSessions] = useState([])
  const [showHistory, setShowHistory]   = useState(false)
  const [captionStyles, setCaptionStyles] = useState({}) // per clip style
  const [showStylePicker, setShowStylePicker] = useState(null) // clipId
  const [globalCaptionStyle, setGlobalCaptionStyle] = useState("classic")
  const [pastClips, setPastClips]       = useState([]) // past generated clips history
  const [splitScreenMode, setSplitScreenMode] = useState({}) // per clip split-screen toggle
  const [autoDetectedSplitScreen, setAutoDetectedSplitScreen] = useState({}) // tracks auto-detected speakers
  const pollRef = useRef(null)

  // ── Load past clips history on mount ──────────────────────────────────────────
  useEffect(() => {
    loadPastClipsHistory()
  }, [user])

  const loadPastClipsHistory = async () => {
    try {
      if (!user?.id && !user?._id) {
        console.log("[v0] No user ID found, skipping history load")
        return
      }
      const userId = user.id || user._id
      console.log("[v0] Loading clips history for userId:", userId)
      const response = await axios.get(`${API_BASE}/clips/history?userId=${userId}&limit=50`)
      console.log("[v0] History response:", response.data)
      if (response.data.success) {
        const clips = response.data.clips || []
        console.log("[v0] Loaded", clips.length, "past clips")
        setPastClips(clips)
      } else {
        console.log("[v0] History API returned success=false:", response.data)
      }
    } catch (error) {
      console.log("[v0] Failed to load clips history:", error.response?.status, error.message)
      // Silently fail for missing endpoint - this is OK
      setPastClips([])
    }
  }

  // ── Load saved token on mount ──────────────────────────────────────────────
  useEffect(() => {
    const token = loadToken()
    if (token && !user) {
      // Auto-restore auth — parent app should handle this via onAutoLogin prop
    }
    setSavedSessions(loadSavedSessions())
  }, [])

  // ── Persist session to localStorage whenever a session starts ─────────────
  useEffect(() => {
    if (!sessionId) return
    const sessions = loadSavedSessions()
    const exists = sessions.find(s => s.sessionId === sessionId)
    if (!exists) {
      const updated = [...sessions, { sessionId, url, startedAt: Date.now(), status: "processing" }]
      saveSessions(updated)
      setSavedSessions(updated)
    }
  }, [sessionId])

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    let iv
    if (processing) iv = setInterval(() => setElapsed((e) => e + 1), 1000)
    else setElapsed(0)
    return () => clearInterval(iv)
  }, [processing])

  // ── Socket listener ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    const handler = (data) => {
      if (data.sessionId !== sessionId) return
      setProgressMsg(data.currentStep || "")
      setProgressPct(data.progress || 0)
      if (data.status === "completed") {
        setClips(data.clips || [])
        setVideoInfo(data.videoInfo || null)
        setProcessing(false)
        setProgressMsg("")
        // Update saved session
        const sessions = loadSavedSessions()
        const updated = sessions.map(s =>
          s.sessionId === sessionId ? { ...s, status: "completed", completedAt: Date.now() } : s
        )
        saveSessions(updated)
        setSavedSessions(updated)
      } else if (data.status === "error") {
        setError(data.error || "Processing failed")
        setProcessing(false)
        setProgressMsg("")
      }
    }
    socket.on("progress", handler)
    return () => socket.off("progress", handler)
  }, [sessionId])

  // ── Detect speakers in clips for split-screen suggestion ────────────────────
  useEffect(() => {
    // Auto-detect if clips have multiple speakers and enable split-screen suggestion
    const detected = {}
    clips.forEach(clip => {
      // Check if clip has metadata indicating multiple speakers
      if (clip.speakerCount > 1 || clip.layout === "podcast_split") {
        detected[clip.id] = true
        setSplitScreenMode(p => ({ ...p, [clip.id]: true })) // Auto-enable for multi-speaker
      }
    })
    setAutoDetectedSplitScreen(detected)
  }, [clips])

  // ── Background polling — reconnects even if tab was closed ─────────────────
  useEffect(() => {
    if (!sessionId || !processing) { clearInterval(pollRef.current); return }
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API_BASE}/session/${sessionId}`)
        if (!r.data.success) {
          console.log("[v0] Session endpoint returned success=false")
          return
        }
        const s = r.data.session
        setProgressMsg(s.currentStep || "")
        setProgressPct(s.progress || 0)
        
        if (s.status === "completed") {
          console.log("[v0] Processing completed! Status:", s.status)
          const newClips = s.clips || []
          console.log("[v0] Number of clips received:", newClips.length)
          console.log("[v0] Clips data:", newClips)
          
          setClips(newClips)
          setVideoInfo(s.videoInfo || null)
          setProcessing(false)
          clearInterval(pollRef.current)
          
          // Save clips to history - fire and forget with error logging
          if (newClips.length > 0) {
            console.log("[v0] Clips completed, saving to history...")
            saveGeneratedClips(newClips).catch(err => {
              console.log("[v0] Background save failed (non-blocking):", err.message)
            })
          } else {
            console.log("[v0] No clips to save")
          }
        } else if (s.status === "error") {
          console.log("[v0] Processing error:", s.error)
          setError(s.error || "Processing failed")
          setProcessing(false)
          clearInterval(pollRef.current)
        }
      } catch (err) {
        console.log("[v0] Polling error:", err.message)
      }
    }, 5000) // poll every 5s as backup
    return () => clearInterval(pollRef.current)
  }, [sessionId, processing])

  // ── Restore in-progress session on page load ───────────────────────────────
  useEffect(() => {
    const sessions = loadSavedSessions()
    const inProgress = sessions.find(s => s.status === "processing")
    if (!inProgress) return
    const ageMin = (Date.now() - inProgress.startedAt) / 60000
    if (ageMin > 60) return // ignore old sessions
    // Rejoin the session
    setSessionId(inProgress.sessionId)
    setUrl(inProgress.url || "")
    setProcessing(true)
    setProgressMsg("Reconnecting to background session…")
    // Join socket room
    const socket = getSocket()
    socket.emit("rejoin", { sessionId: inProgress.sessionId })
  }, [])

  const handleGenerate = async () => {
    if (!url.trim()) return setError("Please enter a YouTube URL")
    if (!isYT(url)) return setError("Please enter a valid YouTube URL")
    setProcessing(true)
    setError("")
    setProgressMsg("Starting…")
    setProgressPct(0)
    setClips([])
    setCustomClips([])
    setVideoInfo(null)
    setCaptionState({})
    setCaptionUrl({})
    try {
      const r = await axios.post(`${API_BASE}/generate-clips`, { url })
      if (r.data.success) setSessionId(r.data.sessionId)
      else { setError(r.data.error || "Failed"); setProcessing(false) }
    } catch {
      setError("Cannot connect to server — is the backend running?")
      setProcessing(false)
    }
  }

  const restoreSession = async (sid) => {
    setShowHistory(false)
    try {
      const r = await axios.get(`${API_BASE}/session/${sid}`)
      if (!r.data.success) {
        alert("Session not found")
        return
      }
      const s = r.data.session
      setSessionId(sid)
      setProgressMsg(s.currentStep || "")
      setProgressPct(s.progress || 0)
      
      if (s.status === "completed") {
        const restoredClips = s.clips || []
        console.log("[v0] Restored session with", restoredClips.length, "clips")
        setClips(restoredClips)
        setVideoInfo(s.videoInfo || null)
        setProcessing(false)
        
        // Ensure clips are in history
        if (restoredClips.length > 0) {
          console.log("[v0] Saving restored clips to history...")
          saveGeneratedClips(restoredClips).catch(err => {
            console.log("[v0] Failed to save restored clips:", err.message)
          })
        }
      } else if (s.status === "processing") {
        console.log("[v0] Restoring in-progress session")
        setProcessing(true)
        setUrl(s.url || "")
      }
    } catch (err) {
      console.log("[v0] Restore session error:", err.message)
      alert("Session not found or expired")
    }
  }

  const download = async (clipId, filename, captioned = false) => {
    const key = `${clipId}-${captioned ? "cap" : "clean"}`
    setDlLoading((p) => ({ ...p, [key]: true }))
    try {
      const id = captioned ? `${clipId}_captioned` : clipId
      const r = await axios.get(`${API_BASE}/download/${id}`, { responseType: "blob" })
      const blobUrl = window.URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement("a")
      a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch { alert("Download failed — try again.") }
    finally { setDlLoading((p) => ({ ...p, [key]: false })) }
  }

  const handleAddCaptions = async (clipId) => {
    if (captionState[clipId] === "loading") return
    setCaptionState((p) => ({ ...p, [clipId]: "loading" }))
    const style = captionStyles[clipId] || globalCaptionStyle
    try {
      const r = await axios.post(`${API_BASE}/add-captions/${clipId}`, { sessionId, captionStyle: style })
      if (r.data.success) {
        setCaptionUrl((p) => ({ ...p, [clipId]: r.data.videoUrl }))
        setCaptionState((p) => ({ ...p, [clipId]: "ready" }))
      } else { setCaptionState((p) => ({ ...p, [clipId]: "error" })) }
    } catch { setCaptionState((p) => ({ ...p, [clipId]: "error" })) }
  }

  const handleExtendCut = async (clip, newStart, newEnd) => {
    try {
      setProgressMsg("Creating custom clip…")
      const r = await axios.post(`${API_BASE}/extend-cut-clip`, {
        clipId: clip.id, newStartTime: newStart, newEndTime: newEnd, sessionId,
      })
      if (r.data.success) { setCustomClips((p) => [...p, r.data.clip]); setEditingClip(null) }
      else alert(r.data.error || "Failed to create custom clip")
    } catch (e) { alert(e?.response?.data?.error || "Failed to create custom clip") }
    finally { setProgressMsg("") }
  }

  const openEdit = (clip) =>
    setEditingClip({
      ...clip,
      newStartTime: clip.startTime, newEndTime: clip.endTime,
      minStartTime: clip.minStartTime ?? Math.max(0, clip.startTime - 30),
      maxEndTime: clip.maxEndTime ?? clip.endTime + 30,
      originalStart: clip.originalStart ?? clip.startTime,
      originalEnd: clip.originalEnd ?? clip.endTime,
    })

  const copyTitle = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopiedId(key)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const saveGeneratedClips = async (clipsToSave) => {
    console.log("[v0] saveGeneratedClips called with", clipsToSave?.length, "clips")
    
    if (!user?.id && !user?._id) {
      console.log("[v0] No user ID, cannot save clips. User:", user)
      return
    }
    
    const userId = user.id || user._id
    console.log("[v0] Saving clips for userId:", userId)
    
    try {
      for (const clip of clipsToSave) {
        console.log("[v0] Saving clip:", clip.id, "with data:", {
          clipId: clip.id,
          userId,
          videoType: clip.videoType,
          language: clip.language,
        })
        
        const response = await axios.post(`${API_BASE}/clips`, {
          clipId: clip.id,
          userId,
          sessionId,
          title: clip.title || "Untitled",
          videoUrl: clip.videoUrl || "",
          thumbnail: clip.thumbnail || "",
          videoPath: clip.videoPath || "",
          duration: clip.duration || 0,
          startTime: clip.startTime || 0,
          viralScore: clip.viralScore || 0,
          videoType: clip.videoType || "general",
          language: clip.language || "en",
          captionStyle: globalCaptionStyle,
          splitScreenMode: splitScreenMode[clip.id] || false,
          speakerCount: clip.speakerCount || 1,
          tags: [clip.videoType, clip.language].filter(Boolean),
        })
        
        console.log("[v0] Saved clip response:", response.data)
      }
      
      console.log("[v0] All clips saved, reloading history...")
      // Reload history after saving
      await loadPastClipsHistory()
    } catch (error) {
      console.log("[v0] Failed to save clips to history:", error.message)
      console.log("[v0] Error response:", error.response?.data)
      // Don't throw - user experience shouldn't break if history save fails
    }
  }

  const allClips = [...clips, ...customClips]
  const filters = [
    { key: "all", label: "All", count: allClips.length },
    { key: "hook", label: "AI Hooks", count: allClips.filter(c => c.isAiHook).length },
    { key: "high", label: "Score 90+", count: allClips.filter(c => c.viralScore >= 90).length },
    { key: "custom", label: "Custom", count: customClips.length },
  ]
  const filtered = allClips.filter(c => {
    if (activeFilter === "hook") return c.isAiHook
    if (activeFilter === "high") return c.viralScore >= 90
    if (activeFilter === "custom") return c.isCustom
    return true
  })

  return (
    <div style={S.root}>
      {/* Ambient background */}
      <div style={S.ambient1} />
      <div style={S.ambient2} />
      <div style={S.ambient3} />
      <div style={S.grid} />

      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navInner}>
          <div style={S.navBrand}>
            <div style={S.logoMark}>
              <Film size={16} color="#fff" strokeWidth={2.5} />
            </div>
            <span style={S.brandName}>Short<span style={S.brandAccent}>AI</span></span>
            <span style={S.vTag}>v8</span>
          </div>
          <div style={S.navRight}>
            {videoInfo && (
              <div style={S.statusPill}>
                <span style={S.statusDot} />
                <span>{allClips.length} clips ready</span>
              </div>
            )}
            <button style={S.navBtn} onClick={() => setShowHistory(!showHistory)} title="Session History">
              <History size={16} />
            </button>
            {user && (
              <button style={S.navBtn} onClick={onLogout} title="Sign out">
                <LogOut size={16} />
              </button>
            )}
            <div style={S.avatar}>{(user?.name || "U").charAt(0).toUpperCase()}</div>
          </div>
        </div>
      </nav>

      {/* HISTORY PANEL */}
      {showHistory && (
        <div style={S.historyOverlay} onClick={() => setShowHistory(false)}>
          <div style={S.historyPanel} onClick={e => e.stopPropagation()}>
            <div style={S.historyHead}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Session History</span>
              <button style={S.iconBtn} onClick={() => setShowHistory(false)}><X size={16} /></button>
            </div>
            {savedSessions.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                No previous sessions found
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px" }}>
                {savedSessions.slice().reverse().map(s => (
                  <button key={s.sessionId} style={S.historyItem} onClick={() => restoreSession(s.sessionId)}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, textAlign: "left" }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                        {s.url?.slice(0, 50)}…
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                        {new Date(s.startedAt).toLocaleString()} · {s.status}
                      </span>
                    </div>
                    <RefreshCw size={13} color="rgba(255,255,255,0.4)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={S.wrap}>
        {/* HERO */}
        <header style={S.hero}>
          <div style={S.heroChip}>
            <Flame size={12} color="#f43f5e" />
            <span>AI-Powered Shorts Generator</span>
          </div>
          <h1 style={S.heroH1}>
            Transform videos into<br />
            <span style={S.heroGrad}>viral shorts</span>
          </h1>
          <p style={S.heroSub}>
            Drop a YouTube URL · AI extracts the best moments · 1080p 9:16 clips ready in minutes
          </p>
          <div style={S.statRow}>
            {[
              { icon: <Film size={13} />, v: user?.videosProcessed || 0, l: "Videos Processed" },
              { icon: <Scissors size={13} />, v: user?.clipsGenerated || 0, l: "Clips Generated" },
              { icon: <Star size={13} />, v: "85%", l: "Avg Viral Score" },
            ].map(({ icon, v, l }) => (
              <div key={l} style={S.statCard}>
                <span style={{ color: "#f43f5e" }}>{icon}</span>
                <strong style={{ fontSize: 20, fontWeight: 800 }}>{v}</strong>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{l}</span>
              </div>
            ))}
          </div>
        </header>

        {/* INPUT */}
        <div style={S.inputCard}>
          <div style={S.inputLabel}>YouTube URL</div>
          <div style={S.inputRow}>
            <input
              style={{ ...S.input, opacity: processing ? 0.6 : 1 }}
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !processing && handleGenerate()}
              disabled={processing}
            />
            <button
              style={{ ...S.genBtn, opacity: processing ? 0.75 : 1 }}
              onClick={handleGenerate}
              disabled={processing}
            >
              {processing
                ? <><Ring size={15} /> Processing…</>
                : <><Zap size={15} /> Generate Clips</>}
            </button>
          </div>

          {error && (
            <div style={S.errorBar}>
              <span style={{ color: "#f43f5e", fontSize: 16 }}>●</span>
              {error}
            </div>
          )}

          {!processing && !videoInfo && (
            <div style={S.featureGrid}>
              {[
                ["🎯", "AI Hook Detection"],
                ["✂️", "Smart 9:16 Crop"],
                ["🎙️", "Whisper Captions"],
                ["📺", "True 1080p"],
                ["🇮🇳", "Hindi Support"],
                ["⚡", "4x Parallel Encode"],
                ["🎨", "Caption Styles"],
                ["📦", "Background Process"],
              ].map(([icon, label]) => (
                <div key={label} style={S.featureChip}>
                  <span>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          )}

          {processing && (
            <div style={S.progressWrap}>
              <div style={S.progressTrack}>
                <div style={{ ...S.progressFill, width: `${progressPct}%` }} />
              </div>
              <div style={S.progressMeta}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{progressMsg}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={11} /> {fmt(elapsed)} · {progressPct}%
                </span>
              </div>
              <div style={S.bgNotice}>
                <span>🔄</span>
                <span>Processing continues even if you close this tab — come back anytime to check progress.</span>
              </div>
            </div>
          )}
        </div>

        {/* INFO RIBBON */}
        {videoInfo && (
          <div style={S.ribbon}>
            <span style={S.ribbonBadge}>✅ Complete</span>
            {[
              { e: "🎬", v: videoInfo.videoType },
              { e: videoInfo.language === "hindi" ? "🇮🇳" : "🇺🇸", v: videoInfo.language },
              { e: "⏱", v: `${Math.floor(videoInfo.duration / 60)}m` },
              { e: "📺", v: videoInfo.quality },
              { e: "💾", v: `${videoInfo.fileSize}MB` },
            ].map(({ e, v }) => v && (
              <span key={v} style={S.ribbonItem}>{e} {v}</span>
            ))}
            <span style={S.ribbonCount}>{allClips.length} clips</span>
          </div>
        )}

        {/* Whisper tip */}
        {allClips.length > 0 && !videoInfo?.hasRealCaptions && (
          <div style={S.warnBar}>
            ⚠️ <strong>Placeholder captions</strong> — for real word-by-word captions run:{" "}
            <code style={S.code}>pip install openai-whisper</code> then restart the server.
          </div>
        )}

        {/* LOADING CARD */}
        {processing && (
          <div style={S.loadCard}>
            <div style={S.loadRingWrap}>
              <div style={S.loadRingOuter} />
              <div style={S.loadRingInner} />
              <Film size={22} color="rgba(255,255,255,0.6)" style={{ position: "absolute" }} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              AI is processing your video
            </h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 24px" }}>
              You can safely close this tab — background processing continues
            </p>
            <div style={S.loadSteps}>
              {[
                ["🎵", "Detecting high-energy audio hook moments"],
                ["✂️", "Planning 9:16 crop with layout detection"],
                ["🎙️", "Transcribing audio with Whisper (real captions)"],
                ["📦", "Encoding 4 clips in parallel (ultrafast)"],
              ].map(([icon, text]) => (
                <div key={text} style={S.loadStep}>
                  <span>{icon}</span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CLIPS SECTION */}
        {allClips.length > 0 && (
          <section style={{ animation: "slideUp 0.5s ease" }}>
            <div style={S.sectionHeader}>
              <div>
                <h2 style={S.sectionTitle}>
                  <TrendingUp size={20} color="#f43f5e" />
                  {allClips.length} Clips Ready
                </h2>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
                  1080p · seekable player · word-by-word captions
                  {videoInfo?.hasRealCaptions ? " · Whisper ✅" : " · install whisper for real captions"}
                </p>
              </div>

              {/* Global caption style */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Default style:</span>
                <div style={S.styleSelect}>
                  {Object.values(CAPTION_STYLES).map(st => (
                    <button
                      key={st.id}
                      style={{ ...S.styleOption, ...(globalCaptionStyle === st.id ? S.styleOptionActive : {}) }}
                      onClick={() => setGlobalCaptionStyle(st.id)}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div style={S.filterBar}>
              {filters.map(f => (
                <button
                  key={f.key}
                  style={{ ...S.filterTab, ...(activeFilter === f.key ? S.filterActive : {}) }}
                  onClick={() => setActiveFilter(f.key)}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span style={{ ...S.badge, background: activeFilter === f.key ? "#f43f5e" : "rgba(255,255,255,0.08)" }}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={S.clipGrid}>
              {filtered.map((clip, idx) => (
                <div key={clip.id} style={{ animation: `slideUp 0.4s ease ${idx * 0.05}s both` }}>
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
                    onSetCaptionStyle={(style) => {
                      setCaptionStyles(p => ({ ...p, [clip.id]: style }))
                      setShowStylePicker(null)
                    }}
                    onExpand={() => setExpanded(p => ({ ...p, [clip.id]: !p[clip.id] }))}
                    onDownloadClean={() => download(clip.id, `${clip.id}_clean.mp4`, false)}
                    onAddCaptions={() => handleAddCaptions(clip.id)}
                    onDownloadCaptioned={() => download(clip.id, `${clip.id}_captioned.mp4`, true)}
                    onEdit={() => openEdit(clip)}
                    onCopyTitle={copyTitle}
                  />
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "64px 32px", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
                No clips match this filter
              </div>
            )}
          </section>
        )}

        {/* PAST CLIPS HISTORY */}
        {pastClips.length > 0 && (
          <section style={{ animation: "slideUp 0.5s ease", marginTop: 40 }}>
            <div style={S.sectionHeader}>
              <h2 style={S.sectionTitle}>
                <History size={20} color="#f43f5e" />
                Past Clips ({pastClips.length})
              </h2>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
                Your previously generated clips
              </p>
            </div>

            <div style={S.clipGrid}>
              {pastClips.slice(0, 12).map((clip, idx) => (
                <div key={clip.clipId} style={{ animation: `slideUp 0.4s ease ${idx * 0.05}s both` }}>
                  <div style={{ ...C.card, opacity: 0.85 }}>
                    {/* Thumbnail */}
                    <div style={{ position: "relative", height: 180, background: "#0a0a14", overflow: "hidden", borderRadius: "12px 12px 0 0" }}>
                      <img
                        src={clip.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='180'%3E%3Crect fill='%23111' width='300' height='180'/%3E%3C/svg%3E"}
                        alt={clip.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.7)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {fmt(clip.duration || 0)}
                      </div>
                    </div>

                    {/* Info */}
                    <div style={C.body}>
                      <h3 style={C.title}>{clip.title || "Untitled Clip"}</h3>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
                        <span>{clip.videoType || "general"}</span>
                        <span>·</span>
                        <span>{clip.language === "hindi" ? "🇮🇳 Hindi" : "🇬🇧 English"}</span>
                        {clip.splitScreenMode && <span style={{ color: "#22c55e" }}>· Split-screen</span>}
                      </div>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "0 0 12px" }}>
                        Generated {new Date(clip.createdAt).toLocaleDateString()}
                      </p>

                      {/* Viral Score */}
                      {clip.viralScore && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <Flame size={12} color={scoreMeta(clip.viralScore).color} />
                          <span style={{ fontSize: 11, color: scoreMeta(clip.viralScore).color, fontWeight: 600 }}>
                            {scoreMeta(clip.viralScore).label}
                          </span>
                        </div>
                      )}

                      {/* Download button */}
                      <a
                        href={API_ROOT + "/api/download/" + clip.clipId}
                        download={`${clip.clipId}.mp4`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 12px",
                          background: "rgba(244,63,94,0.1)",
                          border: "1px solid rgba(244,63,94,0.25)",
                          borderRadius: 8,
                          color: "#f43f5e",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          textDecoration: "none",
                          transition: "all 0.2s",
                        }}
                      >
                        <Download size={11} />
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pastClips.length > 12 && (
              <div style={{ textAlign: "center", padding: "20px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Showing 12 of {pastClips.length} clips
              </div>
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
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAPTION STYLE PICKER
// ─────────────────────────────────────────────────────────────────────────────
function CaptionStylePicker({ currentStyle, onSelect, onClose }) {
  return (
    <div style={SP.overlay} onClick={onClose}>
      <div style={SP.panel} onClick={e => e.stopPropagation()}>
        <div style={SP.head}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Caption Style</span>
          <button style={SP.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>
        <div style={SP.grid}>
          {Object.values(CAPTION_STYLES).map(style => (
            <button
              key={style.id}
              style={{ ...SP.card, ...(currentStyle === style.id ? SP.cardActive : {}) }}
              onClick={() => onSelect(style.id)}
            >
              <div style={SP.preview}>
                <span style={{
                  fontFamily: style.font, fontSize: 13, fontWeight: style.bold ? 700 : 400,
                  color: style.primaryColor, textShadow: `0 0 8px ${style.outlineColor}, 1px 1px 2px ${style.outlineColor}`,
                  background: style.bgBox ? style.bgColor : "transparent",
                  padding: style.bgBox ? "2px 6px" : 0, borderRadius: 4,
                }}>
                  {style.preview}
                </span>
              </div>
              <div style={SP.label}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{style.name}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{style.description}</span>
              </div>
              {currentStyle === style.id && (
                <div style={SP.checkMark}><Check size={10} /></div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const SP = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  panel: { background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 24, width: "min(500px, 95vw)", maxHeight: "80vh", overflowY: "auto" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  closeBtn: { background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "6px 8px", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, position: "relative", textAlign: "left", transition: "all 0.15s" },
  cardActive: { background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.4)" },
  preview: { background: "#111", borderRadius: 8, padding: "12px 8px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44 },
  label: { display: "flex", flexDirection: "column" },
  checkMark: { position: "absolute", top: 8, right: 8, background: "#f43f5e", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" },
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLIP CARD
// ─────────────────────────────────────────────────────────────────────────────
function ClipCard({
  clip, captionState, captionVideoUrl, dlLoading, copiedId,
  expanded, captionStyle, showStylePicker,
  onToggleStylePicker, onSetCaptionStyle,
  onExpand, onDownloadClean, onAddCaptions, onDownloadCaptioned,
  onEdit, onCopyTitle,
}) {
  const videoRef    = useRef(null)
  const [playing, setPlaying]           = useState(false)
  const [muted, setMuted]               = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)
  const [buffered, setBuffered]         = useState(0)
  const [hovered, setHovered]           = useState(false)
  const [videoKey, setVideoKey]         = useState(0)
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef(null)

  const score   = clip.viralScore || 0
  const sm      = scoreMeta(score)
  const capReady = captionState === "ready"
  const capLoad  = captionState === "loading"
  const capErr   = captionState === "error"
  const styleInfo = CAPTION_STYLES[captionStyle] || CAPTION_STYLES.classic

  const baseVideoSrc =
    capReady && captionVideoUrl
      ? API_ROOT + captionVideoUrl
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

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !muted; setMuted(!muted)
  }

  const handleSeek = (e) => {
    if (!videoRef.current || !duration) return
    const newTime = (parseFloat(e.target.value) / 100) * duration
    videoRef.current.currentTime = newTime; setCurrentTime(newTime)
  }

  const skip = (secs) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + secs))
  }

  const onTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
    if (videoRef.current.buffered.length > 0)
      setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1))
  }

  const onLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration || 0)
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
      style={{ ...C.card, ...(hovered ? C.cardHovered : {}), ...(clip.isAiHook ? C.cardHook : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowControls(true) }}
    >
      {/* VIDEO */}
      <div style={C.videoWrap} onMouseMove={autoHideControls} onClick={togglePlay}>
        <video
          key={videoKey}
          ref={videoRef}
          src={baseVideoSrc}
          poster={API_ROOT + clip.thumbnail}
          style={C.video}
          playsInline preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrentTime(0) }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          muted={muted}
        />

        {/* Badges top */}
        <div style={C.topLeft}>
          <span style={C.qualBadge}>{clip.quality || "1080p"}</span>
        </div>
        <div style={C.topRight}>
          {capReady && <span style={C.capActiveBadge}>📝 Captions</span>}
        </div>

        {/* Badges bottom */}
        <div style={C.bottomBadges}>
          <span style={C.durBadge}>{fmt(duration || clip.duration)}</span>
          <span style={{ ...C.scoreBadge, color: sm.color, boxShadow: `0 0 12px ${sm.glow}`, borderColor: sm.color + "44" }}>
            🔥 {score}%
          </span>
          {clip.isAiHook && <span style={C.hookBadge}>🎯 Hook</span>}
          {clip.isCustom && <span style={C.customBadge}>✂️ Custom</span>}
        </div>

        {/* Controls overlay */}
        <div style={{ ...C.overlay, opacity: showControls || !playing ? 1 : 0 }}>
          {!playing && (
            <div style={C.bigPlay} onClick={togglePlay}>
              <Play size={26} fill="white" color="white" />
            </div>
          )}
          <div style={C.controlBar} onClick={e => e.stopPropagation()}>
            {/* Seek */}
            <div style={C.seekWrap}>
              <div style={C.seekTrack} />
              <div style={{ ...C.seekBuf, width: `${buffPct}%` }} />
              <div style={{ ...C.seekPlayed, width: `${pct}%` }} />
              <div style={{ ...C.seekThumb, left: `${pct}%`, opacity: hovered ? 1 : 0 }} />
              <input
                type="range" className="video-slider"
                min="0" max="100" step="0.1" value={pct}
                onChange={handleSeek}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", zIndex: 10, margin: 0 }}
              />
            </div>
            {/* Buttons */}
            <div style={C.ctrlRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button style={C.ctrlBtn} onClick={() => skip(-5)}><SkipBack size={13} /></button>
                <button style={C.ctrlBtn} onClick={togglePlay}>
                  {playing ? <Pause size={14} fill="white" color="white" /> : <Play size={14} fill="white" color="white" />}
                </button>
                <button style={C.ctrlBtn} onClick={() => skip(5)}><SkipForward size={13} /></button>
                <span style={C.timeLabel}>{fmt(currentTime)} / {fmt(duration || clip.duration)}</span>
              </div>
              <button style={C.ctrlBtn} onClick={toggleMute}>
                {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={C.body}>
        <h3 style={C.title}>{clip.title}</h3>
        <p style={C.timeRange}>{fmt(clip.startTime)} – {fmt(clip.endTime)}</p>

        {/* Viral titles */}
        {clip.viralTitles?.length > 0 && (
          <div style={C.titlesBox}>
            <div style={C.boxLabel}>
              <Sparkles size={10} color="#a78bfa" />
              <span style={{ color: "#a78bfa" }}>Viral Titles</span>
            </div>
            {clip.viralTitles.map((t, i) => {
              const key = `${clip.id}-${i}`
              return (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", flex: 1, lineHeight: 1.4 }}>{t}</span>
                  <button style={C.copyBtn} onClick={() => onCopyTitle(t, key)}>
                    {copiedId === key ? <Check size={10} color="#34d399" /> : <Copy size={10} color="rgba(255,255,255,0.3)" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Caption section */}
        <div style={C.captionBox}>
          <div style={{ ...C.boxLabel, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Captions size={10} color="#60a5fa" />
              <span style={{ color: "#60a5fa" }}>Captions</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                {clip.hasRealCaptions ? "· Whisper ✅" : "· placeholder"}
              </span>
            </div>
            {/* Style picker button */}
            <button style={C.stylePillBtn} onClick={onToggleStylePicker}>
              <Palette size={10} />
              <span>{styleInfo.name}</span>
            </button>
          </div>

          {captionState === "idle" && (
            <button style={C.capBtn} onClick={onAddCaptions}>
              <Plus size={12} />
              {clip.hasRealCaptions ? "Burn Real Captions" : "Burn Captions"}
              <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>({styleInfo.name})</span>
            </button>
          )}
          {capLoad && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
              <Ring size={12} /> Burning captions…
            </div>
          )}
          {capReady && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12 }}>
              <span style={{ color: "#34d399" }}>✅ Captions active</span>
              <button style={C.reCapBtn} onClick={() => {
                // Reset so user can re-apply with new style
                window.dispatchEvent(new CustomEvent("reset-caption", { detail: clip.id }))
                onAddCaptions()
              }}>
                <RotateCcw size={10} /> Re-apply
              </button>
            </div>
          )}
          {capErr && (
            <button style={{ ...C.capBtn, borderColor: "rgba(244,63,94,0.3)", color: "#f87171" }} onClick={onAddCaptions}>
              <RotateCcw size={12} /> Retry
            </button>
          )}
        </div>

        {/* Downloads */}
        <div style={C.dlBox}>
          <div style={C.dlLabel}>DOWNLOAD</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={C.dlGreen} onClick={onDownloadClean} disabled={!!dlLoading[`${clip.id}-clean`]}>
              {dlLoading[`${clip.id}-clean`] ? <><Ring size={12} /> Saving…</> : <><Download size={12} /> Clean MP4</>}
            </button>
            <button
              style={{ ...C.dlPurple, opacity: capReady ? 1 : 0.35, cursor: capReady ? "pointer" : "not-allowed" }}
              onClick={capReady ? onDownloadCaptioned : undefined}
              disabled={!capReady || !!dlLoading[`${clip.id}-cap`]}
            >
              {dlLoading[`${clip.id}-cap`] ? <><Ring size={12} /> Saving…</> : <><Captions size={12} /> With Captions</>}
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {!clip.isCustom && (
            <button style={C.actionBtn} onClick={onEdit}><Scissors size={12} /> Edit</button>
          )}
          <button style={C.actionBtn} onClick={onExpand}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Info
          </button>
        </div>

        {expanded && (
          <div style={C.infoPanel}>
            {[
              ["Type", clip.videoType],
              ["Language", clip.language],
              ["Start", fmt(clip.startTime)],
              ["End", fmt(clip.endTime)],
              ["Duration", `${clip.duration}s`],
              ["Score", `${clip.viralScore}%`],
              ["Captions", clip.hasRealCaptions ? "Real (Whisper)" : "Placeholder"],
              ["Caption Style", styleInfo.name],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{k}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Caption Style Picker Modal */}
      {showStylePicker && (
        <CaptionStylePicker
          currentStyle={captionStyle}
          onSelect={onSetCaptionStyle}
          onClose={onToggleStylePicker}
        />
      )}
    </div>
  )
}

// ── Ring loader ────────────────────────────────────────────────────────────────
function Ring({ size = 16 }) {
  return (
    <span style={{
      display: "inline-block", flexShrink: 0,
      width: size, height: size,
      border: "2px solid rgba(255,255,255,0.12)",
      borderTopColor: "rgba(255,255,255,0.85)",
      borderRadius: "50%",
      animation: "spin 0.6s linear infinite",
    }} />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100vh",
    background: "#030305",
    color: "#f0f0f6",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  ambient1: { position: "fixed", top: -300, left: -300, width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(244,63,94,0.06) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 },
  ambient2: { position: "fixed", top: "35%", right: -400, width: 900, height: 900, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.04) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 },
  ambient3: { position: "fixed", bottom: -200, left: "35%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.035) 0%, transparent 65%)", pointerEvents: "none", zIndex: 0 },
  grid: { position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none", zIndex: 0 },

  nav: { position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(20px)", background: "rgba(3,3,5,0.8)" },
  navInner: { maxWidth: 1340, margin: "0 auto", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  navBrand: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #f43f5e, #fb923c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(244,63,94,0.35)" },
  brandName: { fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" },
  brandAccent: { color: "#f43f5e" },
  vTag: { fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.35)", padding: "2px 6px", borderRadius: 5, background: "rgba(244,63,94,0.08)" },
  navRight: { display: "flex", alignItems: "center", gap: 10 },
  statusPill: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: 99 },
  statusDot: { width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" },
  navBtn: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", fontFamily: "inherit" },
  avatar: { width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 },
  iconBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", padding: 4, fontFamily: "inherit" },

  historyOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", zIndex: 150, display: "flex", justifyContent: "flex-end" },
  historyPanel: { width: "min(400px, 95vw)", background: "#0c0c18", borderLeft: "1px solid rgba(255,255,255,0.08)", height: "100%", overflowY: "auto" },
  historyHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  historyItem: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "inherit", color: "inherit", width: "100%", transition: "all 0.15s" },

  wrap: { position: "relative", zIndex: 1, maxWidth: 1340, margin: "0 auto", padding: "0 24px 100px" },

  hero: { textAlign: "center", padding: "72px 16px 56px" },
  heroChip: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.25)", background: "rgba(244,63,94,0.07)", padding: "6px 14px", borderRadius: 99, marginBottom: 24, textTransform: "uppercase" },
  heroH1: { fontSize: "clamp(36px,5.5vw,64px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05, margin: "0 0 16px", fontFamily: "'Space Grotesk', sans-serif" },
  heroGrad: { background: "linear-gradient(135deg, #f43f5e 0%, #fb923c 40%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  heroSub: { fontSize: 15, color: "rgba(255,255,255,0.45)", margin: "0 auto 32px", maxWidth: 480, lineHeight: 1.6 },
  statRow: { display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  statCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 22px", minWidth: 100 },

  inputCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "24px", marginBottom: 20, backdropFilter: "blur(10px)" },
  inputLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)", marginBottom: 10, textTransform: "uppercase" },
  inputRow: { display: "flex", gap: 10 },
  input: { flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "13px 16px", color: "#f0f0f6", fontSize: 14, fontFamily: "inherit", transition: "border-color 0.2s, box-shadow 0.2s" },
  genBtn: { display: "flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 12, background: "linear-gradient(135deg, #f43f5e, #fb923c)", color: "white", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", boxShadow: "0 4px 20px rgba(244,63,94,0.35)" },
  errorBar: { marginTop: 12, padding: "10px 14px", background: "rgba(244,63,94,0.07)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 10, fontSize: 13, color: "#f87171", display: "flex", alignItems: "center", gap: 8 },
  featureGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 },
  featureChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 99, padding: "4px 10px" },
  progressWrap: { marginTop: 18 },
  progressTrack: { height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #f43f5e, #8b5cf6)", borderRadius: 99, transition: "width 0.7s ease" },
  progressMeta: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  bgNotice: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "7px 12px" },

  ribbon: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.12)", borderRadius: 12, padding: "10px 16px", marginBottom: 28 },
  ribbonBadge: { background: "rgba(16,185,129,0.12)", color: "#10b981", padding: "3px 10px", borderRadius: 6, fontWeight: 700, fontSize: 12 },
  ribbonItem: { fontSize: 13, color: "rgba(255,255,255,0.45)" },
  ribbonCount: { color: "#10b981", fontWeight: 800, marginLeft: "auto", fontSize: 14 },

  warnBar: { background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "rgba(251,191,36,0.8)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  code: { background: "rgba(0,0,0,0.4)", padding: "1px 7px", borderRadius: 5, fontFamily: "monospace", fontSize: 11 },

  loadCard: { textAlign: "center", padding: "60px 32px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, marginBottom: 32 },
  loadRingWrap: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, margin: "0 auto 24px" },
  loadRingOuter: { position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "#f43f5e", animation: "spin 1.1s linear infinite" },
  loadRingInner: { position: "absolute", inset: 8, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#8b5cf6", animation: "spin 0.7s linear infinite reverse" },
  loadSteps: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", maxWidth: 400, margin: "0 auto" },
  loadStep: { display: "flex", gap: 10, alignItems: "flex-start" },

  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 },
  sectionTitle: { display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.025em", fontFamily: "'Space Grotesk', sans-serif" },

  styleSelect: { display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 4, flexWrap: "wrap" },
  styleOption: { fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 7, background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" },
  styleOptionActive: { background: "rgba(244,63,94,0.15)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.3)" },

  filterBar: { display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" },
  filterTab: { display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  filterActive: { background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.3)", color: "#f43f5e" },
  badge: { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5, color: "white" },

  clipGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 },
}

// ── Clip card styles ───────────────────────────────────────────────────────────
const C = {
  card: { background: "rgba(12,12,22,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease" },
  cardHovered: { transform: "translateY(-3px)", boxShadow: "0 16px 48px rgba(0,0,0,0.6)", borderColor: "rgba(255,255,255,0.12)" },
  cardHook: { borderColor: "rgba(244,63,94,0.2)", boxShadow: "0 0 32px rgba(244,63,94,0.05)" },

  videoWrap: { position: "relative", background: "#000", aspectRatio: "9/16", maxHeight: 340, overflow: "hidden", cursor: "pointer" },
  video: { width: "100%", height: "100%", objectFit: "cover", display: "block" },

  topLeft: { position: "absolute", top: 9, left: 9 },
  topRight: { position: "absolute", top: 9, right: 9 },
  qualBadge: { background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", color: "#06b6d4", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, letterSpacing: "0.04em" },
  capActiveBadge: { background: "rgba(139,92,246,0.85)", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 },
  bottomBadges: { position: "absolute", bottom: 52, left: 8, display: "flex", flexWrap: "wrap", gap: 4 },
  durBadge: { background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6 },
  scoreBadge: { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(0,0,0,0.7)", border: "1px solid" },
  hookBadge: { background: "rgba(244,63,94,0.8)", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 },
  customBadge: { background: "rgba(6,182,212,0.8)", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6 },

  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)", transition: "opacity 0.25s", padding: "0 0 6px" },
  bigPlay: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-70%)", width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)", border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },

  seekWrap: { position: "relative", height: 20, margin: "0 10px 2px", display: "flex", alignItems: "center" },
  seekTrack: { position: "absolute", left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 99 },
  seekBuf: { position: "absolute", top: "50%", left: 0, height: 3, transform: "translateY(-50%)", background: "rgba(255,255,255,0.22)", borderRadius: 99, pointerEvents: "none" },
  seekPlayed: { position: "absolute", top: "50%", left: 0, height: 3, transform: "translateY(-50%)", background: "linear-gradient(90deg, #f43f5e, #8b5cf6)", borderRadius: 99, pointerEvents: "none" },
  seekThumb: { position: "absolute", top: "50%", width: 12, height: 12, borderRadius: "50%", background: "#f43f5e", transform: "translate(-50%,-50%)", boxShadow: "0 0 8px rgba(244,63,94,0.8)", pointerEvents: "none", zIndex: 2, transition: "opacity 0.2s" },

  controlBar: { padding: "0 10px" },
  ctrlRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  ctrlBtn: { background: "none", border: "none", color: "white", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", opacity: 0.85, fontFamily: "inherit" },
  timeLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginLeft: 2 },

  body: { padding: "14px 15px 15px", display: "flex", flexDirection: "column", gap: 10, flex: 1 },
  title: { fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.4, color: "#f0f0f6" },
  timeRange: { fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 },

  titlesBox: { background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.14)", borderRadius: 10, padding: "9px 11px" },
  boxLabel: { display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 7 },
  copyBtn: { background: "rgba(255,255,255,0.04)", border: "none", borderRadius: 5, padding: "3px 5px", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 },

  captionBox: { background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.1)", borderRadius: 10, padding: "9px 11px" },
  capBtn: { display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center", marginTop: 7, padding: "8px", borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  reCapBtn: { display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "inherit" },
  stylePillBtn: { display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 6, fontSize: 10, color: "#a78bfa", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" },

  dlBox: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 12px" },
  dlLabel: { fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 9 },
  dlGreen: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)", color: "#10b981", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  dlPurple: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 8, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.22)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },

  actionBtn: { display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  infoPanel: { background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.06)" },
}
