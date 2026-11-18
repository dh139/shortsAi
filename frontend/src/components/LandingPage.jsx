import { useState, useEffect, useRef } from "react"
import { ArrowRight, Sparkles, Check, Play, Pause, Download, SlidersHorizontal, RefreshCw, Scissors, Volume2, VolumeX, Eye, Maximize, X } from "lucide-react"
import { io } from "socket.io-client"
import axios from "axios"
import Navbar from "./Navbar"
import ExtendCutModal from "./ExtendCutModal"
import { CAPTION_STYLES } from "./Dashboard"

const API_BASE = "http://localhost:5000/api"
const API_ROOT = "http://localhost:5000"

const getFullUrl = (path) => {
  if (!path) return ""
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return `${API_ROOT}${cleanPath}`
}

let _socket = null
const getSocket = () => {
  if (!_socket) {
    _socket = io(API_ROOT, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
  }
  return _socket
}

export default function LandingPage() {
  const [url, setUrl] = useState("")
  const [selectedLanguage, setSelectedLanguage] = useState("auto")
  const [selectedLayout, setSelectedLayout] = useState("smart")

  // Live generation state
  const [isProcessing, setIsProcessing] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")
  const [sessionError, setSessionError] = useState(null)
  const [generatedClips, setGeneratedClips] = useState([])
  const [videoInfo, setVideoInfo] = useState(null)

  // Clip preview / editor modal state
  const [activeClip, setActiveClip] = useState(null)
  const [selectedStyle, setSelectedStyle] = useState("shortai")
  const [activeColor, setActiveColor] = useState("#9DFF4A")
  const [secondaryColor, setSecondaryColor] = useState("#EDEDE8")
  const [selectedFont, setSelectedFont] = useState(null)
  const [captionFontSize, setCaptionFontSize] = useState(96)
  const [availableTemplates, setAvailableTemplates] = useState([])
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [galleryFilter, setGalleryFilter] = useState("all")
  const [gallerySearch, setGallerySearch] = useState("")
  const [isBurningCaption, setIsBurningCaption] = useState(false)
  const [captionedVideoUrl, setCaptionedVideoUrl] = useState(null)
  const [trimModalClip, setTrimModalClip] = useState(null)
  const [isReelFullscreen, setIsReelFullscreen] = useState(false)
  const [isHoveringPlayer, setIsHoveringPlayer] = useState(false)
  const [isReframing, setIsReframing] = useState(false)

  // Fetch full 65+ WhiteStair templates catalogue on mount
  useEffect(() => {
    axios.get(`${API_BASE}/caption-templates`)
      .then(res => {
        if (res.data?.success && Array.isArray(res.data?.templates)) {
          setAvailableTemplates(res.data.templates)
        }
      })
      .catch(err => console.warn("Failed to load caption templates:", err.message))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsReelFullscreen(false)
        setTrimModalClip(null)
        setIsGalleryOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Interactive Drag & Drop caption positioning (percentage 0 - 100)
  const [captionPosY, setCaptionPosY] = useState(76)
  const [captionPosX, setCaptionPosX] = useState(50)
  const [isDraggingCaption, setIsDraggingCaption] = useState(false)
  const [showPositionDrag, setShowPositionDrag] = useState(false)
  const playerContainerRef = useRef(null)

  const updateCaptionPosition = (clientX, clientY) => {
    if (!playerContainerRef.current) return
    const rect = playerContainerRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const rawY = Math.round(((clientY - rect.top) / rect.height) * 100)
    const rawX = Math.round(((clientX - rect.left) / rect.width) * 100)
    const clampedY = Math.max(12, Math.min(88, rawY))
    const clampedX = Math.max(15, Math.min(85, rawX))
    setCaptionPosY(clampedY)
    setCaptionPosX(clampedX)
  }

  const handleContainerMouseMove = (e) => {
    if (!isDraggingCaption) return
    updateCaptionPosition(e.clientX, e.clientY)
  }

  const handleContainerTouchMove = (e) => {
    if (!isDraggingCaption || !e.touches[0]) return
    updateCaptionPosition(e.touches[0].clientX, e.touches[0].clientY)
  }

  // Global mousemove/touchmove while dragging caption so it doesn't drop outside player rect
  useEffect(() => {
    if (!isDraggingCaption) return
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      updateCaptionPosition(clientX, clientY)
    }
    const onUp = () => setIsDraggingCaption(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("touchend", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onUp)
    }
  }, [isDraggingCaption])

  const inputRef = useRef(null)

  const focusInput = () => {
    const el = document.getElementById("yt-url-input")
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setTimeout(() => el.focus(), 300)
    }
  }

  // Socket listener for live generation updates
  useEffect(() => {
    const socket = getSocket()
    const handleProgress = (data) => {
      if (!data) return
      if (sessionId && data.sessionId !== sessionId) return

      setProgress(data.progress || 0)
      if (data.currentStep) setCurrentStep(data.currentStep)

      if (data.status === "completed" && Array.isArray(data.clips)) {
        setIsProcessing(false)
        setGeneratedClips(data.clips)
        if (data.videoInfo) setVideoInfo(data.videoInfo)
        if (data.clips.length > 0) {
          setActiveClip(data.clips[0])
          setTimeout(() => {
            const el = document.getElementById("active-clip-studio")
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
          }, 350)
        }
      } else if (data.status === "error") {
        setIsProcessing(false)
        setSessionError(data.error || "Generation encountered an issue")
      }
    }

    socket.on("progress", handleProgress)
    return () => socket.off("progress", handleProgress)
  }, [sessionId, activeClip])

  // Handle URL submit
  const handleGenerate = async (e) => {
    if (e) e.preventDefault()
    const clean = url.trim()
    if (!clean) {
      focusInput()
      return
    }

    try {
      setIsProcessing(true)
      setSessionError(null)
      setProgress(5)
      setCurrentStep("Initiating AI clip engine…")
      setGeneratedClips([])

      // Scroll to stage
      const stage = document.getElementById("product-stage")
      if (stage) stage.scrollIntoView({ behavior: "smooth", block: "start" })

      const res = await axios.post(`${API_BASE}/generate-clips`, {
        url: clean,
        language: selectedLanguage,
        layout: selectedLayout,
      })

      if (res.data?.success && res.data?.sessionId) {
        setSessionId(res.data.sessionId)
      } else {
        throw new Error(res.data?.error || "Failed to start generation")
      }
    } catch (err) {
      setIsProcessing(false)
      setSessionError(err.response?.data?.error || err.message)
    }
  }

  // Apply caption style to active clip
  const handleApplyCaptionStyle = async (styleId = null, overrideActiveColor = null, overrideSecColor = null, overridePosY = null, overridePosX = null, overrideFontSize = null) => {
    if (!activeClip || !sessionId) return
    const sId = styleId || selectedStyle
    const aColor = overrideActiveColor || activeColor
    const sColor = overrideSecColor || secondaryColor
    const posY = overridePosY != null ? overridePosY : captionPosY
    const posX = overridePosX != null ? overridePosX : captionPosX
    const fSize = overrideFontSize != null ? overrideFontSize : captionFontSize
    setSelectedStyle(sId)
    setIsBurningCaption(true)
    try {
      const res = await axios.post(`${API_BASE}/add-captions/${activeClip.id}`, {
        sessionId,
        captionStyle: sId,
        selectedFont,
        textColor: sColor,
        highlightColor: aColor,
        overrides: {
          textColor: sColor,
          highlightColor: aColor,
          positionX: posX,
          positionY: posY,
          fontSize: fSize,
        }
      })
      if (res.data?.success && res.data?.videoUrl) {
        setCaptionedVideoUrl(`${API_ROOT}${res.data.videoUrl}`)
      }
    } catch (e) {
      console.warn("Caption burn failed:", e.message)
    } finally {
      setIsBurningCaption(false)
    }
  }

  // Reframe / change layout mode for active clip (Split, Inverted, Smart Track, Focus Left, Focus Right, etc.)
  const handleReframe = async (layoutMode) => {
    if (!activeClip || !sessionId || isReframing) return
    setIsReframing(true)
    const hadCaptions = !!captionedVideoUrl || !!activeClip.videoUrl?.includes("_captioned")
    try {
      const res = await axios.post(`${API_BASE}/re-layout`, {
        sessionId,
        clipId: activeClip.id,
        layoutMode
      })
      if (res.data?.success) {
        const newUrl = res.data.videoUrl
        const newThumb = res.data.thumbnail || activeClip.thumbnail
        const updated = {
          ...activeClip,
          layoutMode,
          videoUrl: newUrl,
          thumbnail: newThumb
        }
        setActiveClip(updated)
        setClips(prev => prev.map(c => c.id === activeClip.id ? updated : c))
        setCaptionedVideoUrl(null)

        // If the clip previously had burned captions, re-burn with current style
        if (hadCaptions) {
          await handleApplyCaptionStyle(selectedStyle)
        }
      }
    } catch (err) {
      console.error("Failed to reframe video:", err)
    } finally {
      setIsReframing(false)
    }
  }

  const handleExtendSave = async (clip, newStartTime, newEndTime) => {
    setIsBurningCaption(true)
    try {
      const res = await axios.post(`${API_BASE}/extend-cut-clip`, {
        clipId: clip.id,
        newStartTime,
        newEndTime,
        sessionId,
        layoutMode: selectedLayout,
      })
      if (res.data?.success && res.data?.clip) {
        const newClip = res.data.clip
        setGeneratedClips(prev => [newClip, ...prev.filter(c => c.id !== clip.id)])
        setActiveClip(newClip)
        setCaptionedVideoUrl(null)
        setTrimModalClip(null)
      } else {
        throw new Error(res.data?.error || "Failed to extend clip")
      }
    } catch (e) {
      console.error("Extend failed:", e.message)
      alert(e.response?.data?.error || e.message)
    } finally {
      setIsBurningCaption(false)
    }
  }

  // 48 waveform bars heights (percent)
  const waveformHeights = [
    30, 45, 25, 60, 85, 95, 80, 50, 35, 75,
    90, 100, 85, 70, 40, 25, 55, 70, 45, 30,
    65, 80, 95, 100, 90, 60, 40, 30, 50, 70,
    85, 95, 90, 65, 45, 35, 60, 80, 100, 90,
    75, 55, 40, 65, 85, 70, 50, 30
  ]

  return (
    <div className="min-h-screen bg-[#060606] text-[#EDEDE8] selection:bg-[#9DFF4A] selection:text-[#060606] relative overflow-hidden font-['Geist']">
      {/* ── 1. FLOATING GLASS PILL NAV ── */}
      <Navbar onStartFree={focusInput} />

      {/* ── 2. HERO SECTION ── */}
      <section id="hero" className="relative pt-36 md:pt-44 pb-20 px-6 max-w-[1240px] mx-auto flex flex-col items-center text-center">
        {/* Soft green ambient glow behind hero */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[720px] md:w-[960px] h-[460px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(157,255,74,0.14) 0%, rgba(6,6,6,0) 68%)",
          }}
        />

        {/* Micro eyebrow with pulsing green dot */}
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-[#1C1C1A] bg-[#0C0C0B] mb-8 select-none">
          <span className="w-2 h-2 rounded-full bg-[#9DFF4A] eyebrow-dot" />
          <span className="micro-label text-[11px] font-['Geist_Mono'] font-medium tracking-[0.14em] text-[#9A9A94]">
            AI CLIP ENGINE
          </span>
        </div>

        {/* Masked two-line headline */}
        <h1 className="hero-title text-[#EDEDE8] max-w-[1040px] select-none">
          <span className="headline-mask">
            <span className="headline-line-1">Long video in.</span>
          </span>
          <span className="headline-mask mt-1 md:mt-2">
            <span className="headline-line-2">
              <span className="accent-phrase">Viral shorts</span> out.
            </span>
          </span>
        </h1>

        {/* Sub copy */}
        <p className="body-text text-[#9A9A94] max-w-[540px] mt-6 text-[17px] md:text-[18px]">
          Paste a YouTube link. Our AI watches every second, picks the moments worth posting, and cuts them to 9:16 with captions.
        </p>

        {/* URL Input Bar */}
        <div className="w-full max-w-[640px] mt-10">
          <form
            onSubmit={handleGenerate}
            className="w-full p-2 rounded-full border border-[#2F2F2B] bg-[#121210]/90 backdrop-blur-md flex items-center justify-between gap-2 shadow-[0_12px_36px_rgba(0,0,0,0.6)] focus-within:border-[#9DFF4A] transition-colors"
          >
            <label htmlFor="yt-url-input" className="sr-only">
              YouTube URL
            </label>
            <input
              ref={inputRef}
              id="yt-url-input"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="youtube.com/watch?v=..."
              className="flex-1 bg-transparent border-none outline-none text-[#EDEDE8] placeholder-[#6E6E68] text-[15px] px-4 font-['Geist'] font-normal"
            />
            <button
              type="submit"
              disabled={isProcessing}
              className="btn-primary text-[14px] px-6 h-[44px] shrink-0"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>Generate clips</>
              )}
            </button>
          </form>

          {/* Quick options: Language + Framing */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-[13px] text-[#9A9A94]">
            <div className="flex items-center gap-1.5">
              <span className="text-[#6E6E68]">Language:</span>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-[#0C0C0B] border border-[#1C1C1A] text-[#EDEDE8] rounded-full px-2.5 py-1 text-[12px] outline-none cursor-pointer hover:border-[#2F2F2B]"
              >
                <option value="auto">Auto-detect (Hinglish / Gujlish / English)</option>
                <option value="hinglish">Hinglish (Hindi in English letters)</option>
                <option value="gujlish">Gujlish (Gujarati in English letters)</option>
                <option value="english">English</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#6E6E68]">Framing:</span>
              <select
                value={selectedLayout}
                onChange={(e) => setSelectedLayout(e.target.value)}
                className="bg-[#0C0C0B] border border-[#1C1C1A] text-[#EDEDE8] rounded-full px-2.5 py-1 text-[12px] outline-none cursor-pointer hover:border-[#2F2F2B]"
              >
                <option value="smart">Full Screen 9:16 Reel (Smart Pan)</option>
                <option value="split">Split 2-Person (Podcast Top/Bottom)</option>
                <option value="center">Static Center 9:16</option>
                <option value="fit">Fit / Letterbox Full Frame</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. PRODUCT STAGE PANEL ── */}
      <section id="product-stage" className="max-w-[1240px] mx-auto px-6 mb-28">
        <div className="w-full bg-[#0C0C0B] border border-[#1C1C1A] rounded-[32px] p-6 md:p-10 relative overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.85)]">
          {/* Subtle top inner gradient */}
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#141E0F]/20 to-transparent pointer-events-none" />

          {/* Stage Top Header Row */}
          <div className="flex items-center justify-between pb-6 border-b border-[#1C1C1A] relative z-10">
            <div className="flex items-center gap-3">
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94] tracking-[0.14em]">
                {isProcessing
                  ? `LIVE ANALYSIS · ${progress}%`
                  : generatedClips.length > 0
                  ? `READY · ${videoInfo?.title?.slice(0, 36) || "Video clips"}`
                  : "Analyzing · 01:42:18"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#9DFF4A] eyebrow-dot" />
              <span className="font-['Geist_Mono'] text-[12px] uppercase tracking-wider text-[#9DFF4A] font-medium">
                {isProcessing
                  ? currentStep || "Processing..."
                  : generatedClips.length > 0
                  ? `${generatedClips.length} clips ready`
                  : "4 moments found"}
              </span>
            </div>
          </div>

          {/* Waveform & Sweeping Scan Line Container */}
          <div className="relative py-8 my-4 overflow-hidden select-none">
            {/* The sweeping scan line */}
            <div className="scan-line" />

            {/* Waveform Bars */}
            <div className="flex items-center justify-between gap-1 md:gap-2 h-28 px-2">
              {waveformHeights.map((h, i) => {
                // Determine if bar is in a detected viral moment zone
                const isMoment =
                  (i >= 5 && i <= 8) ||
                  (i >= 18 && i <= 22) ||
                  (i >= 30 && i <= 34) ||
                  (i >= 40 && i <= 43)

                const isProcessed = isProcessing ? (i / waveformHeights.length) * 100 <= progress : true

                return (
                  <div
                    key={i}
                    className="flex-1 flex items-center justify-center h-full"
                  >
                    <div
                      className={`w-full max-w-[8px] rounded-full transition-all duration-300 waveform-bar ${
                        isMoment && isProcessed
                          ? "bg-[#9DFF4A] shadow-[0_0_12px_rgba(157,255,74,0.6)]"
                          : "bg-[#1E1E1C]"
                      }`}
                      style={{
                        height: `${h}%`,
                        animationDelay: `${(i % 12) * 0.1}s`,
                        animationDuration: `${1.2 + (i % 5) * 0.15}s`,
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live Generated Clips Showcase OR 4 Mockup Tilted Phone Cards */}
          {generatedClips.length > 0 ? (
            /* REAL GENERATED CLIPS GRID */
            <div className="mt-8 pt-8 border-t border-[#1C1C1A]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-['Bricolage_Grotesque'] font-bold text-[24px] text-[#EDEDE8]">
                    Generated 9:16 Shorts
                  </h3>
                  <p className="text-[14px] text-[#9A9A94]">
                    AI ranked moments by viral retention with burned-in animated captions
                  </p>
                </div>
                <button
                  onClick={() => {
                    setGeneratedClips([])
                    setUrl("")
                  }}
                  className="btn-ghost text-[13px] h-[36px] px-4"
                >
                  New video
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {generatedClips.map((clip, idx) => {
                  const isCurActive = activeClip?.id === clip.id
                  return (
                    <div
                      key={clip.id}
                      onClick={() => {
                        setActiveClip(clip)
                        setCaptionedVideoUrl(null)
                        setTimeout(() => {
                          const el = document.getElementById("active-clip-studio")
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
                        }, 100)
                      }}
                      className={`phone-card p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 ${
                        isCurActive
                          ? "ring-2 ring-[#9DFF4A] shadow-[0_0_24px_rgba(157,255,74,0.3)]"
                          : "hover:border-[#9DFF4A]"
                      }`}
                      style={{ minHeight: "380px" }}
                    >
                      {/* Top Row: Score Badge + Rank */}
                      <div className="flex items-center justify-between">
                        <span className="bg-[#9DFF4A] text-[#060606] font-['Geist_Mono'] font-bold text-[12px] px-2.5 py-0.5 rounded-full">
                          {clip.viralScore || 90 + idx}
                        </span>
                        <span className="font-['Geist_Mono'] text-[11px] text-[#9A9A94]">
                          {clip.duration || 30}s
                        </span>
                      </div>

                      {/* Video / Thumbnail preview */}
                      <div className="flex-1 flex items-center justify-center my-4 relative rounded-xl overflow-hidden bg-[#121210] aspect-[9/16] max-h-[220px]">
                        {clip.thumbnail ? (
                          <div className="w-full h-full relative flex items-center justify-center">
                            <img
                              src={getFullUrl(clip.thumbnail)}
                              alt={clip.title}
                              className="w-full h-full object-cover rounded-xl"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fb = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                                if (fb) fb.style.display = 'flex';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                            <div className="fallback-icon absolute inset-0 hidden items-center justify-center bg-[#151C0F]">
                              <Play size={24} className="text-[#9DFF4A]" />
                            </div>
                            {/* Timestamp badge */}
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/85 border border-white/20 text-[10px] font-['Geist_Mono'] text-[#9DFF4A] shadow-md flex items-center gap-1">
                              <span>{Math.floor(clip.startTime / 60)}:{String(Math.floor(clip.startTime % 60)).padStart(2, "0")} - {Math.floor(clip.endTime / 60)}:{String(Math.floor(clip.endTime % 60)).padStart(2, "0")}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-[#1C2812] border border-[#2F441E] flex items-center justify-center">
                            <Play size={22} className="text-[#9DFF4A] ml-1" />
                          </div>
                        )}
                      </div>

                      {/* Bottom Caption & Title */}
                      <div>
                        <p className="font-['Bricolage_Grotesque'] font-bold text-[13px] text-[#EDEDE8] line-clamp-1 mb-1">
                          {clip.title || `Clip #${idx + 1}`}
                        </p>
                        <p className="font-['Geist'] text-[11px] text-[#9A9A94] line-clamp-2">
                          {clip.reason || clip.description}
                        </p>
                        <button
                          type="button"
                          className="mt-3 w-full py-1.5 rounded-full bg-[#182310] border border-[#2A3E1B] text-[#9DFF4A] text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#9DFF4A] hover:text-[#060606] transition-all"
                        >
                          <Play size={12} /> Preview & Edit
                        </button>
                      </div>

                      {/* Bottom progress bar */}
                      <div className="w-full h-[3px] bg-[#1E1E1C] rounded-full overflow-hidden mt-3">
                        <div className="h-full bg-[#9DFF4A] w-full" />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Active Clip Preview & Caption Customization Studio */}
              {activeClip && (
                <div id="active-clip-studio" className="mt-10 p-6 md:p-8 rounded-3xl bg-[#0C0C0B] border border-[#1C1C1A] shadow-2xl">
                  <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Left: 9:16 Video Player / Live Preview with Draggable Captions */}
                    <div className="w-full lg:w-[320px] shrink-0 flex flex-col items-center">
                      <div
                        ref={playerContainerRef}
                        onMouseMove={handleContainerMouseMove}
                        onTouchMove={handleContainerTouchMove}
                        onMouseEnter={() => setIsHoveringPlayer(true)}
                        onMouseLeave={() => setIsHoveringPlayer(false)}
                        className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-[#2F2F2B] shadow-2xl flex items-center justify-center select-none group"
                      >
                        {/* Reel Fullscreen Button */}
                        <button
                          type="button"
                          onClick={() => setIsReelFullscreen(true)}
                          className="absolute top-3 right-3 z-40 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black text-[#EDEDE8] hover:text-[#9DFF4A] border border-white/20 hover:border-[#9DFF4A] transition-all flex items-center gap-1.5 text-[11px] font-['Geist_Mono'] shadow-xl backdrop-blur-md cursor-pointer"
                          title="Open Reel Fullscreen (9:16)"
                        >
                          <Maximize size={13} />
                          <span>Reel Fullscreen</span>
                        </button>

                        {/* Reframing Loading Overlay */}
                        {isReframing && (
                          <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 text-center">
                            <div className="w-12 h-12 border-3 border-[#9DFF4A] border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_20px_rgba(157,255,74,0.4)]" />
                            <span className="text-base font-bold text-white tracking-wide font-['Bricolage_Grotesque']">Reframing 1080p Video...</span>
                            <span className="text-xs text-[#9DFF4A] mt-1 font-['Geist_Mono']">Centering faces & assembling layout</span>
                          </div>
                        )}

                        {/* Burning Captions Overlay */}
                        {isBurningCaption && !isReframing && (
                          <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 text-center">
                            <div className="w-12 h-12 border-3 border-[#9DFF4A] border-t-transparent rounded-full animate-spin mb-3 shadow-[0_0_20px_rgba(157,255,74,0.4)]" />
                            <span className="text-base font-bold text-white tracking-wide font-['Bricolage_Grotesque']">Applying Style & Captions...</span>
                            <span className="text-xs text-[#9DFF4A] mt-1 font-['Geist_Mono']">Rendering animated typography at 1080p</span>
                          </div>
                        )}

                        {captionedVideoUrl ? (
                          <video
                            key={captionedVideoUrl}
                            src={captionedVideoUrl}
                            poster={activeClip.thumbnail ? getFullUrl(activeClip.thumbnail) : undefined}
                            preload="auto"
                            playsInline
                            crossOrigin="anonymous"
                            controls
                            controlsList="nofullscreen"
                            autoPlay
                            className="w-full h-full object-cover"
                          />
                        ) : activeClip.videoUrl ? (
                          <video
                            key={activeClip.videoUrl}
                            src={getFullUrl(activeClip.videoUrl)}
                            poster={activeClip.thumbnail ? getFullUrl(activeClip.thumbnail) : undefined}
                            preload="auto"
                            playsInline
                            crossOrigin="anonymous"
                            controls
                            controlsList="nofullscreen"
                            autoPlay
                            className="w-full h-full object-cover"
                          />
                        ) : activeClip.thumbnail ? (
                          <div className="relative w-full h-full flex items-center justify-center bg-[#10150D]">
                            <img
                              src={getFullUrl(activeClip.thumbnail)}
                              alt={activeClip.title}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleApplyCaptionStyle(selectedStyle)}
                                disabled={isBurningCaption}
                                className="btn-primary text-[14px] px-6 h-[46px] shadow-lg mb-2"
                              >
                                {isBurningCaption ? (
                                  <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    Burning Captions…
                                  </>
                                ) : (
                                  <>
                                    <Play size={18} />
                                    Preview with Captions
                                  </>
                                )}
                              </button>
                              <span className="text-[12px] text-[#9A9A94]">Click to render 9:16 player preview</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center p-4">
                            <Play size={32} className="text-[#9DFF4A] mx-auto mb-2" />
                            <p className="text-xs text-[#9A9A94]">Select clip to preview</p>
                          </div>
                        )}

                        {/* Real-time Draggable Caption Placement Overlay */}
                        {(!captionedVideoUrl || isDraggingCaption || showPositionDrag) && (() => {
                          const clipWords = (activeClip.captionSegments && activeClip.captionSegments.length > 0)
                            ? activeClip.captionSegments.slice(0, 3).map(s => s.word)
                            : (activeClip.title ? activeClip.title.replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean).slice(0, 3) : ["VIRAL", "MOMENTS", "CAPTURED"])
                          const w1 = clipWords[0] || "VIRAL"
                          const w2 = clipWords[1] || "MOMENTS"
                          const w3 = clipWords.slice(2).join(" ") || "CAPTURED"

                          return (
                            <div
                              style={{
                                top: `${captionPosY}%`,
                                left: `${captionPosX}%`,
                                transform: "translate(-50%, -50%)",
                                cursor: isDraggingCaption ? "grabbing" : "grab",
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setIsDraggingCaption(true)
                                setShowPositionDrag(true)
                              }}
                              onTouchStart={(e) => {
                                e.stopPropagation()
                                setIsDraggingCaption(true)
                                setShowPositionDrag(true)
                              }}
                              className={`absolute z-30 px-4 py-2.5 rounded-2xl select-none transition-all ${
                                isDraggingCaption
                                  ? "border-2 border-[#9DFF4A] bg-black/95 shadow-[0_0_30px_rgba(157,255,74,0.6)] scale-105 ring-2 ring-[#9DFF4A]"
                                  : "border border-white/30 bg-black/75 hover:border-[#9DFF4A] hover:bg-black/90 backdrop-blur-md"
                              }`}
                            >
                              {selectedStyle === "discipline" ? (
                                <div className="caption-discipline text-center pointer-events-none">
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.15)}px` }} className="text-white font-extrabold tracking-tight">{w1.toLowerCase()}</div>
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.22)}px` }} className="caption-discipline-accent">{`${w2} ${w3}`.trim().toLowerCase()}.</div>
                                </div>
                              ) : selectedStyle === "crazy" ? (
                                <div className="caption-crazy text-center pointer-events-none">
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.12)}px`, color: secondaryColor }}>{w1.toUpperCase()}</div>
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.20)}px`, color: activeColor }} className="caption-crazy-hero">{w2.toUpperCase()}</div>
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.12)}px`, color: secondaryColor }}>{w3.toUpperCase()}</div>
                                </div>
                              ) : selectedStyle === "estate4" ? (
                                <div className="caption-estate4 text-center pointer-events-none">
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.13)}px`, color: secondaryColor }}>{`${w1} ${w2}`.trim()}</div>
                                  <div style={{ fontSize: `${Math.round(captionFontSize * 0.20)}px`, color: activeColor }} className="caption-estate4-hero">{w3.toUpperCase()}</div>
                                </div>
                              ) : (
                                <div style={{ fontSize: `${Math.round(captionFontSize * 0.17)}px` }} className="text-center font-['Bricolage_Grotesque'] font-black tracking-tight pointer-events-none">
                                  <span style={{ color: secondaryColor }}>{w1} </span>
                                  <span style={{ color: activeColor }} className="scale-105 inline-block">{w2}</span>
                                  <span style={{ color: secondaryColor }}> {w3}</span>
                                </div>
                              )}
                              <div className="text-[9px] text-[#9DFF4A] font-['Geist_Mono'] font-bold text-center mt-1 uppercase tracking-wider opacity-90 pointer-events-none flex items-center justify-center gap-1">
                                <span>↕ Drag to move ({captionPosY}%)</span>
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Quick Position Controls */}
                      <div className="w-full mt-3 flex items-center justify-between text-[11px] font-['Geist_Mono'] text-[#9A9A94]">
                        <div className="flex items-center gap-2">
                          <span>Pos: Y={captionPosY}%</span>
                          {captionedVideoUrl && (
                            <button
                              type="button"
                              onClick={() => setShowPositionDrag(p => !p)}
                              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${showPositionDrag ? "border-[#9DFF4A] text-[#9DFF4A] bg-[#121210]" : "border-[#1C1C1A] text-[#8A8A84] hover:border-[#2F2F2B]"}`}
                              title="Toggle drag placement overlay"
                            >
                              {showPositionDrag ? "✓ Hide Drag Box" : "↕ Reposition"}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCaptionPosY(25)}
                            className={`px-2.5 py-0.5 rounded border transition-colors ${captionPosY === 25 ? "border-[#9DFF4A] text-[#9DFF4A] bg-[#121210]" : "border-[#1C1C1A] text-[#8A8A84] hover:border-[#2F2F2B]"}`}
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            onClick={() => setCaptionPosY(50)}
                            className={`px-2.5 py-0.5 rounded border transition-colors ${captionPosY === 50 ? "border-[#9DFF4A] text-[#9DFF4A] bg-[#121210]" : "border-[#1C1C1A] text-[#8A8A84] hover:border-[#2F2F2B]"}`}
                          >
                            Center
                          </button>
                          <button
                            type="button"
                            onClick={() => setCaptionPosY(76)}
                            className={`px-2.5 py-0.5 rounded border transition-colors ${captionPosY === 76 ? "border-[#9DFF4A] text-[#9DFF4A] bg-[#121210]" : "border-[#1C1C1A] text-[#8A8A84] hover:border-[#2F2F2B]"}`}
                          >
                            Bottom
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: Caption Studio & Controls */}
                    <div className="flex-1 w-full flex flex-col justify-between">
                      <div>
                        {/* Title & Metadata */}
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1C1C1A] pb-4 mb-6">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="bg-[#9DFF4A] text-[#060606] font-['Geist_Mono'] font-bold text-[12px] px-2.5 py-0.5 rounded-full">
                                Score {activeClip.viralScore}/100
                              </span>
                              <span className="text-[12px] font-['Geist_Mono'] text-[#8A8A84]">
                                {activeClip.duration}s · 1080p Full HD · {activeClip.language || "Auto"}
                              </span>
                            </div>
                            <h4 className="font-['Bricolage_Grotesque'] font-bold text-[22px] md:text-[24px] text-[#EDEDE8]">
                              {activeClip.title}
                            </h4>
                            <p className="text-[14px] text-[#9A9A94] mt-1">
                              {activeClip.reason || activeClip.description}
                            </p>
                          </div>
                        </div>

                        {/* 0. Video Framing / Layout Selector */}
                        <div className="mb-6 p-4 rounded-2xl bg-[#0F0F0D] border border-[#1F1F1D] shadow-lg">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">📐</span>
                              <label className="micro-label text-[#EDEDE8] font-bold tracking-wider">
                                VIDEO FRAMING & LAYOUT
                              </label>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-['Geist_Mono'] font-bold bg-[#1C1C1A] text-[#9DFF4A] border border-[#9DFF4A]/40 flex items-center gap-1.5 shadow-[0_0_10px_rgba(157,255,74,0.15)]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#9DFF4A] animate-pulse" />
                              {activeClip.layoutMode === "split"
                                ? "Split Screen (Top/Bottom)"
                                : activeClip.layoutMode === "split_reverse"
                                ? "Inverted Split (Bottom/Top)"
                                : activeClip.layoutMode === "left"
                                ? "Focus Left (Host)"
                                : activeClip.layoutMode === "right"
                                ? "Focus Right (Guest)"
                                : activeClip.layoutMode === "center"
                                ? "Center Focus"
                                : activeClip.layoutMode === "fit"
                                ? "Fit 16:9 Full"
                                : "Auto Smart Track"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {/* Split Screen */}
                            <button
                              type="button"
                              onClick={() => handleReframe("split")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                (activeClip.layoutMode === "split" || (!activeClip.layoutMode && activeClip.splitScreenMode))
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">🎙️</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Split Screen</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">Top & Bottom</div>
                              </div>
                            </button>

                            {/* Inverted Split */}
                            <button
                              type="button"
                              onClick={() => handleReframe("split_reverse")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                activeClip.layoutMode === "split_reverse"
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">🔄</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Swap Split</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">Bottom & Top</div>
                              </div>
                            </button>

                            {/* Auto Smart Track */}
                            <button
                              type="button"
                              onClick={() => handleReframe("smart")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                activeClip.layoutMode === "smart"
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">👤</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Smart Track</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">Active Speaker</div>
                              </div>
                            </button>

                            {/* Focus Left */}
                            <button
                              type="button"
                              onClick={() => handleReframe("left")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                activeClip.layoutMode === "left"
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">👈</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Focus Left</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">Speaker 1 / Host</div>
                              </div>
                            </button>

                            {/* Focus Right */}
                            <button
                              type="button"
                              onClick={() => handleReframe("right")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                activeClip.layoutMode === "right"
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">👉</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Focus Right</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">Speaker 2 / Guest</div>
                              </div>
                            </button>

                            {/* Center Focus */}
                            <button
                              type="button"
                              onClick={() => handleReframe("center")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                activeClip.layoutMode === "center"
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">🎯</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Center Focus</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">9:16 Fixed Center</div>
                              </div>
                            </button>

                            {/* Fit 16:9 Full */}
                            <button
                              type="button"
                              onClick={() => handleReframe("fit")}
                              disabled={isReframing}
                              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                                activeClip.layoutMode === "fit"
                                  ? "bg-[#9DFF4A]/10 border-[#9DFF4A] text-[#9DFF4A] shadow-[0_0_15px_rgba(157,255,74,0.2)]"
                                  : "bg-[#141412] border-[#222220] text-[#EDEDE8] hover:border-[#383834] hover:bg-[#1A1A18]"
                              }`}
                            >
                              <div className="text-xl">📺</div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold leading-tight truncate">Fit 16:9 (Blur)</div>
                                <div className="text-[10px] text-[#9A9A94] leading-tight">Full Frame Canvas</div>
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* 1. Caption Style Picker */}
                        <div className="mb-6">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <label className="micro-label text-[#9A9A94]">
                              SELECT CAPTION STYLE TEMPLATE
                            </label>
                            <button
                              type="button"
                              onClick={() => setIsGalleryOpen(true)}
                              className="px-3 py-1 rounded-full text-xs font-bold text-[#9DFF4A] border border-[#9DFF4A]/40 bg-[#9DFF4A]/10 hover:bg-[#9DFF4A]/20 transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(157,255,74,0.15)]"
                            >
                              <span>⚡ Browse All 65+ WhiteStair Templates</span>
                              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#9DFF4A] text-black font-mono font-bold">
                                {availableTemplates.length || 90}
                              </span>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                            {Object.entries(CAPTION_STYLES).slice(0, 12).map(([key, st]) => {
                              const isSelected = selectedStyle === key
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => {
                                    setSelectedStyle(key)
                                    if (st.highlightColor) setActiveColor(st.highlightColor)
                                    if (st.primaryColor) setSecondaryColor(st.primaryColor)
                                  }}
                                  className={`p-3 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? "border-[#9DFF4A] bg-[#121210] shadow-[0_0_16px_rgba(157,255,74,0.15)] ring-1 ring-[#9DFF4A]"
                                      : "border-[#1C1C1A] bg-[#0C0C0B] hover:border-[#2F2F2B]"
                                  }`}
                                >
                                  <div className="font-['Bricolage_Grotesque'] font-bold text-[13px] text-[#EDEDE8] truncate">
                                    {st.name}
                                  </div>
                                  <div className="text-[11px] text-[#8A8A84] mt-0.5 truncate">
                                    {key === "shortai" ? "Editorial Acid Green Pop" : st.animation}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          {/* Active template chip if selected from the 65+ gallery modal */}
                          {(!CAPTION_STYLES[selectedStyle] || Object.keys(CAPTION_STYLES).indexOf(selectedStyle) >= 12) && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-[#121210] border border-[#9DFF4A]/40 flex items-center justify-between text-xs">
                              <span className="text-[#EDEDE8] font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#9DFF4A] animate-pulse"></span>
                                Active WhiteStair Template: <span className="text-[#9DFF4A] font-mono">{availableTemplates.find(t => t.id === selectedStyle)?.name || selectedStyle}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsGalleryOpen(true)}
                                className="text-[11px] text-[#9DFF4A] hover:underline font-bold"
                              >
                                Change Template
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 2. Custom Colors (Active Word & Secondary Text) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-2xl bg-[#121210] border border-[#1C1C1A] mb-4">
                          {/* Active Highlight Color */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[12px] font-['Geist_Mono'] font-medium text-[#EDEDE8]">
                                ACTIVE WORD COLOR
                              </label>
                              <span className="text-[11px] font-mono text-[#9DFF4A]">{activeColor}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {["#9DFF4A", "#FFE600", "#00E676", "#37B6FF", "#FF3B30", "#FF6B35"].map(hex => (
                                <button
                                  key={hex}
                                  type="button"
                                  onClick={() => setActiveColor(hex)}
                                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                                    activeColor.toLowerCase() === hex.toLowerCase()
                                      ? "scale-110 border-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                      : "border-transparent hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: hex }}
                                  title={hex}
                                />
                              ))}
                              <div className="relative ml-auto">
                                <input
                                  type="color"
                                  value={activeColor}
                                  onChange={e => setActiveColor(e.target.value)}
                                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Base / Secondary Text Color */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[12px] font-['Geist_Mono'] font-medium text-[#EDEDE8]">
                                SECONDARY TEXT COLOR
                              </label>
                              <span className="text-[11px] font-mono text-[#EDEDE8]">{secondaryColor}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {["#EDEDE8", "#FFFFFF", "#FDE047", "#7DF9FF", "#FF7AD9", "#111111"].map(hex => (
                                <button
                                  key={hex}
                                  type="button"
                                  onClick={() => setSecondaryColor(hex)}
                                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                                    secondaryColor.toLowerCase() === hex.toLowerCase()
                                      ? "scale-110 border-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                      : "border-transparent hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: hex }}
                                  title={hex}
                                />
                              ))}
                              <div className="relative ml-auto">
                                <input
                                  type="color"
                                  value={secondaryColor}
                                  onChange={e => setSecondaryColor(e.target.value)}
                                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3. Caption Font Size Control */}
                        <div className="p-4 rounded-2xl bg-[#121210] border border-[#1C1C1A] mb-6">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <label className="text-[12px] font-['Geist_Mono'] font-medium text-[#EDEDE8]">
                                CAPTION FONT SIZE
                              </label>
                              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#1C1C1A] text-[#9A9A94]">
                                Scalable
                              </span>
                            </div>
                            <span className="text-[13px] font-mono font-bold text-[#9DFF4A]">{captionFontSize}px</span>
                          </div>

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                            {/* Quick Presets */}
                            <div className="flex items-center gap-1.5 bg-[#0C0C0B] p-1 rounded-xl border border-[#1C1C1A]">
                              {[
                                { label: "S", size: 72, name: "Small" },
                                { label: "M", size: 96, name: "Medium (Default)" },
                                { label: "L", size: 120, name: "Large" },
                                { label: "XL", size: 140, name: "Extra Large" },
                              ].map(preset => (
                                <button
                                  key={preset.size}
                                  type="button"
                                  onClick={() => setCaptionFontSize(preset.size)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    captionFontSize === preset.size
                                      ? "bg-[#9DFF4A] text-black shadow-[0_0_10px_rgba(157,255,74,0.3)]"
                                      : "text-[#9A9A94] hover:text-white hover:bg-[#1A1A18]"
                                  }`}
                                  title={`${preset.name} (${preset.size}px)`}
                                >
                                  {preset.label} <span className="text-[10px] font-normal opacity-70">({preset.size})</span>
                                </button>
                              ))}
                            </div>

                            {/* Interactive Slider & Step Buttons */}
                            <div className="flex-1 flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => setCaptionFontSize(prev => Math.max(60, prev - 4))}
                                className="w-8 h-8 rounded-lg bg-[#0C0C0B] border border-[#1C1C1A] text-[#EDEDE8] hover:border-[#9DFF4A] font-bold text-sm flex items-center justify-center transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="range"
                                min="60"
                                max="150"
                                step="4"
                                value={captionFontSize}
                                onChange={e => setCaptionFontSize(Number(e.target.value))}
                                className="flex-1 h-1.5 bg-[#1C1C1A] rounded-lg appearance-none cursor-pointer accent-[#9DFF4A]"
                              />
                              <button
                                type="button"
                                onClick={() => setCaptionFontSize(prev => Math.min(150, prev + 4))}
                                className="w-8 h-8 rounded-lg bg-[#0C0C0B] border border-[#1C1C1A] text-[#EDEDE8] hover:border-[#9DFF4A] font-bold text-sm flex items-center justify-center transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Live Caption Visual Preview Badge */}
                        <div className="mb-6 p-4 rounded-xl bg-[#060606] border border-[#1C1C1A] flex items-center justify-center min-h-[64px]">
                          {(() => {
                            const pw = (activeClip.captionSegments && activeClip.captionSegments.length > 0)
                              ? activeClip.captionSegments.slice(0, 3).map(s => s.word)
                              : (activeClip.title ? activeClip.title.replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean).slice(0, 3) : ["VIRAL", "MOMENTS", "CAPTURED"])
                            const pw1 = pw[0] || "VIRAL"
                            const pw2 = pw[1] || "MOMENTS"
                            const pw3 = pw.slice(2).join(" ") || "CAPTURED"

                            if (selectedStyle === "discipline") {
                              return (
                                <div className="caption-discipline text-center select-none py-1">
                                  <span className="text-white text-[18px] mr-2 font-extrabold tracking-tight">{pw1.toLowerCase()}</span>
                                  <span className="caption-discipline-accent text-[26px]">{`${pw2} ${pw3}`.trim().toLowerCase()}.</span>
                                </div>
                              )
                            }
                            if (selectedStyle === "crazy") {
                              return (
                                <div className="caption-crazy text-center select-none py-1">
                                  <span className="text-white text-[14px] mr-2">{pw1.toUpperCase()}</span>
                                  <span className="caption-crazy-hero text-[24px] mx-1">{pw2.toUpperCase()}</span>
                                  <span className="text-white text-[14px] ml-2">{pw3.toUpperCase()}</span>
                                </div>
                              )
                            }
                            if (selectedStyle === "estate4") {
                              return (
                                <div className="caption-estate4 text-center select-none py-1">
                                  <span className="text-white/90 text-[14px] mr-2">{`${pw1} ${pw2}`.trim()}</span>
                                  <span className="caption-estate4-hero text-[24px] ml-1">{pw3.toUpperCase()}</span>
                                </div>
                              )
                            }
                            return (
                              <div className="text-center select-none font-['Bricolage_Grotesque'] font-extrabold text-[18px] md:text-[22px] tracking-tight">
                                <span style={{ color: secondaryColor }} className="mr-2">{pw1}</span>
                                <span
                                  style={{ color: activeColor, textShadow: `0 0 16px ${activeColor}60` }}
                                  className="mr-2 inline-block transform scale-105"
                                >
                                  {pw2}
                                </span>
                                <span style={{ color: secondaryColor }}>{pw3}</span>
                              </div>
                            )
                          })()}
                        </div>
                      </div>

                      {/* Action Buttons: Apply, Trim, Download */}
                      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#1C1C1A]">
                        <button
                          type="button"
                          onClick={() => handleApplyCaptionStyle(selectedStyle)}
                          disabled={isBurningCaption}
                          className="btn-primary text-[14px] px-6 h-[46px]"
                        >
                          {isBurningCaption ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Applying Style & Position…
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              Apply Style & Position
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setTrimModalClip(activeClip)}
                          className="btn-ghost text-[14px] px-5 h-[46px]"
                        >
                          <Scissors size={15} />
                          Trim / Extend
                        </button>

                        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
                          {/* Option to download clean clip without captions */}
                          <a
                            href={`${API_ROOT}/api/download/${activeClip.id}`}
                            download={`ShortAI_${activeClip.id}_clean_1080p.mp4`}
                            className="px-4 h-[46px] rounded-full border border-[#2F2F2B] bg-[#121210] hover:bg-[#1A1A18] hover:border-[#EDEDE8]/40 text-[#EDEDE8] text-[13px] font-bold flex items-center gap-2 transition-all shadow-sm"
                            title="Download raw vertical 1080p clip without any captions"
                          >
                            <Download size={15} className="text-[#9A9A94]" />
                            <span>Download Without Captions</span>
                          </a>

                          {/* Download burned video with animated captions */}
                          <a
                            href={`${API_ROOT}/api/download/${activeClip.id}_captioned?style=${selectedStyle}&highlightColor=${encodeURIComponent(activeColor)}&textColor=${encodeURIComponent(secondaryColor)}&fontSize=${captionFontSize}&positionX=${captionPosX}&positionY=${captionPosY}`}
                            download={`ShortAI_${activeClip.id}_captioned_1080p.mp4`}
                            className="btn-primary text-[14px] px-6 h-[46px] bg-[#9DFF4A] text-[#060606] shadow-[0_0_20px_rgba(157,255,74,0.25)] flex items-center gap-2"
                            title="Download 1080p MP4 with burned animated captions"
                          >
                            <Download size={16} />
                            <span>Download 1080p (Captions)</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 4 STAGGERED TILTED PHONE CARDS (SPEC DEMO) */
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 pt-4 pb-2">
              {/* Card 1 */}
              <div className="phone-card p-4 md:p-5 h-[280px] md:h-[330px] flex flex-col justify-between float-card-1 select-none">
                <div className="flex items-center justify-between">
                  <span className="bg-[#9DFF4A] text-[#060606] font-['Geist_Mono'] font-bold text-[11px] px-2.5 py-0.5 rounded-full">
                    98
                  </span>
                  <span className="font-['Geist_Mono'] text-[10px] text-[#8A8A84]">0:28</span>
                </div>

                {/* Subject circular placeholder */}
                <div className="my-auto flex items-center justify-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#182310] border border-[#2E421E]/60 flex items-center justify-center shadow-[inset_0_0_16px_rgba(0,0,0,0.6)]">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#9DFF4A]/10 border border-[#9DFF4A]/30" />
                  </div>
                </div>

                {/* Animated word-by-word green caption */}
                <div>
                  <div className="font-['Bricolage_Grotesque'] font-extrabold text-[13px] md:text-[15px] leading-tight text-center tracking-tight text-[#EDEDE8]">
                    <span className="caption-word-1 inline-block mr-1">THIS</span>
                    <span className="caption-word-2 inline-block mr-1">CHANGES</span>
                    <span className="caption-word-3 inline-block">EVERYTHING</span>
                  </div>
                  <div className="w-full h-[3px] bg-[#1E1E1C] rounded-full overflow-hidden mt-3 md:mt-4">
                    <div className="h-full bg-[#9DFF4A] phone-progress" />
                  </div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="phone-card p-4 md:p-5 h-[280px] md:h-[330px] flex flex-col justify-between float-card-2 select-none">
                <div className="flex items-center justify-between">
                  <span className="bg-[#9DFF4A] text-[#060606] font-['Geist_Mono'] font-bold text-[11px] px-2.5 py-0.5 rounded-full">
                    95
                  </span>
                  <span className="font-['Geist_Mono'] text-[10px] text-[#8A8A84]">0:42</span>
                </div>

                <div className="my-auto flex items-center justify-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#182310] border border-[#2E421E]/60 flex items-center justify-center shadow-[inset_0_0_16px_rgba(0,0,0,0.6)]">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#9DFF4A]/10 border border-[#9DFF4A]/30" />
                  </div>
                </div>

                <div>
                  <div className="font-['Bricolage_Grotesque'] font-extrabold text-[13px] md:text-[15px] leading-tight text-center tracking-tight text-[#EDEDE8]">
                    <span className="caption-word-1 inline-block mr-1">NOBODY</span>
                    <span className="caption-word-2 inline-block mr-1">TELLS</span>
                    <span className="caption-word-3 inline-block">YOU</span>
                  </div>
                  <div className="w-full h-[3px] bg-[#1E1E1C] rounded-full overflow-hidden mt-3 md:mt-4">
                    <div className="h-full bg-[#9DFF4A] phone-progress" />
                  </div>
                </div>
              </div>

              {/* Card 3 */}
              <div className="phone-card p-4 md:p-5 h-[280px] md:h-[330px] flex flex-col justify-between float-card-3 select-none">
                <div className="flex items-center justify-between">
                  <span className="bg-[#9DFF4A] text-[#060606] font-['Geist_Mono'] font-bold text-[11px] px-2.5 py-0.5 rounded-full">
                    92
                  </span>
                  <span className="font-['Geist_Mono'] text-[10px] text-[#8A8A84]">0:34</span>
                </div>

                <div className="my-auto flex items-center justify-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#182310] border border-[#2E421E]/60 flex items-center justify-center shadow-[inset_0_0_16px_rgba(0,0,0,0.6)]">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#9DFF4A]/10 border border-[#9DFF4A]/30" />
                  </div>
                </div>

                <div>
                  <div className="font-['Bricolage_Grotesque'] font-extrabold text-[13px] md:text-[15px] leading-tight text-center tracking-tight text-[#EDEDE8]">
                    <span className="caption-word-1 inline-block mr-1">WAIT</span>
                    <span className="caption-word-2 inline-block mr-1">FOR</span>
                    <span className="caption-word-3 inline-block">IT</span>
                  </div>
                  <div className="w-full h-[3px] bg-[#1E1E1C] rounded-full overflow-hidden mt-3 md:mt-4">
                    <div className="h-full bg-[#9DFF4A] phone-progress" />
                  </div>
                </div>
              </div>

              {/* Card 4 */}
              <div className="phone-card p-4 md:p-5 h-[280px] md:h-[330px] flex flex-col justify-between float-card-4 select-none">
                <div className="flex items-center justify-between">
                  <span className="bg-[#9DFF4A] text-[#060606] font-['Geist_Mono'] font-bold text-[11px] px-2.5 py-0.5 rounded-full">
                    89
                  </span>
                  <span className="font-['Geist_Mono'] text-[10px] text-[#8A8A84]">0:50</span>
                </div>

                <div className="my-auto flex items-center justify-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#182310] border border-[#2E421E]/60 flex items-center justify-center shadow-[inset_0_0_16px_rgba(0,0,0,0.6)]">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#9DFF4A]/10 border border-[#9DFF4A]/30" />
                  </div>
                </div>

                <div>
                  <div className="font-['Bricolage_Grotesque'] font-extrabold text-[13px] md:text-[15px] leading-tight text-center tracking-tight text-[#EDEDE8]">
                    <span className="caption-word-1 inline-block mr-1">HERE'S</span>
                    <span className="caption-word-2 inline-block mr-1">THE</span>
                    <span className="caption-word-3 inline-block">CATCH</span>
                  </div>
                  <div className="w-full h-[3px] bg-[#1E1E1C] rounded-full overflow-hidden mt-3 md:mt-4">
                    <div className="h-full bg-[#9DFF4A] phone-progress" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footnote */}
          <p className="text-center font-['Geist_Mono'] text-[12px] text-[#8A8A84] mt-8 select-none">
            Sample interface. Scores are illustrative.
          </p>
        </div>
      </section>

      {/* ── 4. MARQUEE STRIP ── */}
      <section className="py-12 border-y border-[#1C1C1A] overflow-hidden select-none relative bg-[#060606]">
        <div className="marquee-inner">
          <span className="marquee-word-green">Shorts</span>
          <span className="marquee-word-stroke">Reels</span>
          <span className="marquee-word-green">TikTok</span>
          <span className="marquee-word-stroke">9:16</span>
          <span className="marquee-word-green">Shorts</span>
          <span className="marquee-word-stroke">Reels</span>
          <span className="marquee-word-green">TikTok</span>
          <span className="marquee-word-stroke">9:16</span>
          {/* Duplicated for seamless -50% loop */}
          <span className="marquee-word-green">Shorts</span>
          <span className="marquee-word-stroke">Reels</span>
          <span className="marquee-word-green">TikTok</span>
          <span className="marquee-word-stroke">9:16</span>
          <span className="marquee-word-green">Shorts</span>
          <span className="marquee-word-stroke">Reels</span>
          <span className="marquee-word-green">TikTok</span>
          <span className="marquee-word-stroke">9:16</span>
        </div>
      </section>

      {/* ── 5. BENTO FEATURES GRID ── */}
      <section id="features" className="max-w-[1240px] mx-auto px-6 py-28">
        <div className="mb-14">
          <span className="micro-label font-['Geist_Mono'] text-[#9A9A94] tracking-[0.14em]">
            FEATURES
          </span>
          <h2 className="display-title text-[#EDEDE8] text-[38px] md:text-[56px] mt-2">
            Cut like an editor.{" "}
            <span className="accent-phrase">Think like a hit.</span>
          </h2>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Row 1, Card 1: Wide Card (Virality Score with Animated Ring 98) */}
          <div className="bento-card md:col-span-2 min-h-[320px] flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">
                VIRALITY SCORE
              </span>
              <h3 className="font-['Bricolage_Grotesque'] font-extrabold text-[32px] md:text-[38px] text-[#EDEDE8] mt-2 tracking-tight">
                Every clip, ranked.
              </h3>
              <p className="body-text text-[#9A9A94] text-[16px] max-w-[440px] mt-2">
                Our AI analyzes hook strength, retention curves, and narrative resolution to rank clips from 1 to 100.
              </p>
            </div>

            {/* Visual: Animated SVG Score Ring 98 */}
            <div className="flex items-center justify-end mt-6">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    className="stroke-[#1C1C1A] stroke-[7] fill-none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    className="stroke-[#9DFF4A] stroke-[7] fill-none score-ring-circle"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-['Bricolage_Grotesque'] font-extrabold text-[42px] leading-none text-[#EDEDE8]">
                    98
                  </span>
                  <span className="font-['Geist_Mono'] text-[10px] text-[#9DFF4A] uppercase tracking-wider font-semibold mt-0.5">
                    Viral
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 1, Card 2: Narrow Card (Face Tracking with Drifting Bounding Box) */}
          <div className="bento-card min-h-[320px] flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">
                FACE TRACKING
              </span>
              <h3 className="font-['Bricolage_Grotesque'] font-extrabold text-[28px] md:text-[32px] text-[#EDEDE8] mt-2 tracking-tight">
                Speaker stays framed.
              </h3>
              <p className="body-text text-[#9A9A94] text-[15px] mt-2">
                Dynamic pan-and-scan centers the active speaker automatically.
              </p>
            </div>

            {/* Visual: Drifting Face Tracking Box */}
            <div className="relative h-36 flex items-center justify-center overflow-hidden rounded-xl bg-[#080807] border border-[#1C1C1A] mt-4">
              <div className="face-tracking-box w-24 h-24 border-2 border-[#9DFF4A] rounded-lg relative flex flex-col justify-between p-1.5 shadow-[0_0_20px_rgba(157,255,74,0.25)]">
                {/* Corner Crosshairs */}
                <span className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-[#9DFF4A]" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-[#9DFF4A]" />
                <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-[#9DFF4A]" />
                <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-[#9DFF4A]" />

                <span className="font-['Geist_Mono'] text-[9px] bg-[#9DFF4A] text-[#060606] font-bold px-1 rounded self-start">
                  SPEAKER 01
                </span>
                <span className="font-['Geist_Mono'] text-[8px] text-[#9DFF4A] self-end">
                  99.4%
                </span>
              </div>
            </div>
          </div>

          {/* Row 2, Card 1: Captions (Phone Peeking from bottom) */}
          <div className="bento-card min-h-[300px] flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">
                CAPTIONS
              </span>
              <h3 className="font-['Bricolage_Grotesque'] font-extrabold text-[26px] md:text-[28px] text-[#EDEDE8] mt-2 tracking-tight">
                Styles that stop the scroll.
              </h3>
            </div>

            {/* Visual: Phone peeking from bottom */}
            <div className="relative h-28 overflow-hidden flex items-end justify-center mt-4">
              <div className="w-48 h-32 bg-[#121B0D] border-t-2 border-x-2 border-[#2A3F1E] rounded-t-2xl p-3 shadow-2xl flex flex-col justify-start">
                <span className="w-10 h-1 bg-[#2A3F1E] rounded-full mx-auto mb-3" />
                <p className="font-['Bricolage_Grotesque'] font-extrabold text-[12px] text-center text-[#EDEDE8]">
                  WATCH <span className="text-[#9DFF4A] underline decoration-2">THIS</span> NOW
                </p>
              </div>
            </div>
          </div>

          {/* Row 2, Card 2: Hook First */}
          <div className="bento-card min-h-[300px] flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">
                HOOK FIRST
              </span>
              <h3 className="font-['Bricolage_Grotesque'] font-extrabold text-[26px] md:text-[28px] text-[#EDEDE8] mt-2 tracking-tight">
                Starts where it hits.
              </h3>
              <p className="body-text text-[#9A9A94] text-[15px] mt-2">
                No awkward intro, dead air, or rambling. Cuts straight to the viral payoff.
              </p>
            </div>

            <div className="py-3 px-4 rounded-xl bg-[#121210] border border-[#1C1C1A] mt-6 flex items-center justify-between">
              <span className="font-['Geist_Mono'] text-[12px] text-[#9A9A94]">Intro trimmed</span>
              <span className="font-['Geist_Mono'] text-[12px] text-[#9DFF4A] font-semibold">-42.5s</span>
            </div>
          </div>

          {/* Row 2, Card 3: Export */}
          <div className="bento-card min-h-[300px] flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">
                EXPORT
              </span>
              <h3 className="font-['Bricolage_Grotesque'] font-extrabold text-[26px] md:text-[28px] text-[#EDEDE8] mt-2 tracking-tight">
                One click. Full HD.
              </h3>
              <p className="body-text text-[#9A9A94] text-[15px] mt-2">
                Crisp 1080p MP4 exports with embedded captions and custom aspect ratios.
              </p>
            </div>

            <div className="flex items-center gap-2 mt-6">
              <span className="px-3 py-1 rounded-full bg-[#182310] border border-[#2A3E1B] text-[#9DFF4A] font-['Geist_Mono'] text-[11px] font-semibold">
                1080 × 1920
              </span>
              <span className="px-3 py-1 rounded-full bg-[#121210] border border-[#1C1C1A] text-[#EDEDE8] font-['Geist_Mono'] text-[11px]">
                60 FPS
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. PROCESS SECTION ── */}
      <section id="process" className="max-w-[1240px] mx-auto px-6 py-28 border-t border-[#1C1C1A]">
        <div className="mb-16">
          <span className="micro-label font-['Geist_Mono'] text-[#9A9A94] tracking-[0.14em]">
            PROCESS
          </span>
          <h2 className="display-title text-[#EDEDE8] text-[38px] md:text-[56px] mt-2">
            Link to clips{" "}
            <span className="accent-phrase">in minutes.</span>
          </h2>
        </div>

        {/* 3 Process Rows with hover animation */}
        <div className="flex flex-col">
          {/* Row 01 */}
          <div
            onClick={focusInput}
            className="process-row group"
          >
            <span className="process-numeral">01</span>
            <div>
              <h3 className="font-['Bricolage_Grotesque'] font-bold text-[32px] md:text-[36px] text-[#EDEDE8] group-hover:text-white transition-colors">
                Paste
              </h3>
              <p className="body-text text-[#9A9A94] text-[16px] md:text-[18px] mt-1">
                Drop in any YouTube link.
              </p>
            </div>
          </div>

          {/* Row 02 */}
          <div
            onClick={focusInput}
            className="process-row group"
          >
            <span className="process-numeral">02</span>
            <div>
              <h3 className="font-['Bricolage_Grotesque'] font-bold text-[32px] md:text-[36px] text-[#EDEDE8] group-hover:text-white transition-colors">
                Analyze
              </h3>
              <p className="body-text text-[#9A9A94] text-[16px] md:text-[18px] mt-1">
                AI scans audio, speech and faces to find peak moments.
              </p>
            </div>
          </div>

          {/* Row 03 */}
          <div
            onClick={focusInput}
            className="process-row group border-b border-[#1C1C1A]"
          >
            <span className="process-numeral">03</span>
            <div>
              <h3 className="font-['Bricolage_Grotesque'] font-bold text-[32px] md:text-[36px] text-[#EDEDE8] group-hover:text-white transition-colors">
                Post
              </h3>
              <p className="body-text text-[#9A9A94] text-[16px] md:text-[18px] mt-1">
                Pick a caption style, trim, download.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. PRICING SECTION ── */}
      <section id="pricing" className="max-w-[1240px] mx-auto px-6 py-28 border-t border-[#1C1C1A]">
        <div className="mb-16 text-center">
          <span className="micro-label font-['Geist_Mono'] text-[#9A9A94] tracking-[0.14em]">
            PRICING
          </span>
          <h2 className="display-title text-[#EDEDE8] text-[38px] md:text-[56px] mt-2">
            Start free.{" "}
            <span className="accent-phrase">Scale later.</span>
          </h2>
        </div>

        {/* 3 Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Card 1: Free */}
          <div className="bento-card p-8 flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">FREE</span>
              <div className="mt-4 mb-6">
                <span className="font-['Bricolage_Grotesque'] font-extrabold text-[36px] text-[#EDEDE8]">
                  [YOUR PRICE]
                </span>
                <span className="text-[#9A9A94] text-[14px] ml-2 font-['Geist']">/ month</span>
              </div>
              <ul className="space-y-3 text-[15px] text-[#9A9A94] mb-8">
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> 60 upload mins / mo
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> Auto hook detection
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> 720p exports
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> Standard caption styles
                </li>
              </ul>
            </div>
            <button onClick={focusInput} className="btn-ghost w-full justify-center">
              Start free
            </button>
          </div>

          {/* Card 2: Creator (Highlighted with 1px green border & glow) */}
          <div
            className="bento-card p-8 flex flex-col justify-between relative"
            style={{
              borderColor: "var(--green)",
              boxShadow: "0 0 36px -8px var(--green-glow)",
            }}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="micro-label font-['Geist_Mono'] text-[#9DFF4A]">CREATOR</span>
                <span className="font-['Geist_Mono'] text-[10px] bg-[#9DFF4A] text-[#060606] font-bold px-2 py-0.5 rounded-full uppercase">
                  Popular
                </span>
              </div>
              <div className="mt-4 mb-6">
                <span className="font-['Bricolage_Grotesque'] font-extrabold text-[36px] text-[#EDEDE8]">
                  [YOUR PRICE]
                </span>
                <span className="text-[#9A9A94] text-[14px] ml-2 font-['Geist']">/ month</span>
              </div>
              <ul className="space-y-3 text-[15px] text-[#EDEDE8] mb-8">
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> 300 upload mins / mo
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> 1080p Full HD exports
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> All 33 animated styles
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> AI viral scoring (1-100)
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> Priority render queue
                </li>
              </ul>
            </div>
            <button onClick={focusInput} className="btn-primary w-full justify-center">
              Get Creator
            </button>
          </div>

          {/* Card 3: Studio */}
          <div className="bento-card p-8 flex flex-col justify-between">
            <div>
              <span className="micro-label font-['Geist_Mono'] text-[#9A9A94]">STUDIO</span>
              <div className="mt-4 mb-6">
                <span className="font-['Bricolage_Grotesque'] font-extrabold text-[36px] text-[#EDEDE8]">
                  [YOUR PRICE]
                </span>
                <span className="text-[#9A9A94] text-[14px] ml-2 font-['Geist']">/ month</span>
              </div>
              <ul className="space-y-3 text-[15px] text-[#9A9A94] mb-8">
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> Unlimited upload mins
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> 4K / 1080p exports
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> Custom fonts & templates
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> Multi-speaker auto tracking
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-[#9DFF4A]">✓</span> API access & dedicated GPU
                </li>
              </ul>
            </div>
            <button onClick={focusInput} className="btn-ghost w-full justify-center">
              Get Studio
            </button>
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA ── */}
      <section className="max-w-[1240px] mx-auto px-6 py-36 text-center border-t border-[#1C1C1A]">
        <h2 className="hero-title text-[#EDEDE8] mb-10 select-none">
          Drop a link.
          <br />
          <span className="accent-phrase">Go viral.</span>
        </h2>
        <button
          onClick={focusInput}
          className="btn-primary text-[16px] px-8 h-[56px] text-[16px]"
        >
          Generate clips free
        </button>
      </section>

      {/* ── 9. FOOTER ── */}
      <footer className="border-t border-[#1C1C1A] py-12 px-6 max-w-[1240px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="font-['Bricolage_Grotesque'] font-extrabold text-[20px] text-[#EDEDE8]">
            Short
          </span>
          <span className="font-['Instrument_Serif'] italic font-normal text-[23px] text-[#9DFF4A] -ml-2">
            ai
          </span>
          <span className="text-[13px] text-[#8A8A84] font-['Geist_Mono'] ml-3">
            © 2026 ShortAI. All rights reserved.
          </span>
        </div>

        <div className="flex items-center gap-6 text-[13px] text-[#8A8A84] font-['Geist']">
          <a href="#privacy" className="hover:text-[#EDEDE8] transition-colors">
            Privacy
          </a>
          <a href="#terms" className="hover:text-[#EDEDE8] transition-colors">
            Terms
          </a>
          <a href="https://twitter.com" target="_blank" rel="noreferrer" className="hover:text-[#EDEDE8] transition-colors">
            Twitter
          </a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[#EDEDE8] transition-colors">
            GitHub
          </a>
        </div>
      </footer>

      {/* ── EXTEND / TRIM MODAL ── */}
      {trimModalClip && (
        <ExtendCutModal
          clip={trimModalClip}
          videoUrl={sessionId ? `${API_ROOT}/api/preview-original/${sessionId}` : getFullUrl(trimModalClip.videoUrl)}
          originalVideoUrl={videoInfo?.url || url}
          totalDuration={videoInfo?.duration || trimModalClip?.maxEndTime || 5239}
          formatDuration={(s) => {
            const m = Math.floor(s / 60)
            const sec = Math.floor(s % 60).toString().padStart(2, "0")
            return `${m}:${sec}`
          }}
          onClose={() => setTrimModalClip(null)}
          onSave={handleExtendSave}
        />
      )}

      {/* ── 9:16 VERTICAL REEL FULLSCREEN MODAL ── */}
      {isReelFullscreen && (
        <div
          className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsReelFullscreen(false)
          }}
        >
          <button
            onClick={() => setIsReelFullscreen(false)}
            className="absolute top-5 right-5 z-50 w-11 h-11 rounded-full bg-[#121210] border border-[#2F2F2B] text-white hover:text-[#9DFF4A] hover:border-[#9DFF4A] transition-colors flex items-center justify-center cursor-pointer shadow-xl"
            title="Close Fullscreen (Esc)"
          >
            <X size={20} />
          </button>

          <div className="relative w-full max-w-[420px] aspect-[9/16] max-h-[96vh] rounded-[28px] overflow-hidden bg-black border border-[#2F2F2B] shadow-2xl flex flex-col justify-between">
            <video
              key={captionedVideoUrl || activeClip?.videoUrl}
              src={captionedVideoUrl || getFullUrl(activeClip?.videoUrl)}
              poster={activeClip?.thumbnail ? getFullUrl(activeClip.thumbnail) : undefined}
              preload="auto"
              playsInline
              crossOrigin="anonymous"
              controls
              autoPlay
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* ── WHITESTAIR 65+ TEMPLATE GALLERY MODAL ── */}
      {isGalleryOpen && (() => {
        const templateList = availableTemplates.length > 0 ? availableTemplates : Object.values(CAPTION_STYLES)
        const q = gallerySearch.toLowerCase().trim()
        const filtered = templateList.filter(t => {
          const matchSearch = !q || (
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.id && t.id.toLowerCase().includes(q)) ||
            (t.fontFamily && t.fontFamily.toLowerCase().includes(q)) ||
            (t.description && t.description.toLowerCase().includes(q)) ||
            (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q)))
          )
          if (!matchSearch) return false

          if (galleryFilter === "all") return true
          if (galleryFilter === "featured") return ["shortai", "crazy", "discipline", "estate-3", "mrbeast-classic", "impact-glow", "vogue", "spark", "red-wipe", "creator-3", "glowly-1", "cyber"].includes(t.id) || (t.tags && t.tags.includes("Featured"))
          if (galleryFilter === "dynamic") return (t.tags && (t.tags.includes("Dynamic") || t.tags.includes("Three-word"))) || ["appear-zoom", "slam", "bounce-drop", "pop-in"].includes(t.entrance)
          if (galleryFilter === "3d") return t.id.includes("crazy") || t.id.includes("estate") || (t.tags && (t.tags.includes("Crazy") || t.tags.includes("Blend")))
          if (galleryFilter === "clean") return t.id.includes("clean") || t.id.includes("solo") || t.id.includes("editor") || (t.tags && t.tags.includes("Clean"))
          if (galleryFilter === "bold") return ["Archivo Black", "Bebas Neue", "Anton", "Montserrat", "Oswald"].includes(t.fontFamily)
          if (galleryFilter === "editorial") return t.id === "shortai" || t.id === "discipline" || (t.lineFontFamilies && t.lineFontFamilies.length > 0) || (t.tags && t.tags.includes("Editorial"))
          if (galleryFilter === "karaoke") return t.karaoke || (t.tags && t.tags.includes("Karaoke"))
          return true
        })

        return (
          <div
            className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsGalleryOpen(false)
            }}
          >
            <div className="bg-[#0C0C0B] border border-[#232321] rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-[#1C1C1A] flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold font-['Bricolage_Grotesque'] text-[#EDEDE8]">
                      WhiteStair Caption Template Library
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#9DFF4A]/15 text-[#9DFF4A] border border-[#9DFF4A]/30">
                      {filtered.length} of {templateList.length} Templates
                    </span>
                  </div>
                  <p className="text-xs text-[#8A8A84] mt-1 font-sans">
                    Every authentic template from WhiteStair with precision typography, multi-line stacking, and per-word entrance motion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGalleryOpen(false)}
                  className="w-10 h-10 rounded-full bg-[#161614] hover:bg-[#232320] text-[#9A9A94] hover:text-white flex items-center justify-center transition-colors text-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search & Category Pills */}
              <div className="p-4 sm:px-6 bg-[#080807] border-b border-[#1C1C1A] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search templates (e.g. Crazy, Discipline, MrBeast, Impact, Red Wipe, Estate...)"
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    className="w-full bg-[#121210] border border-[#1F1F1D] rounded-xl px-3.5 py-2 text-sm text-[#EDEDE8] placeholder-[#5A5A55] focus:outline-none focus:border-[#9DFF4A]"
                  />
                  {gallerySearch && (
                    <button
                      type="button"
                      onClick={() => setGallerySearch("")}
                      className="absolute right-3 top-2.5 text-xs text-[#8A8A84] hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  {[
                    { id: "all", label: "All Templates" },
                    { id: "featured", label: "Featured" },
                    { id: "dynamic", label: "Dynamic & Motion" },
                    { id: "clean", label: "Clean & Minimal" },
                    { id: "3d", label: "3D & Metallic" },
                    { id: "bold", label: "Bold & Punch" },
                    { id: "editorial", label: "Editorial & Cursive" },
                    { id: "karaoke", label: "Karaoke" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setGalleryFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                        galleryFilter === cat.id
                          ? "bg-[#9DFF4A] text-black font-bold shadow-[0_0_12px_rgba(157,255,74,0.3)]"
                          : "bg-[#141412] text-[#8A8A84] hover:text-white hover:bg-[#1C1C1A]"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Cards Grid */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {filtered.map((t) => {
                  const isCurrent = selectedStyle === t.id
                  const font = t.fontFamily || "Montserrat"
                  const cardColor = t.accent || t.color || "#9DFF4A"
                  const baseColor = t.color || "#EDEDE8"

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedStyle(t.id)
                        if (t.accent) setActiveColor(t.accent)
                        if (t.color && t.color !== "#000000") setSecondaryColor(t.color)
                        setIsGalleryOpen(false)
                      }}
                      className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        isCurrent
                          ? "border-[#9DFF4A] bg-[#121210] shadow-[0_0_20px_rgba(157,255,74,0.18)] ring-1 ring-[#9DFF4A]"
                          : "border-[#1A1A18] bg-[#0E0E0D] hover:border-[#33332E] hover:bg-[#141412]"
                      }`}
                    >
                      {/* Top: Name & Badges */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="font-['Bricolage_Grotesque'] font-bold text-[15px] text-[#EDEDE8] truncate">
                            {t.name}
                          </h4>
                          {isCurrent && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#9DFF4A] text-black font-bold">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Visual Typography Mockup Box */}
                        <div className="my-2.5 p-3 rounded-xl bg-black/60 border border-[#1A1A18] min-h-[64px] flex items-center justify-center text-center">
                          {t.id === "discipline" ? (
                            <div className="caption-discipline">
                              <span className="text-white text-[13px] mr-1 font-bold">visual</span>
                              <span className="caption-discipline-accent text-[18px]">storytelling.</span>
                            </div>
                          ) : t.id.includes("crazy") ? (
                            <div className="caption-crazy">
                              <div className="text-[10px] text-white">YOUR</div>
                              <div className="caption-crazy-hero text-[15px]">CAPTIONS</div>
                              <div className="text-[10px] text-white">LOOK</div>
                            </div>
                          ) : t.id.includes("estate") ? (
                            <div className="caption-estate4">
                              <div className="text-[10px] text-white/90">trending templates</div>
                              <div className="caption-estate4-hero text-[15px]">DESIGNED FOR</div>
                            </div>
                          ) : (
                            <div className="font-bold text-[14px] tracking-tight">
                              <span style={{ color: baseColor }}>YOUR </span>
                              <span style={{ color: cardColor }} className="scale-105 inline-block">CAPTIONS</span>
                              <span style={{ color: baseColor }}> LOOK</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bottom Info: Font & Entrance */}
                      <div className="pt-2 border-t border-[#181816] flex items-center justify-between text-[11px] text-[#7A7A75] font-mono">
                        <span className="truncate max-w-[110px]" title={font}>{font}</span>
                        <span className="text-[#9DFF4A] uppercase text-[10px] truncate max-w-[90px]">
                          {t.entrance || (t.karaoke ? "karaoke" : "pop-in")}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
