"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Scissors, X } from "lucide-react"

const ExtendCutModal = ({ clip, onClose, onSave, formatDuration }) => {
  const [startTime, setStartTime] = useState(Math.round(clip.startTime))
  const [endTime,   setEndTime]   = useState(Math.round(clip.endTime))
  const [dragging,  setDragging]  = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState("")
  const trackRef = useRef(null)

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
  const durChangeColor = durChange > 0 ? "#10B981" : durChange < 0 ? "#FF3B5C" : "rgba(255,255,255,0.5)"

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* header */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.headerIcon}>
              <Scissors size={16} color="#FF3B5C" />
            </div>
            <div>
              <h3 style={S.title}>Edit Clip Timing</h3>
              <p style={S.subtitle}>{clip.title}</p>
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>
            <X size={16} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        <div style={S.body}>

          {/* stat cards */}
          <div style={S.statsRow}>
            <StatCard label="New Duration" value={formatDuration(clipDur)} color="#FF3B5C" big />
            <StatCard label="Original" value={formatDuration(origDur)} />
            <StatCard label="Change" value={`${durChange > 0 ? "+" : ""}${durChange}s`} color={durChangeColor} />
            <StatCard label="Range" value={`${formatDuration(startTime)}–${formatDuration(endTime)}`} small />
          </div>

          {/* timeline */}
          <div style={S.timelineWrap}>
            <div style={S.timelineHeader}>
              <span style={S.timeLbl}>{formatDuration(minStart)}</span>
              <span style={{ ...S.timeLbl, color: "rgba(255,255,255,0.25)" }}>available range</span>
              <span style={S.timeLbl}>{formatDuration(maxEnd)}</span>
            </div>

            <div
              ref={trackRef}
              style={{ ...S.track, cursor: dragging ? "grabbing" : "default" }}
            >
              {/* track bg */}
              <div style={S.trackBg} />

              {/* original region ghost */}
              <div style={{
                ...S.origGhost,
                left: `${origStartPct}%`,
                width: `${origEndPct - origStartPct}%`,
              }} />

              {/* selected region */}
              <div style={{
                ...S.selection,
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
              }} />

              {/* start handle */}
              <Handle
                style={{ left: `${startPct}%` }}
                color="#10B981"
                label={formatDuration(startTime)}
                labelSide="right"
                onDragStart={() => setDragging("start")}
                active={dragging === "start"}
              />

              {/* end handle */}
              <Handle
                style={{ left: `${endPct}%` }}
                color="#FF3B5C"
                label={formatDuration(endTime)}
                labelSide="left"
                onDragStart={() => setDragging("end")}
                active={dragging === "end"}
              />
            </div>

            <p style={S.trackHint}>↔ Drag handles or use the nudge buttons</p>
          </div>

          {/* nudge controls */}
          <div style={S.nudgeGrid}>
            <NudgeBox
              label="Start"
              value={formatDuration(startTime)}
              color="#10B981"
              onNudge={d => nudge("start", d)}
            />
            <NudgeBox
              label="End"
              value={formatDuration(endTime)}
              color="#FF3B5C"
              onNudge={d => nudge("end", d)}
            />
          </div>

          {/* number inputs */}
          <div style={S.inputRow}>
            <div style={S.inputGroup}>
              <label style={S.inputLbl}>Start (seconds)</label>
              <input
                type="number"
                style={S.input}
                value={startTime}
                min={minStart} max={endTime - 3} step={1}
                onChange={e => {
                  const n = parseFloat(e.target.value)
                  if (!isNaN(n)) setStartTime(Math.max(minStart, Math.min(n, endTime - 3)))
                }}
              />
            </div>
            <div style={S.inputGroup}>
              <label style={S.inputLbl}>End (seconds)</label>
              <input
                type="number"
                style={S.input}
                value={endTime}
                min={startTime + 3} max={maxEnd} step={1}
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
          <button style={S.cancelBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            style={{ ...S.saveBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
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

// ── sub components ────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, big, small }) => (
  <div style={S.statCard}>
    <span style={{
      fontSize: big ? 20 : small ? 12 : 16,
      fontWeight: 800,
      color: color || "rgba(255,255,255,0.9)",
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
      cursor: "ew-resize",
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

// ── styles ────────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(0,0,0,0.88)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#0f0f1a",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 20, width: "100%", maxWidth: 560,
    boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
    fontFamily: "'Sora', 'Outfit', 'DM Sans', system-ui, sans-serif",
    overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  headerLeft: { display: "flex", gap: 12, alignItems: "center" },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    background: "rgba(255,59,92,0.12)",
    border: "1px solid rgba(255,59,92,0.25)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  title:    { fontSize: 15, fontWeight: 700, margin: 0, color: "#eeeef2" },
  subtitle: { fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "3px 0 0" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
  },
  body: { padding: 24 },

  // stats
  statsRow: { display: "flex", gap: 8, marginBottom: 24 },
  statCard: {
    flex: 1, background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10, padding: "10px 12px",
    display: "flex", flexDirection: "column", gap: 2, alignItems: "center",
  },
  statLabel: { fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em" },

  // timeline
  timelineWrap: { marginBottom: 20 },
  timelineHeader: {
    display: "flex", justifyContent: "space-between",
    marginBottom: 8,
  },
  timeLbl: { fontSize: 10, color: "rgba(255,255,255,0.3)" },
  track: {
    position: "relative", height: 56,
    margin: "0 16px",
    userSelect: "none", touchAction: "none",
  },
  trackBg: {
    position: "absolute", top: 22, left: 0, right: 0, height: 12,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 6,
  },
  origGhost: {
    position: "absolute", top: 24, height: 8, borderRadius: 4,
    background: "rgba(255,255,255,0.06)",
    border: "1px dashed rgba(255,255,255,0.15)",
    pointerEvents: "none",
  },
  selection: {
    position: "absolute", top: 22, height: 12, borderRadius: 6,
    background: "linear-gradient(90deg, rgba(16,185,129,0.4), rgba(255,59,92,0.4))",
    border: "1px solid rgba(255,255,255,0.15)",
    pointerEvents: "none",
  },
  handle: {
    position: "absolute", top: 12,
    width: 20, height: 32, borderRadius: 6,
    transform: "translateX(-50%)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: 3, zIndex: 10,
    transition: "box-shadow 0.15s",
  },
  handleBar: { width: 2, height: 7, background: "rgba(255,255,255,0.7)", borderRadius: 1 },
  handleLabel: {
    position: "absolute", top: -22,
    fontSize: 10, fontWeight: 700, color: "white",
    padding: "2px 6px", borderRadius: 4,
    whiteSpace: "nowrap", pointerEvents: "none",
  },
  trackHint: {
    fontSize: 11, color: "rgba(255,255,255,0.25)",
    textAlign: "center", margin: "8px 0 0",
  },

  // nudge
  nudgeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  nudgeBox: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid",
    borderRadius: 10, padding: "12px",
  },
  nudgeBtns: { display: "flex", gap: 5 },
  nudgeBtn: {
    flex: 1, padding: "5px 0",
    border: "1px solid", borderRadius: 6,
    background: "transparent",
    fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    transition: "background 0.15s",
  },

  // inputs
  inputRow: { display: "flex", gap: 12, marginBottom: 4 },
  inputGroup: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  inputLbl: { fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600 },
  input: {
    padding: "9px 12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#eeeef2",
    fontSize: 14, fontWeight: 600,
    outline: "none", width: "100%",
    fontFamily: "inherit",
  },

  errorBox: {
    marginTop: 8, padding: "8px 12px",
    background: "rgba(255,59,92,0.08)",
    border: "1px solid rgba(255,59,92,0.25)",
    borderRadius: 8, fontSize: 12, color: "#ff6b80",
  },

  footer: {
    display: "flex", gap: 10, padding: "16px 24px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  cancelBtn: {
    padding: "10px 20px", borderRadius: 9,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.55)",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit",
  },
  saveBtn: {
    flex: 1, display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8,
    padding: "10px 20px", borderRadius: 9,
    background: "linear-gradient(135deg, #FF3B5C, #FF6B35)",
    border: "none", color: "white",
    fontSize: 13, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 4px 16px rgba(255,59,92,0.3)",
  },
  spinner: {
    display: "inline-block", width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white", borderRadius: "50%",
    animation: "spin 0.65s linear infinite",
  },
}

export default ExtendCutModal