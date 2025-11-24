import { Link } from "react-router-dom"
import { Zap, Scissors, Globe, TrendingUp, ArrowRight, Play } from "lucide-react"

const LandingPage = () => {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <Zap className="w-4 h-4" />
            <span>AI-Powered Video Processing</span>
          </div>

          <h1 className="hero-title">
            Transform Long Videos into
            <span className="gradient-text"> Viral Shorts</span>
          </h1>

          <p className="hero-description">
            Advanced AI technology that automatically detects the best moments in your videos and creates engaging short
            clips optimized for social media platforms.
          </p>

          <div className="hero-buttons">
            <Link to="/register" className="primary-button">
              <Play className="w-5 h-5" />
              Start Creating
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/login" className="secondary-button">
              Sign In
            </Link>
          </div>

          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">10K+</span>
              <span className="stat-label">Videos Processed</span>
            </div>
            <div className="stat">
              <span className="stat-number">95%</span>
              <span className="stat-label">Accuracy Rate</span>
            </div>
            <div className="stat">
              <span className="stat-number">2M+</span>
              <span className="stat-label">Clips Generated</span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="video-preview">
            <div className="video-placeholder">
              <Play className="w-16 h-16" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-header">
          <h2 className="section-title">Powerful Features</h2>
          <p className="section-description">Everything you need to create viral content from your long-form videos</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Globe className="w-8 h-8" />
            </div>
            <h3 className="feature-title">Multi-Language Support</h3>
            <p className="feature-description">
              Advanced AI that understands Hindi and English content patterns for optimal clip selection.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Scissors className="w-8 h-8" />
            </div>
            <h3 className="feature-title">Smart Editing</h3>
            <p className="feature-description">
              Drag-based extend and cut features with intelligent scene detection and timing optimization.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h3 className="feature-title">Viral Score Analysis</h3>
            <p className="feature-description">
              AI-powered viral potential scoring to help you choose the most engaging clips for your audience.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2 className="cta-title">Ready to Go Viral?</h2>
          <p className="cta-description">
            Join thousands of creators who are already using our AI to create engaging short-form content.
          </p>
          <Link to="/register" className="cta-button">
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  )
}

export default LandingPage
