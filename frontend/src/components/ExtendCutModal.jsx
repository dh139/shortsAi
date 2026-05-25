"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Scissors, X } from "lucide-react"

const ExtendCutModal = ({ clip, onClose, onSave, formatDuration, videoUrl }) => {
  const [startTime, setStartTime] = useState(Math.round(clip.startTime))
  const [endTime,   setEndTime]   = useState(Math.round(clip.endTime))
  const [dragging,  setDragging]  = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState("")
  const [previewTime, setPreviewTime] = useState(Math.round(clip.startTime) + 1)
  const [isPlaying, setIsPlaying] = useState(false)
  const trackRef = useRef(null)
  const videoRef = useRef(null)

  const minStart  = Math.floor(clip.minStartTime  ?? Math.max(0, clip.startTime - 60))
  const maxEnd    = Math.ceil( clip.maxEndTime    ?? clip.endTime + 60)
  const totalSpan = maxEnd - minStart
  const clipDur   = endTime - startTime
  const origDur   = Math.round((clip.originalEnd ?? clip.endTime) - (clip.originalStart ?? clip.startTime))

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
    if (dragging === "start") {
      setStartTime(Math.max(minStart, Math.min(Math.round(t), endTime - 3)))
    } else {
      setEndTime(Math.max(startTime + 3, Math.min(Math.round(t), maxEnd)))
    }
  }, [dragging, getTimeFromEvent, minStart, maxEnd, startTime, endTime])

  const onUp = useCallback(() => setDragging(null), [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup",   onUp)
    window.addEventListener("touchmove", onMove, { passive: true })
    window.addEventListener("touchend",  onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup",   onUp)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend",  onUp)
    }
  }, [dragging, onMove, onUp])

  const nudge = (handle, delta) => {
    if (handle === "start") {
      setStartTime(t => Math.max(minStart, Math.min(t + delta, endTime - 3)))
    } else {
      setEndTime(t => Math.max(startTime + 3, Math.min(t + delta, maxEnd)))
    }
  }

  const handleSave = async () => {
    if (clipDur < 3)   return setError("Clip must be at least 3 seconds")
    if (clipDur > 180) return setError("Clip cannot exceed 3 minutes")
    setError("")
    setSaving(true)
    try {
      await onSave(clip, startTime, endTime)
    } catch (e) {
      setError(e?.message || "Failed to create clip")
      setSaving(false)
    }
  }

  const startPct = toPercent(startTime)
  const endPct   = toPercent(endTime)
  const origStartPct = toPercent(clip.originalStart ?? clip.startTime)
  const origEndPct   = toPercent(clip.originalEnd ?? clip.endTime)

  const durChange = clipDur - origDur
  const durChangeColor = durChange > 0 ? "#306D29" : durChange < 0 ? "#b91c1c" : "rgba(13, 83, 14, 0.55)"

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* header */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.headerIcon}>
              <Scissors size={16} color="#306D29" />
            </div>
            <div>
              <h3 style={S.title}>Edit Clip Timing</h3>
              <p style={S.subtitle}>{clip.title}</p>
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <X size={16} color="#0D530E" />
          </button>
        </div>

        <div style={S.body}>
          {/* video preview */}
          {videoUrl && (
            <div style={S.previewSection}>
              <div style={S.previewHeader}>
                <span style={S.previewTitle}>Preview</span>
                <div style={S.previewControls}>
                  <button style={S.previewBtn} onClick={() => {
                    if (videoRef.current) {
                      if (isPlaying) videoRef.current.pause()
                      else {
                        videoRef.current.currentTime = startTime
                        videoRef.current.play()
                      }
                      setIsPlaying(!isPlaying)
                    }
                  }}>
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button style={S.previewBtn} onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = startTime
                      setPreviewTime(startTime)
                    }
                  }}>
                    Start
                  </button>
                  <button style={S.previewBtn} onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = endTime - 1
                      setPreviewTime(endTime - 1)
                    }
                  }}>
                    End
                  </button>
                </div>
              </div>
              <video
                ref={videoRef}
                src={videoUrl}
                style={S.videoPreview}
                playsInline
                preload="metadata"
                onTimeUpdate={() => {
                  if (videoRef.current && videoRef.current.currentTime >= endTime) {
                    videoRef.current.pause()
                    setIsPlaying(false)
                  }
                }}
                onEnded={() => setIsPlaying(false)}
                onError={(e) => {
                  console.error("Video load error:", e)
                  setError("Unable to load video preview")
                }}
              />
              <div style={S.previewTime}>
                {formatDuration(previewTime)} / {formatDuration(clipDur)}
              </div>
            </div>
          )}

          {/* stat cards */}
          <div style={S.statsRow}>
            <StatCard label="New Duration" value={formatDuration(clipDur)} color="#306D29" big />
            <StatCard label="Original" value={formatDuration(origDur)} />
            <StatCard label="Change" value={`${durChange > 0 ? "+" : ""}${durChange}s`} color={durChangeColor} />
            <StatCard label="Range" value={`${formatDuration(startTime)}–${formatDuration(endTime)}`} small />
          </div>

          {/* timeline */}
          <div style={S.timelineWrap}>
            <div style={S.timelineHeader}>
              <span style={S.timeLbl}>{formatDuration(minStart)}</span>
              <span style={{ ...S.timeLbl, color: "rgba(13, 83, 14, 0.45)" }}>available range</span>
              <span style={S.timeLbl}>{formatDuration(maxEnd)}</span>
            </div>

            <div ref={trackRef} style={S.track}>
              <div style={S.trackBg} />
              <div style={{ ...S.origGhost, left: `${origStartPct}%`, width: `${origEndPct - origStartPct}%` }} />
              <div style={{ ...S.selection, left: `${startPct}%`, width: `${endPct - startPct}%` }} />

              <Handle style={{ left: `${startPct}%` }} color="#306D29" label={formatDuration(startTime)} labelSide="right" onDragStart={() => setDragging("start")} active={dragging === "start"} />
              <Handle style={{ left: `${endPct}%` }} color="#b91c1c" label={formatDuration(endTime)} labelSide="left" onDragStart={() => setDragging("end")} active={dragging === "end"} />
            </div>

            <p style={S.trackHint}>↔ Drag handles or use the nudge buttons</p>
          </div>

          {/* nudge controls */}
          <div style={S.nudgeGrid}>
            <NudgeBox label="Start" value={formatDuration(startTime)} color="#306D29" onNudge={d => nudge("start", d)} />
            <NudgeBox label="End" value={formatDuration(endTime)} color="#b91c1c" onNudge={d => nudge("end", d)} />
          </div>

          {/* number inputs */}
          <div style={S.inputRow}>
            <div style={S.inputGroup}>
              <label style={S.inputLbl}>Start (seconds)</label>
              <input type="number" style={S.input} value={startTime} min={minStart} max={endTime - 3} step={1}
                onChange={e => {
                  const n = parseFloat(e.target.value)
                  if (!isNaN(n)) setStartTime(Math.max(minStart, Math.min(n, endTime - 3)))
                }}
              />
            </div>
            <div style={S.inputGroup}>
              <label style={S.inputLbl}>End (seconds)</label>
              <input type="number" style={S.input} value={endTime} min={startTime + 3} max={maxEnd} step={1}
                onChange={e => {
                  const n = parseFloat(e.target.value)
                  if (!isNaN(n)) setEndTime(Math.max(startTime + 3, Math.min(n, maxEnd)))
                }}
              />
            </div>
          </div>

          {error && <div style={S.errorBox}>⚠️ {error}</div>}
        </div>

        {/* footer */}
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={{ ...S.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? (
              <><span style={S.spinner} /> Creating…</>
            ) : (
              <><Scissors size={14} /> Create Clip ({formatDuration(clipDur)})</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Sub-components remain same (StatCard, Handle, NudgeBox)
const StatCard = ({ label, value, color, big, small }) => (
  <div style={S.statCard}>
    <span style={{
      fontSize: big ? 20 : small ? 12 : 16,
      fontWeight: 800,
      color: color || "#0D530E",
      letterSpacing: "-0.02em",
    }}>{value}</span>
    <span style={S.statLabel}>{label}</span>
  </div>
)

const Handle = ({ style, color, label, labelSide, onDragStart, active }) => (
  <div
    style={{
      ...S.handle,
      ...style,
      background: color,
      boxShadow: active ? `0 0 0 4px ${color}44` : `0 2px 8px rgba(0,0,0,0.5)`,
    }}
    onMouseDown={e => { e.preventDefault(); onDragStart() }}
    onTouchStart={onDragStart}
  >
    <div style={S.handleBar} />
    <div style={S.handleBar} />
    <div style={{
      ...S.handleLabel,
      [labelSide === "right" ? "left" : "right"]: "auto",
      [labelSide]: 0,
      transform: labelSide === "right" ? "translateX(8px)" : "translateX(-100%) translateX(-8px)",
      background: color,
    }}>
      {label}
    </div>
  </div>
)

const NudgeBox = ({ label, value, color, onNudge }) => (
  <div style={{ ...S.nudgeBox, borderColor: color + "33" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{value}</span>
    </div>
    <div style={S.nudgeBtns}>
      {[-5, -1, 1, 5].map(d => (
        <button
          key={d}
          style={{ ...S.nudgeBtn, borderColor: color + "44", color }}
          onClick={() => onNudge(d)}
        >
          {d > 0 ? `+${d}s` : `${d}s`}
        </button>
      ))}
    </div>
  </div>
)

// ── Updated Responsive Styles ─────────────────────────────────
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(13, 83, 14, 0.18)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "16px",
    backdropFilter: "blur(8px)",
  },
  modal: {
    background: "#FFFDF7",
    border: "1px solid rgba(48, 109, 41, 0.15)",
    borderRadius: 20,
    width: "100%",
    maxWidth: 560,
    maxHeight: "95vh",           // ← Important
    boxShadow: "0 32px 80px rgba(48, 109, 41, 0.12)",
    fontFamily: "'Outfit', 'Sora', system-ui, sans-serif",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },

  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 20px",
    borderBottom: "1px solid rgba(48, 109, 41, 0.08)",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", gap: 12, alignItems: "center" },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    background: "rgba(48, 109, 41, 0.06)",
    border: "1px solid rgba(48, 109, 41, 0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  title:    { fontSize: 15, fontWeight: 700, margin: 0, color: "#0D530E" },
  subtitle: { fontSize: 11, color: "rgba(13, 83, 14, 0.55)", margin: "3px 0 0" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: "rgba(48, 109, 41, 0.04)",
    border: "1px solid rgba(48, 109, 41, 0.08)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
  },

  body: {
    padding: "20px",
    overflowY: "auto",           // ← Makes it scrollable
    flex: 1,
  },

  // Preview
  previewSection: { marginBottom: 20, borderRadius: 12, overflow: "hidden", background: "#000", border: "1px solid rgba(48, 109, 41, 0.12)" },
  previewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,0.03)" },
  previewTitle: { fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" },
  previewControls: { display: "flex", gap: 6 },
  previewBtn: { padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", cursor: "pointer" },
  videoPreview: { width: "100%", height: "180px", display: "block", objectFit: "cover", background: "#000" }, // Reduced height
  previewTime: { padding: "6px 12px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.5)", textAlign: "center" },

  statsRow: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  statCard: {
    flex: 1, minWidth: "120px",
    background: "rgba(48, 109, 41, 0.03)",
    border: "1px solid rgba(48, 109, 41, 0.07)",
    borderRadius: 10, padding: "10px 12px",
    display: "flex", flexDirection: "column", gap: 2, alignItems: "center",
  },
  statLabel: { fontSize: 9, color: "rgba(13, 83, 14, 0.45)", letterSpacing: "0.05em" },

  // Timeline
  timelineWrap: { marginBottom: 20 },
  timelineHeader: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  timeLbl: { fontSize: 10, color: "rgba(13, 83, 14, 0.5)" },
  track: {
    position: "relative", height: 56, margin: "0 12px", userSelect: "none", touchAction: "none",
  },
  trackBg: { position: "absolute", top: 22, left: 0, right: 0, height: 12, background: "rgba(48, 109, 41, 0.08)", borderRadius: 6 },
  origGhost: { position: "absolute", top: 24, height: 8, borderRadius: 4, background: "rgba(48, 109, 41, 0.03)", border: "1px dashed rgba(48, 109, 41, 0.25)", pointerEvents: "none" },
  selection: { position: "absolute", top: 22, height: 12, borderRadius: 6, background: "rgba(48, 109, 41, 0.2)", border: "1px solid rgba(48, 109, 41, 0.35)", pointerEvents: "none" },
  handle: {
    position: "absolute", top: 12, width: 20, height: 32, borderRadius: 6,
    transform: "translateX(-50%)", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 3, zIndex: 20,
    cursor: "ew-resize",
  },
  handleBar: { width: 2, height: 7, background: "rgba(255,255,255,0.85)", borderRadius: 1 },
  handleLabel: {
    position: "absolute", top: -22, fontSize: 10, fontWeight: 700, color: "white",
    padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
  },
  trackHint: { fontSize: 11, color: "rgba(13, 83, 14, 0.45)", textAlign: "center", margin: "8px 0 0" },

  nudgeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  nudgeBox: { background: "rgba(48, 109, 41, 0.02)", border: "1px solid", borderRadius: 10, padding: "12px" },
  nudgeBtns: { display: "flex", gap: 5 },
  nudgeBtn: {
    flex: 1, padding: "6px 0", border: "1px solid", borderRadius: 6,
    background: "transparent", fontSize: 11, fontWeight: 600, cursor: "pointer",
  },

  inputRow: { display: "flex", gap: 12, marginBottom: 4 },
  inputGroup: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  inputLbl: { fontSize: 11, color: "rgba(13, 83, 14, 0.5)", fontWeight: 600 },
  input: {
    padding: "10px 12px", background: "#FFFDF7", border: "1px solid rgba(48, 109, 41, 0.15)",
    borderRadius: 8, color: "#1C2E1A", fontSize: 14, fontWeight: 600, width: "100%",
  },

  errorBox: { marginTop: 8, padding: "8px 12px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: 8, fontSize: 12, color: "#b91c1c" },

  footer: {
    display: "flex", gap: 10, padding: "16px 20px",
    borderTop: "1px solid rgba(48, 109, 41, 0.08)",
    flexShrink: 0,
  },
  cancelBtn: {
    padding: "10px 20px", borderRadius: 9, background: "rgba(48, 109, 41, 0.05)",
    border: "1px solid rgba(48, 109, 41, 0.12)", color: "#306D29", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  saveBtn: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "10px 20px", borderRadius: 9, background: "linear-gradient(135deg, #306D29, #0D530E)",
    border: "none", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 4px 16px rgba(48, 109, 41, 0.2)",
  },
  spinner: {
    display: "inline-block", width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white",
    borderRadius: "50%", animation: "spin 0.65s linear infinite",
  },
}

export default ExtendCutModal