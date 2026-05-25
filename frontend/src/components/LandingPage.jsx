import React, { useState, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { Play, Pause, RotateCcw, RotateCw, Layout, Type, Maximize2, Sparkles, Palette, Share2, ArrowRight, Check, Undo, Redo, PlayCircle } from "lucide-react"

// Decorative Leaf SVG Component to render organic leaves on the page
const LeafDecoration = ({ style, rotation = 0, scale = 1 }) => (
  <div style={{
    position: "absolute",
    pointerEvents: "none",
    zIndex: 1,
    transform: `rotate(${rotation}deg) scale(${scale})`,
    opacity: 0.85,
    ...style
  }}>
    <svg width="220" height="220" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Primary Leaf Leaflet */}
      <path d="M10 90 C30 50, 50 30, 90 10 C70 40, 40 70, 10 90 Z" fill="#306D29" fillOpacity="0.12" stroke="#306D29" strokeWidth="0.5" strokeOpacity="0.2" />
      {/* Leaf Branch Spine */}
      <path d="M10 90 Q45 55, 90 10" stroke="#0D530E" strokeWidth="0.75" strokeOpacity="0.25" />
      {/* Side Veins */}
      <path d="M30 70 Q45 68, 50 65 M40 60 Q55 58, 60 55 M50 50 Q65 48, 70 45" stroke="#306D29" strokeWidth="0.35" strokeOpacity="0.2" />
      {/* Smaller offset leaflet */}
      <path d="M18 80 C32 52, 48 38, 76 25 C60 48, 38 68, 18 80 Z" fill="#0D530E" fillOpacity="0.08" stroke="#0D530E" strokeWidth="0.5" strokeOpacity="0.15" />
    </svg>
  </div>
)

const LandingPage = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(15) // mock start seek
  const [activeFeature, setActiveFeature] = useState("ai") // ai, branding, export
  const videoRef = useRef(null)
  
  // Waveform heights to render a mock audio waveform
  const waveformBars = [12, 18, 8, 15, 24, 32, 16, 12, 28, 38, 14, 18, 22, 12, 8, 24, 36, 42, 28, 18, 12, 24, 16, 8, 14, 22, 38, 48, 24, 12, 18, 24, 16, 12, 22, 34, 18, 8, 14, 20]

  useEffect(() => {
    let interval
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((t) => {
          if (t >= 72) {
            return 15 // Loop back to start
          }
          return t + 0.5
        })
      }, 500)
    }
    return () => clearInterval(interval)
  }, [isPlaying])

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60).toString().padStart(2, "0")
    return `${min}:${sec}`
  }

  // Map progress (15s to 72s total span)
  const progressPct = ((currentTime - 0) / 72) * 100

  return (
    <div className="landing-page-container">
      {/* Corner Leaf Decorations mimicking the screenshot */}
      <LeafDecoration style={{ top: "-20px", left: "-20px" }} rotation={15} scale={1.3} />
      <LeafDecoration style={{ top: "-30px", right: "-30px" }} rotation={105} scale={1.4} />
      <LeafDecoration style={{ bottom: "-10px", left: "-40px" }} rotation={-45} scale={1.2} />
      <LeafDecoration style={{ bottom: "-30px", right: "-30px" }} rotation={225} scale={1.5} />

      {/* Main Hero Wrapper */}
      <div className="hero-grid-wrapper">
        
        {/* Branding & Headline Headers */}
        <div className="hero-text-block">
          <h1 className="hero-editorial-title">
            Transform Videos into engaging <span className="green-emphasis-text">Clips.</span> Instantly with AI.
          </h1>
          <p className="hero-editorial-subtitle">
            Effortlessly create highlight reels and short-form content with ShortAI.
          </p>
          <div className="hero-action-row">
            <Link to="/register" className="pill-action-btn">
              Start Clipping Free
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Floating Mockup Centerpiece */}
        <div className="mock-workspace-card">
          
          {/* Editor Layout Split Screen */}
          <div className="mock-editor-grid">
            
            {/* Left Side: Mock Video Player */}
            <div className="mock-video-pane">
              
              {/* Fake Video Screen */}
              <div className="fake-video-display">
                {/* Visual placeholder using crop of girl editing */}
                <div className="fake-video-content-box">
                  <img 
                    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&auto=format&fit=crop&q=80" 
                    alt="AI Video Editor Mockup"
                    className="fake-video-img"
                  />
                  {/* Floating badge */}
                  <div className="fake-video-badge">
                    <span>AI-Powered Video Highlights</span>
                  </div>
                  
                  {/* Big play overlay */}
                  {!isPlaying && (
                    <button className="fake-big-play" onClick={() => setIsPlaying(true)}>
                      <Play size={20} fill="#FFFDF7" color="#FFFDF7" />
                    </button>
                  )}

                  {/* YouTube watermark indicator in screenshot */}
                  <div className="fake-video-watermark">
                    <span>Watsch on YouTube | Adip</span>
                  </div>
                </div>
              </div>

              {/* Fake Editor Controls */}
              <div className="fake-player-controls">
                <div className="ctrl-group">
                  <button className="ctrl-btn-icon"><Undo size={14} /></button>
                  <button className="ctrl-btn-icon"><Redo size={14} /></button>
                </div>
                
                <div className="ctrl-center">
                  <button className="ctrl-btn-skip"><RotateCcw size={12} /></button>
                  <button className="ctrl-btn-play-pause" onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Pause size={14} fill="#0D530E" color="#0D530E" /> : <Play size={14} fill="#0D530E" color="#0D530E" />}
                  </button>
                  <button className="ctrl-btn-skip"><RotateCw size={12} /></button>
                </div>

                <div className="ctrl-group">
                  <button className="ctrl-btn-icon"><Layout size={14} /></button>
                  <button className="ctrl-btn-icon"><Type size={14} /></button>
                  <button className="ctrl-btn-icon"><Maximize2 size={14} /></button>
                </div>
              </div>

              {/* Seek Timeline Ruler */}
              <div className="fake-timeline-ruler">
                <span className="timeline-lbl-start">Start</span>
                <span className="timeline-lbl-ticks">0:15</span>
                <span className="timeline-lbl-ticks">0:30</span>
                <span className="timeline-lbl-ticks">0:45</span>
                <span className="timeline-lbl-end">1:12</span>
              </div>

              {/* Video Strip Crop Section */}
              <div className="fake-strip-track">
                {/* Start Marker */}
                <div className="crop-marker-start" style={{ left: "20%" }}>
                  <div className="marker-flag">Start</div>
                  <div className="marker-handle">||</div>
                </div>

                {/* Crop boundary overlay */}
                <div className="crop-boundary-fill" style={{ left: "20%", width: "60%" }} />

                {/* End Marker */}
                <div className="crop-marker-end" style={{ left: "80%" }}>
                  <div className="marker-flag">End</div>
                  <div className="marker-handle">||</div>
                </div>

                {/* Thumbnails strip */}
                <div className="fake-thumbs-strip">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="fake-thumb-frame" style={{
                      backgroundImage: `url(https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=150&auto=format&fit=crop&q=60)`
                    }} />
                  ))}
                </div>
              </div>

              {/* Mock Audio Waveform */}
              <div className="fake-audio-waveform">
                <div className="waveform-inner">
                  {waveformBars.map((height, i) => {
                    const isActive = i >= 8 && i <= 32 // matching the 20% to 80% selection
                    return (
                      <div 
                        key={i} 
                        className="waveform-bar" 
                        style={{ 
                          height: `${height}%`,
                          background: isActive ? "#306D29" : "rgba(13, 83, 14, 0.12)" 
                        }} 
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right Side: Feature Information Cards */}
            <div className="mock-features-pane">
              {[
                {
                  id: "ai",
                  icon: <Sparkles size={20} className="feat-icon-inner" />,
                  title: "AI Detection",
                  desc: "Automated Highlight Identification"
                },
                {
                  id: "branding",
                  icon: <Palette size={20} className="feat-icon-inner" />,
                  title: "Custom Branding",
                  desc: "Personalize with Logos & Colors"
                },
                {
                  id: "export",
                  icon: <Share2 size={20} className="feat-icon-inner" />,
                  title: "Easy Export",
                  desc: "Quick Export to Socials"
                }
              ].map((feat) => {
                const isActive = activeFeature === feat.id
                return (
                  <div 
                    key={feat.id} 
                    className={`fake-feature-card ${isActive ? "active" : ""}`}
                    onClick={() => setActiveFeature(feat.id)}
                  >
                    <div className="fake-feature-icon-box">
                      {feat.icon}
                    </div>
                    <div className="fake-feature-text">
                      <h4 className="fake-feature-title">{feat.title}</h4>
                      <p className="fake-feature-desc">{feat.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer section matching screenshot */}
        <footer className="editorial-footer">
          <div className="footer-top-line" />
          <div className="footer-content">
            <div className="footer-logo">
              <span className="logo-icon-footer">🌱</span>
              <span className="logo-text-footer">ShortAI</span>
            </div>
            <div className="footer-nav">
              <a href="#features" className="footer-link">Features</a>
              <a href="#works" className="footer-link">How it Works</a>
              <a href="#pricing" className="footer-link">Pricing</a>
              <a href="#studies" className="footer-link">Case Studies</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p className="copyright-text">Copyright 2022 - ShortAI Cormateal Inc. All rights reserved.</p>
          </div>
        </footer>

      </div>
    </div>
  )
}

export default LandingPage
