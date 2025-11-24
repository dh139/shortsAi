"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import io from "socket.io-client"
import { Download, Scissors, Upload, Zap, Clock, TrendingUp, Video } from "lucide-react"
import ExtendCutModal from "./ExtendCutModal"

const API_BASE_URL = "http://localhost:5000/api"
const socket = io("http://localhost:5000")

const Dashboard = ({ user }) => {
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [clips, setClips] = useState([])
  const [error, setError] = useState("")
  const [progress, setProgress] = useState("")
  const [videoInfo, setVideoInfo] = useState(null)
  const [processingTime, setProcessingTime] = useState(0)
  const [sessionId, setSessionId] = useState(null)
  const [editingClip, setEditingClip] = useState(null)
  const [customClips, setCustomClips] = useState([])

  useEffect(() => {
    let interval
    if (isProcessing) {
      interval = setInterval(() => {
        setProcessingTime((prev) => prev + 1)
      }, 1000)
    } else {
      setProcessingTime(0)
    }
    return () => clearInterval(interval)
  }, [isProcessing])

  useEffect(() => {
    // Listen for progress updates from your existing server
    socket.on("progress", (data) => {
      if (data.sessionId === sessionId) {
        setProgress(`${data.currentStep} (${data.progress}%)`)

        if (data.status === "completed") {
          setClips(data.clips || [])
          setVideoInfo(data.videoInfo || null)
          setIsProcessing(false)
          setProgress("")
        } else if (data.status === "error") {
          setError(data.error || "Processing failed")
          setIsProcessing(false)
          setProgress("")
        }
      }
    })

    return () => {
      socket.off("progress")
    }
  }, [sessionId])

  const handleGenerateClips = async () => {
    if (!youtubeUrl) {
      setError("Please enter a YouTube URL")
      return
    }
    if (!isValidYouTubeUrl(youtubeUrl)) {
      setError("Please enter a valid YouTube URL")
      return
    }

    setIsProcessing(true)
    setError("")
    setProgress("Starting enhanced AI analysis...")
    setClips([])
    setCustomClips([])
    setVideoInfo(null)
    setProcessingTime(0)

    try {
      const response = await axios.post(`${API_BASE_URL}/generate-clips`, {
        url: youtubeUrl,
      })

      if (response.data.success) {
        const newSessionId = response.data.sessionId
        setSessionId(newSessionId)
        console.log("Processing started with session:", newSessionId)
      } else {
        setError(response.data.error || "Failed to start processing")
        setIsProcessing(false)
      }
    } catch (err) {
      console.error("Error:", err)
      setError("Failed to start processing. Please try again.")
      setIsProcessing(false)
    }
  }

  const handleDownload = async (clipId, filename) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/download/${clipId}`, {
        responseType: "blob",
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Download failed:", err)
      alert("Download failed. Please try again.")
    }
  }

  const handleExtendCut = async (clip, newStartTime, newEndTime) => {
    try {
      setProgress("Creating custom clip...")
      const response = await axios.post(`${API_BASE_URL}/extend-cut-clip`, {
        clipId: clip.id,
        newStartTime: newStartTime,
        newEndTime: newEndTime,
        sessionId: sessionId,
      })

      if (response.data.success) {
        setCustomClips((prev) => [...prev, response.data.clip])
        setEditingClip(null)
        setProgress("")
      } else {
        alert("Failed to create custom clip")
      }
    } catch (err) {
      console.error("Extend/Cut failed:", err)
      alert("Failed to create custom clip")
      setProgress("")
    }
  }

  const openExtendCutModal = (clip) => {
    setEditingClip({
      ...clip,
      newStartTime: clip.startTime,
      newEndTime: clip.endTime,
      minStartTime: clip.minStartTime || Math.max(0, clip.startTime - 30),
      maxEndTime: clip.maxEndTime || clip.endTime + 30,
      originalStart: clip.originalStart || clip.startTime,
      originalEnd: clip.originalEnd || clip.endTime,
    })
  }

  const isValidYouTubeUrl = (url) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
    return youtubeRegex.test(url)
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getLanguageFlag = (language) => {
    return language === "hindi" ? "🇮🇳" : "🇺🇸"
  }

  const getVideoTypeIcon = (videoType) => {
    const icons = {
      podcast: "🎙️",
      vlog: "📹",
      tutorial: "📚",
      comedy: "😂",
      gaming: "🎮",
      music: "🎵",
      news: "📰",
      review: "⭐",
      general: "🎬",
    }
    return icons[videoType] || "🎬"
  }

  const allClips = [...clips, ...customClips]

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        {/* Welcome Section */}
        <div className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">
              Welcome back, <span className="gradient-text">{user.name}</span>
            </h1>
            <p className="welcome-subtitle">Transform your long-form content into viral shorts with AI</p>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <Video className="stat-icon" />
              <div className="stat-info">
                <span className="stat-number">12</span>
                <span className="stat-label">Videos Processed</span>
              </div>
            </div>
            <div className="stat-card">
              <Scissors className="stat-icon" />
              <div className="stat-info">
                <span className="stat-number">48</span>
                <span className="stat-label">Clips Generated</span>
              </div>
            </div>
            <div className="stat-card">
              <TrendingUp className="stat-icon" />
              <div className="stat-info">
                <span className="stat-number">85%</span>
                <span className="stat-label">Avg Viral Score</span>
              </div>
            </div>
          </div>
        </div>

        {/* Input Section */}
        <div className="input-section">
          <div className="input-card">
            <div className="input-header">
              <Zap className="w-6 h-6 text-purple-400" />
              <h2>Generate Smart Clips</h2>
            </div>

            <div className="input-form">
              <div className="url-input-wrapper">
                <input
                  type="url"
                  placeholder="Paste YouTube video URL here (Hindi/English supported)..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="url-input"
                  disabled={isProcessing}
                />
                <Upload className="input-icon-right" />
              </div>

              <button onClick={handleGenerateClips} disabled={isProcessing} className="generate-button">
                {isProcessing ? (
                  <>
                    <div className="loading-spinner small"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    Generate Clips
                  </>
                )}
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {progress && (
              <div className="progress-message">
                <div className="progress-content">
                  <span>{progress}</span>
                  {isProcessing && (
                    <span className="progress-time">
                      <Clock className="w-4 h-4" />
                      {formatTime(processingTime)} elapsed
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Video Info */}
        {videoInfo && (
          <div className="video-info-section">
            <div className="video-info-card">
              <div className="video-info-header">
                <div className="success-icon">✅</div>
                <h3>Processing Complete</h3>
              </div>
              <div className="video-info-grid">
                <div className="info-item">
                  <span className="info-label">Video Type</span>
                  <span className="info-value">
                    {getVideoTypeIcon(videoInfo.videoType)} {videoInfo.videoType}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Language</span>
                  <span className="info-value">
                    {getLanguageFlag(videoInfo.language)} {videoInfo.language}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Duration</span>
                  <span className="info-value">{Math.floor(videoInfo.duration / 60)} minutes</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Quality</span>
                  <span className="info-value">{videoInfo.quality || "High Quality"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isProcessing && (
          <div className="loading-section">
            <div className="loading-card">
              <div className="loading-animation">
                <div className="loading-spinner large"></div>
              </div>
              <h3 className="loading-title">
                Enhanced AI analyzing your {videoInfo?.language || ""} {videoInfo?.videoType || ""} video...
              </h3>
              <div className="loading-features">
                <p>🇮🇳 Hindi video patterns detected</p>
                <p>🇺🇸 English content analysis active</p>
                <p>✂️ Preparing drag-based extend/cut capabilities</p>
              </div>
            </div>
          </div>
        )}

        {/* Clips Section */}
        {allClips.length > 0 && (
          <div className="clips-section">
            <div className="clips-header">
              <h2 className="clips-title">
                <TrendingUp className="w-6 h-6" />
                Enhanced Clips ({allClips.length})
              </h2>
              <p className="clips-subtitle">
                AI-optimized for {videoInfo?.language} {videoInfo?.videoType} content
              </p>
            </div>

            <div className="clips-grid">
              {allClips.map((clip) => (
                <div key={clip.id} className="clip-card">
                  <div className="clip-video">
                    <video
                      src={`http://localhost:5000${clip.videoUrl}`}
                      poster={`http://localhost:5000${clip.thumbnail}`}
                      controls
                      className="video-player"
                    />
                    <div className="video-badges">
                      <div className="duration-badge">{formatDuration(clip.duration)}</div>
                      <div className="viral-badge">🔥 {clip.viralScore}%</div>
                      {clip.quality === "high" && <div className="quality-badge">💎 High Quality</div>}
                      {clip.isCustom && <div className="custom-badge">✂️ Custom</div>}
                    </div>
                  </div>

                  <div className="clip-content">
                    <h3 className="clip-title">{clip.title}</h3>
                    <p className="clip-time">
                      {formatDuration(clip.startTime)} - {formatDuration(clip.endTime)}
                    </p>

                    <div className="clip-actions">
                      <button
                        onClick={() => handleDownload(clip.id, `${clip.title}.mp4`)}
                        className="action-button primary"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      {!clip.isCustom && (
                        <button onClick={() => openExtendCutModal(clip)} className="action-button secondary">
                          <Scissors className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extend/Cut Modal */}
        {editingClip && (
          <ExtendCutModal
            clip={editingClip}
            onClose={() => setEditingClip(null)}
            onSave={handleExtendCut}
            formatDuration={formatDuration}
          />
        )}
      </div>
    </div>
  )
}

export default Dashboard
