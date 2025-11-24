"use client"

import { useState } from "react"
import { Scissors, X } from "lucide-react"

const ExtendCutModal = ({ clip, onClose, onSave, formatDuration }) => {
  const [startTime, setStartTime] = useState(clip.startTime)
  const [endTime, setEndTime] = useState(clip.endTime)
  const [isDragging, setIsDragging] = useState(null)

  const minStart = clip.minStartTime || 0
  const maxEnd = clip.maxEndTime || clip.originalEnd + 30
  const totalDuration = maxEnd - minStart

  const handleMouseDown = (type) => {
    setIsDragging(type)
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const time = minStart + percentage * totalDuration

    if (isDragging === "start") {
      const newStart = Math.max(minStart, Math.min(time, endTime - 5))
      setStartTime(newStart)
    } else if (isDragging === "end") {
      const newEnd = Math.max(startTime + 5, Math.min(time, maxEnd))
      setEndTime(newEnd)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(null)
  }

  const startPercentage = ((startTime - minStart) / totalDuration) * 100
  const endPercentage = ((endTime - minStart) / totalDuration) * 100

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title">
            <Scissors className="w-6 h-6" />
            <h3>Edit Clip</h3>
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-content">
          <div className="clip-info">
            <h4 className="clip-name">{clip.title}</h4>
            <p className="edit-instruction">Drag the handles to adjust start and end times</p>
          </div>

          <div className="timeline-container">
            <div
              className="timeline-track"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div className="timeline-background"></div>

              <div
                className="timeline-selection"
                style={{
                  left: `${startPercentage}%`,
                  width: `${endPercentage - startPercentage}%`,
                }}
              ></div>

              <div
                className="timeline-handle start-handle"
                style={{ left: `${startPercentage}%` }}
                onMouseDown={() => handleMouseDown("start")}
              >
                <div className="handle-indicator"></div>
              </div>

              <div
                className="timeline-handle end-handle"
                style={{ left: `${endPercentage}%` }}
                onMouseDown={() => handleMouseDown("end")}
              >
                <div className="handle-indicator"></div>
              </div>
            </div>

            <div className="timeline-labels">
              <span>{formatDuration(minStart)}</span>
              <span>{formatDuration(maxEnd)}</span>
            </div>
          </div>

          <div className="duration-info">
            <div className="info-row">
              <span className="info-label">New Duration:</span>
              <span className="info-value primary">{formatDuration(endTime - startTime)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Original Duration:</span>
              <span className="info-value">{formatDuration(clip.originalEnd - clip.originalStart)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Start Time:</span>
              <span className="info-value">{formatDuration(startTime)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">End Time:</span>
              <span className="info-value">{formatDuration(endTime)}</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={() => onSave(clip, startTime, endTime)} className="modal-button primary">
            Create Custom Clip
          </button>
          <button onClick={onClose} className="modal-button secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExtendCutModal
