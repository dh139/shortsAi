import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"

export default function Navbar({ onStartFree, currentView = "landing", onSwitchView }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = (id) => {
    setMobileMenuOpen(false)
    if (onSwitchView && currentView !== "landing") {
      onSwitchView("landing")
      setTimeout(() => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: "smooth" })
      }, 100)
      return
    }
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <header className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
      <nav
        aria-label="Main Navigation"
        className={`w-full max-w-[840px] flex items-center justify-between px-6 py-2.5 rounded-full transition-all duration-300 ${
          scrolled
            ? "bg-[#121210]/85 backdrop-blur-xl border border-[#2F2F2B] shadow-[0_12px_40px_rgba(0,0,0,0.8)]"
            : "bg-[#121210]/75 backdrop-blur-md border border-[#1C1C1A]"
        }`}
      >
        {/* Wordmark: Short in heading font + ai in italic serif green */}
        <a
          href="#hero"
          onClick={(e) => {
            e.preventDefault()
            scrollToSection("hero")
          }}
          className="flex items-baseline cursor-pointer select-none group"
        >
          <span className="font-['Bricolage_Grotesque'] font-extrabold text-[21px] tracking-[-0.04em] text-[#EDEDE8] group-hover:text-white transition-colors">
            Short
          </span>
          <span className="font-['Instrument_Serif'] italic font-normal text-[24px] text-[#9DFF4A] tracking-[-0.02em] ml-[1px]">
            ai
          </span>
        </a>

        {/* Desktop Links: Process, Features, Pricing */}
        <div className="hidden md:flex items-center gap-7">
          <button
            onClick={() => scrollToSection("process")}
            className="text-[14px] font-['Geist'] font-medium text-[#9A9A94] hover:text-[#EDEDE8] transition-colors cursor-pointer bg-transparent border-0"
          >
            Process
          </button>
          <button
            onClick={() => scrollToSection("features")}
            className="text-[14px] font-['Geist'] font-medium text-[#9A9A94] hover:text-[#EDEDE8] transition-colors cursor-pointer bg-transparent border-0"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection("pricing")}
            className="text-[14px] font-['Geist'] font-medium text-[#9A9A94] hover:text-[#EDEDE8] transition-colors cursor-pointer bg-transparent border-0"
          >
            Pricing
          </button>
        </div>

        {/* CTA Button: Start free */}
        <div className="flex items-center gap-3">
          <button
            onClick={onStartFree}
            className="nav-btn font-['Geist'] font-medium tracking-tight"
          >
            Start free
          </button>

          {/* Mobile hamburger toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-[#EDEDE8] hover:text-[#9DFF4A] p-1.5 focus:outline-none"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-[74px] left-4 right-4 bg-[#0C0C0B] border border-[#2F2F2B] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 z-50">
          <button
            onClick={() => scrollToSection("process")}
            className="text-left text-[15px] font-medium text-[#9A9A94] hover:text-[#EDEDE8] py-2 border-b border-[#1C1C1A]"
          >
            Process
          </button>
          <button
            onClick={() => scrollToSection("features")}
            className="text-left text-[15px] font-medium text-[#9A9A94] hover:text-[#EDEDE8] py-2 border-b border-[#1C1C1A]"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection("pricing")}
            className="text-left text-[15px] font-medium text-[#9A9A94] hover:text-[#EDEDE8] py-2 border-b border-[#1C1C1A]"
          >
            Pricing
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false)
              if (onStartFree) onStartFree()
            }}
            className="btn-primary w-full justify-center mt-1"
          >
            Start free
          </button>
        </div>
      )}
    </header>
  )
}
