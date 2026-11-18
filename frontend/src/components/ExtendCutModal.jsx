import { useState, useRef, useCallback, useEffect } from "react"
import { Scissors, X, Play, Pause } from "lucide-react"

const ExtendCutModal = ({ clip, onClose, onSave, formatDuration, videoUrl, originalVideoUrl, totalDuration }) => {
  const [startTime, setStartTime] = useState(Math.round(clip.startTime))
  const [endTime, setEndTime] = useState(Math.round(clip.endTime))
  const [dragging, setDragging] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [previewTime, setPreviewTime] = useState(Math.round(clip.startTime))
  const trackRef = useRef(null)
  const videoRef = useRef(null)

  const minStart = 0
  const maxEnd = Math.ceil(totalDuration || clip.maxEndTime || 5239)
  const totalSpan = Math.max(1, maxEnd - minStart)
  const clipDur = endTime - startTime
  const origDur = Math.round((clip.originalEnd ?? clip.endTime) - (clip.originalStart ?? clip.startTime))

  const ytId = originalVideoUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/)?.[1]

  const toPercent = (t) => Math.max(0, Math.min(100, ((t - minStart) / totalSpan) * 100))

  const seekPreview = useCallback((t) => {
    const v = videoRef.current
    if (!v) return
    const clamped = Math.max(minStart, Math.min(t, maxEnd))
    try { v.currentTime = clamped } catch {}
    setPreviewTime(clamped)
  }, [minStart, maxEnd])

  useEffect(() => { if (videoReady) seekPreview(startTime) }, [startTime, videoReady, seekPreview])

  const getTimeFromEvent = useCallback((e) => {
    const track = trackRef.current
    if (!track) return null
    const rect = track.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return minStart + pct * totalSpan
  }, [minStart, totalSpan])

  const onMove = useCallback((e) => {
    if (!dragging) return
    const t = getTimeFromEvent(e)
    if (t === null) return
    if (dragging === "start") {
      const val = Math.max(minStart, Math.min(Math.round(t), endTime - 3))
      setStartTime(val)
      seekPreview(val)
    } else {
      const val = Math.max(startTime + 3, Math.min(Math.round(t), maxEnd))
      setEndTime(val)
      seekPreview(val)
    }
  }, [dragging, getTimeFromEvent, minStart, maxEnd, startTime, endTime, seekPreview])

  const onUp = useCallback(() => setDragging(null), [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("touchmove", onMove, { passive: true })
    window.addEventListener("touchend", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onUp)
    }
  }, [dragging, onMove, onUp])

  const nudge = (handle, delta) => {
    if (handle === "start") setStartTime(t => Math.max(minStart, Math.min(t + delta, endTime - 3)))
    else setEndTime(t => Math.max(startTime + 3, Math.min(t + delta, maxEnd)))
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (!v.paused) { v.pause(); return }
    if (v.currentTime < startTime || v.currentTime >= endTime - 0.15) v.currentTime = startTime
    v.play().catch(() => {})
  }

  const handleSave = async () => {
    if (clipDur < 3) return setError("Clip must be at least 3 seconds")
    if (clipDur > 180) return setError("Clip cannot exceed 3 minutes")
    setError("")
    setSaving(true)
    try { await onSave(clip, startTime, endTime) }
    catch (e) { setError(e?.message || "Failed to create clip"); setSaving(false) }
  }

  const startPct = toPercent(startTime)
  const endPct = toPercent(endTime)
  const origStartPct = toPercent(clip.originalStart ?? clip.startTime)
  const origEndPct = toPercent(clip.originalEnd ?? clip.endTime)
  const durChange = clipDur - origDur

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[620px] max-h-[94vh] flex flex-col bg-[#0C0C0B] border border-[#2F2F2B] rounded-[28px] shadow-[0_30px_90px_rgba(0,0,0,0.9)] overflow-hidden font-['Geist'] text-[#EDEDE8]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C1C1A] flex-shrink-0 bg-[#121210]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#182310] border border-[#2E421E] flex items-center justify-center">
              <Scissors size={15} className="text-[#9DFF4A]" />
            </div>
            <div>
              <h3 className="font-['Bricolage_Grotesque'] font-bold text-[16px] text-[#EDEDE8] leading-none mb-1">
                Edit Clip Timing
              </h3>
              <p className="text-[12px] text-[#9A9A94] leading-none truncate max-w-[340px]">
                {clip.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1C1C1A] text-[#9A9A94] hover:text-[#EDEDE8] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Live video preview */}
          {videoUrl && (
            <div className="rounded-2xl overflow-hidden border border-[#1C1C1A] bg-black shadow-inner">
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#121210] border-b border-[#1C1C1A]">
                <span className="text-[11px] font-['Geist_Mono'] font-medium text-[#9A9A94] flex items-center gap-1.5 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9DFF4A] eyebrow-dot" /> Preview
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => seekPreview(startTime)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#1C1C1A] hover:bg-[#2F2F2B] text-[#EDEDE8] transition-colors"
                  >
                    Start
                  </button>
                  <button
                    onClick={togglePlay}
                    className="px-3 py-1 rounded-full text-[10px] font-bold bg-[#9DFF4A] text-[#060606] transition-transform active:scale-95 flex items-center gap-1"
                  >
                    {isPlaying ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    onClick={() => seekPreview(endTime - 1)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#1C1C1A] hover:bg-[#2F2F2B] text-[#EDEDE8] transition-colors"
                  >
                    End
                  </button>
                </div>
              </div>
              <div className="relative bg-black">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full block"
                  style={{ aspectRatio: "16/9", maxHeight: 260, objectFit: "contain", background: "#000" }}
                  playsInline preload="metadata"
                  onClick={togglePlay}
                  onLoadedMetadata={() => { setVideoReady(true); seekPreview(startTime) }}
                  onError={() => setVideoError(true)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={() => {
                    const v = videoRef.current
                    if (!v) return
                    setPreviewTime(v.currentTime)
                    if (!v.paused && v.currentTime >= endTime) { v.pause(); v.currentTime = startTime }
                  }}
                  onEnded={() => setIsPlaying(false)}
                />
                {videoError && ytId ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}?start=${Math.floor(previewTime)}&autoplay=0&controls=1`}
                    className="w-full block"
                    style={{ aspectRatio: "16/9", maxHeight: 260, border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                ) : videoError ? (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12px] text-[#9A9A94] bg-black">
                    Preview unavailable — source video expired. You can still adjust timing and export.
                  </div>
                ) : !videoReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[#9A9A94] bg-black">
                    Loading preview…
                  </div>
                )}
                {videoReady && !videoError && !isPlaying && (
                  <button
                    onClick={togglePlay}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 backdrop-blur border border-[#9DFF4A]/40 flex items-center justify-center text-[#9DFF4A] hover:scale-110 transition-transform"
                    aria-label="Play selection"
                  >
                    <Play size={16} fill="currentColor" className="ml-0.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-[#121210]">
                <span className="font-['Geist_Mono'] text-[10px] text-[#EDEDE8] tabular-nums">{formatDuration(previewTime)}</span>
                <div className="flex-1 h-1 rounded-full bg-[#1C1C1A] overflow-hidden">
                  <div className="h-full bg-[#9DFF4A] rounded-full transition-[width] duration-150" style={{ width: `${toPercent(previewTime)}%` }} />
                </div>
                <span className="font-['Geist_Mono'] text-[10px] text-[#9A9A94] tabular-nums">{formatDuration(endTime)}</span>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { label: "Duration", value: formatDuration(Math.max(0, clipDur)), accent: true },
              { label: "Original", value: formatDuration(origDur), accent: false },
              { label: "Change", value: `${durChange > 0 ? "+" : ""}${durChange}s`, color: durChange > 0 ? "text-[#9DFF4A]" : durChange < 0 ? "text-amber-400" : "text-[#9A9A94]" },
              { label: "Range", value: `${formatDuration(startTime)}–${formatDuration(endTime)}`, small: true },
            ].map((card, i) => (
              <div key={i} className="bg-[#121210] border border-[#1C1C1A] rounded-2xl p-3 flex flex-col items-center gap-1">
                <span className={`font-['Bricolage_Grotesque'] font-bold leading-none ${card.accent ? "text-[#9DFF4A] text-lg" : card.color || "text-[#EDEDE8] text-sm"} ${card.small ? "text-[10px] text-center" : ""}`}>
                  {card.value}
                </span>
                <span className="text-[9px] font-['Geist_Mono'] text-[#9A9A94] font-medium uppercase tracking-wider">{card.label}</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <div className="flex justify-between text-[11px] font-['Geist_Mono'] text-[#9A9A94] mb-2">
              <span>{formatDuration(minStart)}</span>
              <span className="text-[#6E6E68]">available range</span>
              <span>{formatDuration(maxEnd)}</span>
            </div>

            <div ref={trackRef} className="relative h-14 mx-3 select-none touch-none" style={{ touchAction: "none" }}>
              {/* Track background */}
              <div className="absolute inset-y-[22px] inset-x-0 h-3 bg-[#1C1C1A] rounded-full" />
              {/* Original ghost */}
              <div
                className="absolute top-[24px] h-2 rounded-full bg-[#2F2F2B] border border-dashed border-[#4A4A46]"
                style={{ left: `${origStartPct}%`, width: `${Math.max(0, origEndPct - origStartPct)}%` }}
              />
              {/* Selection */}
              <div
                className="absolute top-[22px] h-3 rounded-full bg-[#9DFF4A]/25 border border-[#9DFF4A]"
                style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
              />
              {/* Playhead */}
              <div
                className="absolute top-[15px] h-7 w-[2px] bg-[#9DFF4A] rounded-full pointer-events-none shadow-[0_0_8px_rgba(157,255,74,0.8)]"
                style={{ left: `${toPercent(previewTime)}%`, transform: "translateX(-50%)" }}
              />

              {/* Start handle */}
              <div
                className={`absolute top-[10px] w-5 h-8 rounded-lg flex flex-col items-center justify-center gap-[3px] cursor-ew-resize transition-all ${dragging === "start" ? "scale-110" : ""}`}
                style={{ left: `${startPct}%`, transform: "translateX(-50%)", background: "#9DFF4A", boxShadow: "0 0 16px rgba(157,255,74,0.4)" }}
                onMouseDown={e => { e.preventDefault(); setDragging("start") }}
                onTouchStart={() => setDragging("start")}
              >
                <div className="w-[2px] h-2 bg-[#060606] rounded-full" />
                <div className="w-[2px] h-2 bg-[#060606] rounded-full" />
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-[#9DFF4A] text-[#060606] text-[9px] font-['Geist_Mono'] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {formatDuration(startTime)}
                </div>
              </div>

              {/* End handle */}
              <div
                className={`absolute top-[10px] w-5 h-8 rounded-lg flex flex-col items-center justify-center gap-[3px] cursor-ew-resize transition-all ${dragging === "end" ? "scale-110" : ""}`}
                style={{ left: `${endPct}%`, transform: "translateX(-50%)", background: "#9DFF4A", boxShadow: "0 0 16px rgba(157,255,74,0.4)" }}
                onMouseDown={e => { e.preventDefault(); setDragging("end") }}
                onTouchStart={() => setDragging("end")}
              >
                <div className="w-[2px] h-2 bg-[#060606] rounded-full" />
                <div className="w-[2px] h-2 bg-[#060606] rounded-full" />
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-[#9DFF4A] text-[#060606] text-[9px] font-['Geist_Mono'] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {formatDuration(endTime)}
                </div>
              </div>
            </div>
            <p className="text-center font-['Geist_Mono'] text-[10px] text-[#6E6E68] mt-1">↔ Drag handles to adjust in/out points</p>
          </div>

          {/* Nudge controls */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Start", accent: "#9DFF4A", value: formatDuration(startTime), handle: "start" },
              { label: "End", accent: "#9DFF4A", value: formatDuration(endTime), handle: "end" },
            ].map(({ label, value, handle }) => (
              <div key={label} className="bg-[#121210] border border-[#1C1C1A] rounded-2xl p-3">
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-[10px] font-['Geist_Mono'] uppercase tracking-wider text-[#9DFF4A]">{label}</span>
                  <span className="text-[13px] font-bold text-[#EDEDE8] font-['Geist_Mono']">{value}</span>
                </div>
                <div className="flex gap-1.5">
                  {[-5, -1, 1, 5].map(d => (
                    <button
                      key={d}
                      onClick={() => nudge(handle, d)}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border border-[#1C1C1A] text-[#9A9A94] hover:text-[#9DFF4A] hover:border-[#9DFF4A] transition-colors"
                    >
                      {d > 0 ? `+${d}s` : `${d}s`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-[12px] text-red-400">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[#1C1C1A] flex-shrink-0 bg-[#121210]">
          <button
            onClick={onClose}
            disabled={saving}
            className="btn-ghost text-[13px] h-[44px] px-5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 justify-center text-[13px] h-[44px]"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#060606] border-t-transparent rounded-full animate-spin" />
                Creating clip…
              </>
            ) : (
              <>
                <Scissors size={14} />
                Create Clip ({formatDuration(Math.max(0, clipDur))})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExtendCutModal
