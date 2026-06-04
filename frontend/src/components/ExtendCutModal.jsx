"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Scissors, X, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from "lucide-react"

const ExtendCutModal = ({ clip, onClose, onSave, formatDuration, videoUrl }) => {
  const [startTime, setStartTime] = useState(Math.round(clip.startTime))
  const [endTime, setEndTime] = useState(Math.round(clip.endTime))
  const [dragging, setDragging] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const trackRef = useRef(null)
  const videoRef = useRef(null)

  const minStart = Math.floor(clip.minStartTime ?? Math.max(0, clip.startTime - 60))
  const maxEnd = Math.ceil(clip.maxEndTime ?? clip.endTime + 60)
  const totalSpan = maxEnd - minStart
  const clipDur = endTime - startTime
  const origDur = Math.round((clip.originalEnd ?? clip.endTime) - (clip.originalStart ?? clip.startTime))

  const toPercent = (t) => ((t - minStart) / totalSpan) * 100

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
    if (dragging === "start") setStartTime(Math.max(minStart, Math.min(Math.round(t), endTime - 3)))
    else setEndTime(Math.max(startTime + 3, Math.min(Math.round(t), maxEnd)))
  }, [dragging, getTimeFromEvent, minStart, maxEnd, startTime, endTime])

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[560px] max-h-[95vh] flex flex-col bg-[#111113] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Scissors size={14} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-white leading-none mb-0.5">Edit Clip Timing</h3>
              <p className="text-[11px] text-white/30 leading-none truncate max-w-[280px]">{clip.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/30 hover:text-white/70 transition-all">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Video preview */}
          {videoUrl && (
            <div className="rounded-xl overflow-hidden bg-black border border-white/[0.06]">
              <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-b border-white/[0.05]">
                <span className="text-[11px] font-semibold text-white/40">Preview</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: "Start", action: () => { if (videoRef.current) { videoRef.current.currentTime = startTime } } },
                    { label: "Play", action: () => { if (videoRef.current) { isPlaying ? videoRef.current.pause() : (videoRef.current.currentTime = startTime, videoRef.current.play()); setIsPlaying(!isPlaying) } } },
                    { label: "End", action: () => { if (videoRef.current) { videoRef.current.currentTime = endTime - 1 } } },
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.action} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-white/50 hover:text-white transition-all">
                      {btn.label === "Play" ? (isPlaying ? "Pause" : "Play") : btn.label}
                    </button>
                  ))}
                </div>
              </div>
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full block"
                style={{ height: 160, objectFit: "cover", background: "#000" }}
                playsInline preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => {
                  if (videoRef.current && videoRef.current.currentTime >= endTime) {
                    videoRef.current.pause(); setIsPlaying(false)
                  }
                }}
                onEnded={() => setIsPlaying(false)}
              />
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { label: "New Duration", value: formatDuration(clipDur), accent: true },
              { label: "Original", value: formatDuration(origDur), accent: false },
              { label: "Change", value: `${durChange > 0 ? "+" : ""}${durChange}s`, color: durChange > 0 ? "text-emerald-400" : durChange < 0 ? "text-red-400" : "text-white/30" },
              { label: "Range", value: `${formatDuration(startTime)}–${formatDuration(endTime)}`, small: true },
            ].map((card, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 flex flex-col items-center gap-1">
                <span className={`font-black leading-none ${card.accent ? "text-amber-400 text-lg" : card.color || "text-white text-sm"} ${card.small ? "text-[10px] text-center" : ""}`}>
                  {card.value}
                </span>
                <span className="text-[9px] text-white/25 font-medium uppercase tracking-wider">{card.label}</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <div className="flex justify-between text-[10px] font-mono text-white/20 mb-2">
              <span>{formatDuration(minStart)}</span>
              <span className="text-white/15">available range</span>
              <span>{formatDuration(maxEnd)}</span>
            </div>

            <div ref={trackRef} className="relative h-14 mx-3 select-none touch-none" style={{ touchAction: "none" }}>
              {/* Track background */}
              <div className="absolute inset-y-[22px] inset-x-0 h-3 bg-white/[0.06] rounded-full" />
              {/* Original ghost */}
              <div
                className="absolute top-[24px] h-2 rounded-full bg-white/[0.04] border border-dashed border-white/10"
                style={{ left: `${origStartPct}%`, width: `${origEndPct - origStartPct}%` }}
              />
              {/* Selection */}
              <div
                className="absolute top-[22px] h-3 rounded-full bg-amber-500/20 border border-amber-500/40"
                style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
              />

              {/* Start handle */}
              <div
                className={`absolute top-[10px] w-5 h-8 rounded-lg flex flex-col items-center justify-center gap-[3px] cursor-ew-resize transition-all ${dragging === "start" ? "scale-110" : ""}`}
                style={{ left: `${startPct}%`, transform: "translateX(-50%) translateY(0)", background: "#F59E0B", boxShadow: dragging === "start" ? "0 0 0 4px rgba(245,158,11,0.25)" : "0 2px 8px rgba(0,0,0,0.5)" }}
                onMouseDown={e => { e.preventDefault(); setDragging("start") }}
                onTouchStart={() => setDragging("start")}
              >
                <div className="w-[2px] h-2 bg-black/40 rounded-full" />
                <div className="w-[2px] h-2 bg-black/40 rounded-full" />
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded whitespace-nowrap">
                  {formatDuration(startTime)}
                </div>
              </div>

              {/* End handle */}
              <div
                className={`absolute top-[10px] w-5 h-8 rounded-lg flex flex-col items-center justify-center gap-[3px] cursor-ew-resize transition-all ${dragging === "end" ? "scale-110" : ""}`}
                style={{ left: `${endPct}%`, transform: "translateX(-50%) translateY(0)", background: "#EF4444", boxShadow: dragging === "end" ? "0 0 0 4px rgba(239,68,68,0.25)" : "0 2px 8px rgba(0,0,0,0.5)" }}
                onMouseDown={e => { e.preventDefault(); setDragging("end") }}
                onTouchStart={() => setDragging("end")}
              >
                <div className="w-[2px] h-2 bg-white/40 rounded-full" />
                <div className="w-[2px] h-2 bg-white/40 rounded-full" />
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded whitespace-nowrap">
                  {formatDuration(endTime)}
                </div>
              </div>
            </div>
            <p className="text-center text-[10px] text-white/20 mt-1">↔ Drag the handles to adjust timing</p>
          </div>

          {/* Nudge controls */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Start", color: "amber", value: formatDuration(startTime), handle: "start", borderColor: "border-amber-500/20" },
              { label: "End", color: "red", value: formatDuration(endTime), handle: "end", borderColor: "border-red-500/20" },
            ].map(({ label, color, value, handle, borderColor }) => (
              <div key={label} className={`bg-white/[0.02] border ${borderColor} rounded-xl p-3`}>
                <div className="flex justify-between items-center mb-2.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${color === "amber" ? "text-amber-400" : "text-red-400"}`}>{label}</span>
                  <span className="text-[13px] font-black text-white font-mono">{value}</span>
                </div>
                <div className="flex gap-1.5">
                  {[-5, -1, 1, 5].map(d => (
                    <button
                      key={d}
                      onClick={() => nudge(handle, d)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                        color === "amber"
                          ? "border-amber-500/20 text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40"
                          : "border-red-500/20 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40"
                      }`}
                    >
                      {d > 0 ? `+${d}s` : `${d}s`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Number inputs */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Start (seconds)", value: startTime, min: minStart, max: endTime - 3, setter: (v) => setStartTime(Math.max(minStart, Math.min(v, endTime - 3))) },
              { label: "End (seconds)", value: endTime, min: startTime + 3, max: maxEnd, setter: (v) => setEndTime(Math.max(startTime + 3, Math.min(v, maxEnd))) },
            ].map(({ label, value, min, max, setter }) => (
              <div key={label}>
                <label className="block text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">{label}</label>
                <input
                  type="number"
                  value={value}
                  min={min}
                  max={max}
                  step={1}
                  onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setter(n) }}
                  className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white text-[14px] font-bold focus:outline-none focus:border-amber-500/40 focus:bg-amber-500/[0.03] transition-all"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/[0.06] border border-red-500/20 rounded-xl text-[12px] text-red-400">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-white/[0.06] flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-[13px] font-semibold text-white/50 hover:text-white transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[13px] font-bold transition-all disabled:opacity-60 hover:shadow-[0_0_24px_rgba(245,158,11,0.3)]"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Creating clip…
              </>
            ) : (
              <>
                <Scissors size={13} strokeWidth={2.5} />
                Create Clip ({formatDuration(clipDur)})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExtendCutModal