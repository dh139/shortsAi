"use client"

import { useState } from "react"
import { Link } from "react-router-dom"
import { Mail, Lock, Eye, EyeOff, Zap, ArrowRight } from "lucide-react"

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({ email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError("")
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        onLogin(data)
      } else {
        setError(data.message || "Login failed")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center px-4 relative overflow-hidden">

      {/* Background ambient glow blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-amber-400/4 blur-[100px] pointer-events-none" />

      {/* Dot grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(circle, #ffffff18 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative w-full max-w-md">

        {/* Logo mark */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-400/20">
            <Zap className="w-5 h-5 text-[#0A0A0B]" strokeWidth={2.5} />
          </div>
          <span className="text-white font-black tracking-tight text-xl">ClipForge</span>
          <span className="ml-auto text-xs font-semibold tracking-widest uppercase text-amber-400/60 border border-amber-400/20 rounded-full px-3 py-1">
            Pro
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#111113] border border-white/[0.07] rounded-2xl p-8 shadow-2xl">

          <div className="mb-8">
            <h1 className="text-2xl font-black tracking-tight text-white mb-1.5">Welcome back</h1>
            <p className="text-sm text-white/40">Sign in to continue forging your clips</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-6 flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-widest uppercase text-white/30">
                Email
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 group-focus-within:text-amber-400 transition-colors duration-200" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-[#0A0A0B] border border-white/[0.07] focus:border-amber-400/40 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-white/20 outline-none transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.08)]"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-widest uppercase text-white/30">
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 group-focus-within:text-amber-400 transition-colors duration-200" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#0A0A0B] border border-white/[0.07] focus:border-amber-400/40 rounded-xl pl-11 pr-12 py-3.5 text-sm text-white placeholder:text-white/20 outline-none transition-all duration-200 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.08)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors duration-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-amber-400 hover:bg-amber-300 disabled:bg-amber-400/40 text-[#0A0A0B] font-black tracking-tight rounded-xl py-3.5 text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-amber-400/15 hover:shadow-amber-400/25 active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-[#0A0A0B]/30 border-t-[#0A0A0B] rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-xs text-white/20 font-medium">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <p className="text-center text-sm text-white/30">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="text-amber-400 font-semibold hover:text-amber-300 transition-colors duration-200"
            >
              Create one free
            </Link>
          </p>
        </div>

        {/* Footer trust line */}
        <p className="text-center text-xs text-white/15 mt-6">
          Trusted by 50,000+ creators worldwide
        </p>
      </div>
    </div>
  )
}

export default Login