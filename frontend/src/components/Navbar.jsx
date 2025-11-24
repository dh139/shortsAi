
import React, { useState } from 'react';
import { Sparkles, Home, LogIn, UserPlus, LayoutDashboard, LogOut, Menu, X, Zap } from 'lucide-react';

const Navbar = ({ user, onLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo / Brand */}
        <a href="/" className="navbar-logo">
          <div className="logo-icon">
            <Zap size={24} />
          </div>
          <span className="logo-text">YT Shorts AI</span>
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
                <a href="/dashboard" className="nav-link">
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </a>
                <div className="user-avatar">
                  <Sparkles size={18} />
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
              <a href="/" className="mobile-nav-link">
                <Home size={18} />
                <span>Home</span>
              </a>
              <a href="/login" className="mobile-nav-link">
                <LogIn size={18} />
                <span>Login</span>
              </a>
              <a href="/register" className="mobile-nav-button">
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
              <a href="/dashboard" className="mobile-nav-link">
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </a>
              <button className="mobile-logout-btn" onClick={onLogout}>
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
