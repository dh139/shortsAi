import React, { useState, useEffect } from 'react';
import { Sparkles, Home, LogIn, UserPlus, LayoutDashboard, LogOut, Menu, X, Leaf, History } from 'lucide-react';

const Navbar = ({ user, onLogout, showHistoryBtn, onToggleHistory, clipsCount, videoInfo }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 30) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="navbar-container">
        {/* Logo / Brand */}
        <a href="/" className="navbar-logo">
          <div className="logo-icon">
            <Leaf size={20} fill="#FFFDF7" color="#FFFDF7" />
          </div>
          <span className="logo-text">ShortAI</span>
        </a>

        {/* Desktop Menu */}
        <div className="navbar-menu">
          <div className="desktop-menu">
            {!user && (
              <>
                <a href="/" className="nav-link">
                  <Home size={18} />
                  <span>Home</span>
                </a>
                <a href="/login" className="nav-link">
                  <LogIn size={18} />
                  <span>Login</span>
                </a>
                <a href="/register" className="nav-button">
                  <UserPlus size={18} />
                  <span>Get Started</span>
                </a>
              </>
            )}

            {user && (
              <div className="user-menu">
                {videoInfo && (
                  <div className="navbar-status-pill">
                    <span className="status-dot" />
                    <span>{clipsCount || 0} clips ready</span>
                  </div>
                )}
                {showHistoryBtn && (
                  <button className="nav-btn-history" onClick={onToggleHistory} title="Session History">
                    <History size={18} />
                  </button>
                )}
                <a href="/dashboard" className="nav-link">
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </a>
                <div className="user-avatar-badge">
                  <Sparkles size={14} />
                  <span>{user.name || 'User'}</span>
                </div>
                <button className="logout-btn" onClick={onLogout}>
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="mobile-menu">
          {!user && (
            <>
              <a href="/" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Home size={18} />
                <span>Home</span>
              </a>
              <a href="/login" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                <LogIn size={18} />
                <span>Login</span>
              </a>
              <a href="/register" className="mobile-nav-button" onClick={() => setMobileMenuOpen(false)}>
                <UserPlus size={18} />
                <span>Get Started</span>
              </a>
            </>
          )}

          {user && (
            <>
              <div className="mobile-user-info">
                <Sparkles size={18} />
                <span>{user.name || 'User'}</span>
              </div>
              {videoInfo && (
                <div className="mobile-status-pill">
                  <span className="status-dot" />
                  <span>{clipsCount || 0} clips ready</span>
                </div>
              )}
              {showHistoryBtn && (
                <button className="mobile-history-btn" onClick={() => { onToggleHistory(); setMobileMenuOpen(false); }} title="Session History">
                  <History size={18} />
                  <span>History</span>
                </button>
              )}
              <a href="/dashboard" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </a>
              <button className="mobile-logout-btn" onClick={() => { onLogout(); setMobileMenuOpen(false); }}>
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
