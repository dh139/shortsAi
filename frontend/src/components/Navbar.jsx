"use client"

import { useState, useEffect, useRef } from "react"
import { Home, LogIn, UserPlus, LayoutDashboard, LogOut, Menu, X, History, Zap, ChevronDown } from "lucide-react"

const Navbar = ({ user, onLogout, showHistoryBtn, onToggleHistory, clipsCount, videoInfo }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [activeLink, setActiveLink] = useState("/")
  const userMenuRef = useRef(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    setActiveLink(window.location.pathname)
  }, [])

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const navLinks = user
    ? [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }]
    : [
        { href: "/", label: "Home", icon: Home },
        { href: "/login", label: "Sign In", icon: LogIn },
      ]

  return (
    <>
      {/* ─── DESKTOP FLOATING NAV ─────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4 transition-all duration-500 ${
          mobileMenuOpen ? "pt-0" : ""
        }`}
      >
        <div
          className={`hidden md:flex items-center gap-1 rounded-2xl px-3 py-2.5 transition-all duration-500 ${
            scrolled
              ? "bg-[#0E0E10]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
              : "bg-[#111113]/80 backdrop-blur-xl border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
          }`}
          style={{ minWidth: "min(720px, calc(100vw - 2rem))" }}
        >
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 mr-2 group px-2">
            <div className="relative w-7 h-7 flex items-center justify-center">
              <div className="absolute inset-0 bg-amber-400 rounded-lg opacity-100" />
              <Zap size={14} className="text-[#0A0A0B] relative z-10" strokeWidth={3} />
            </div>
            <span className="text-[15px] font-black tracking-tight text-white">
              Clip<span className="text-amber-400">Forge</span>
            </span>
          </a>

          {/* Separator */}
          <div className="w-px h-5 bg-white/[0.07] mx-1" />

          {/* Nav links */}
          <div className="flex items-center gap-0.5 flex-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = activeLink === href
              return (
                <a
                  key={href}
                  href={href}
                  onClick={() => setActiveLink(href)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                    isActive
                      ? "text-white bg-white/[0.08]"
                      : "text-white/40 hover:text-white/80 hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon size={13} strokeWidth={2} />
                  {label}
                  {isActive && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
                  )}
                </a>
              )
            })}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">
            {/* Live clips badge */}
            {user && videoInfo && (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/15 rounded-full px-3 py-1.5 text-[11px] font-bold text-emerald-400 tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {clipsCount || 0} clips
              </div>
            )}

            {/* History button */}
            {user && showHistoryBtn && (
              <button
                onClick={onToggleHistory}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white/30 hover:text-amber-400 hover:bg-amber-400/10 transition-all duration-200"
                title="History"
              >
                <History size={14} />
              </button>
            )}

            {/* Auth CTA or user menu */}
            {!user ? (
              <a
                href="/register"
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-[#0A0A0B] text-[13px] font-black rounded-xl transition-all duration-200 shadow-[0_0_16px_rgba(251,191,36,0.25)] hover:shadow-[0_0_24px_rgba(251,191,36,0.35)] active:scale-[0.97]"
              >
                <UserPlus size={13} strokeWidth={2.5} />
                Get Started
              </a>
            ) : (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-200 ${
                    userMenuOpen
                      ? "bg-white/[0.08] border-white/[0.12]"
                      : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.10]"
                  }`}
                >
                  <div className="w-6 h-6 rounded-lg bg-amber-400 flex items-center justify-center text-[10px] font-black text-[#0A0A0B]">
                    {(user.name || "U")[0].toUpperCase()}
                  </div>
                  <span className="text-[13px] font-semibold text-white/70 max-w-[80px] truncate">
                    {user.name || "User"}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`text-white/30 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#111113] border border-white/[0.08] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-[12px] font-black text-white truncate">{user.name || "User"}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">Pro Plan</p>
                    </div>
                    <div className="p-1.5">
                      <a
                        href="/dashboard"
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <LayoutDashboard size={14} />
                        Dashboard
                      </a>
                      <button
                        onClick={() => { onLogout(); setUserMenuOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/[0.08] transition-all duration-150"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── MOBILE NAV BAR ───────────────────────────────────────── */}
        <div
          className={`md:hidden w-full flex items-center justify-between px-4 py-3 rounded-2xl mx-0 transition-all duration-500 ${
            scrolled || mobileMenuOpen
              ? "bg-[#0E0E10]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
              : "bg-[#111113]/80 backdrop-blur-xl border border-white/[0.06]"
          } ${mobileMenuOpen ? "rounded-b-none border-b-0" : ""}`}
        >
          <a href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-400 rounded-lg flex items-center justify-center">
              <Zap size={14} className="text-[#0A0A0B]" strokeWidth={3} />
            </div>
            <span className="text-[15px] font-black tracking-tight text-white">
              Clip<span className="text-amber-400">Forge</span>
            </span>
          </a>

          <div className="flex items-center gap-2">
            {user && videoInfo && (
              <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/15 rounded-full px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {clipsCount || 0}
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>
      </nav>

      {/* ─── MOBILE DROPDOWN PANEL ────────────────────────────────── */}
      <div
        className={`md:hidden fixed left-4 right-4 z-40 overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
        style={{ top: "calc(4rem + 16px)" }}
      >
        <div className="bg-[#0E0E10]/98 backdrop-blur-2xl border border-white/[0.08] border-t-0 rounded-b-2xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="p-3 space-y-1">
            {!user ? (
              <>
                <a href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-all" onClick={() => setMobileMenuOpen(false)}>
                  <Home size={15} /> Home
                </a>
                <a href="/login" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-all" onClick={() => setMobileMenuOpen(false)}>
                  <LogIn size={15} /> Sign In
                </a>
                <div className="pt-1 pb-1">
                  <a
                    href="/register"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 hover:bg-amber-300 text-[#0A0A0B] text-[14px] font-black rounded-xl transition-all shadow-[0_0_20px_rgba(251,191,36,0.2)]"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <UserPlus size={15} strokeWidth={2.5} />
                    Get Started Free
                  </a>
                </div>
              </>
            ) : (
              <>
                {/* User info row */}
                <div className="flex items-center gap-3 px-4 py-3 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-[13px] font-black text-[#0A0A0B]">
                    {(user.name || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-white">{user.name || "User"}</p>
                    <p className="text-[11px] text-white/30">Pro Plan</p>
                  </div>
                </div>

                <div className="h-px bg-white/[0.05] mx-4 mb-1" />

                {showHistoryBtn && (
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-all"
                    onClick={() => { onToggleHistory(); setMobileMenuOpen(false) }}
                  >
                    <History size={15} /> History
                  </button>
                )}
                <a
                  href="/dashboard"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium text-white/50 hover:text-white hover:bg-white/[0.05] transition-all"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LayoutDashboard size={15} /> Dashboard
                </a>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium text-red-400/50 hover:text-red-400 hover:bg-red-500/[0.07] transition-all"
                  onClick={() => { onLogout(); setMobileMenuOpen(false) }}
                >
                  <LogOut size={15} /> Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Navbar