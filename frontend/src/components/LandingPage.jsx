import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Play, Pause, RotateCcw, RotateCw, Layout, Type, Maximize2,
  Sparkles, Palette, Share2, ArrowRight, Check, Undo, Redo, Zap,
  Scissors, Captions, TrendingUp, Globe, Star, Quote, ChevronRight,
  Upload, Cpu, Download, Users, Clock, Award, Flame
} from "lucide-react";

const LandingPage = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(15);
  const [activeFeature, setActiveFeature] = useState("ai");
  const [activePlan, setActivePlan] = useState("pro");

  const waveformBars = [12, 18, 8, 15, 24, 32, 16, 12, 28, 38, 14, 18, 22, 12, 8, 24, 36, 42, 28, 18, 12, 24, 16, 8, 14, 22, 38, 48, 24, 12, 18, 24, 16, 12, 22, 34, 18, 8, 14, 20];

  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((t) => (t >= 72 ? 15 : t + 0.5));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const progressPct = ((currentTime - 0) / 72) * 100;

  const features = [
    { id: "ai", icon: <Sparkles size={18} />, title: "AI Detection", desc: "Auto highlight identification" },
    { id: "branding", icon: <Palette size={18} />, title: "Custom Branding", desc: "Logos, fonts & color palettes" },
    { id: "export", icon: <Share2 size={18} />, title: "Instant Export", desc: "One-click to all socials" },
  ];

  const stats = [
    { value: "2.4M+", label: "Clips Generated" },
    { value: "98%", label: "Faster Editing" },
    { value: "47K+", label: "Creators" },
  ];

  const steps = [
    {
      number: "01",
      icon: <Upload size={22} />,
      title: "Drop your URL",
      desc: "Paste any YouTube, Loom, or Zoom link. ClipForge fetches and processes the video automatically — no downloads needed.",
      tag: "< 10 seconds",
    },
    {
      number: "02",
      icon: <Cpu size={22} />,
      title: "AI finds the gold",
      desc: "Our model scans for energy spikes, emotional peaks, and hook moments. Every clip is scored for viral potential before you even see it.",
      tag: "AI powered",
    },
    {
      number: "03",
      icon: <Scissors size={22} />,
      title: "Auto-crop & caption",
      desc: "9:16 smart reframe keeps your speaker centered. Whisper captions burn word-by-word with 10+ premium styles to choose from.",
      tag: "1080p output",
    },
    {
      number: "04",
      icon: <Download size={22} />,
      title: "Export & go viral",
      desc: "Download all clips in one click or push directly to TikTok, Instagram Reels, and YouTube Shorts from the dashboard.",
      tag: "All platforms",
    },
  ];

  const testimonials = [
    {
      name: "Priya Mehta",
      handle: "@priyacreates",
      avatar: "PM",
      role: "YouTube Creator · 1.2M subs",
      stars: 5,
      text: "I went from spending 4 hours editing one video to getting 8 clips in under 15 minutes. ClipForge literally changed my workflow overnight.",
      metric: "8× faster",
    },
    {
      name: "Arjun Kapoor",
      handle: "@arjunbuilds",
      avatar: "AK",
      role: "Startup Founder · SaaS",
      stars: 5,
      text: "We clip our podcast every week. Before ClipForge we had one editor doing it manually. Now it's fully automated and the clips actually perform better.",
      metric: "3× more views",
    },
    {
      name: "Shreya Nair",
      handle: "@shreyalifts",
      avatar: "SN",
      role: "Fitness Influencer · 400K",
      stars: 5,
      text: "The Hindi caption support is insane. My regional audience grew 60% just from Reels I never would've made without this tool.",
      metric: "+60% reach",
    },
    {
      name: "Rahul Das",
      handle: "@rahulpodcast",
      avatar: "RD",
      role: "Podcast Host · 200 eps",
      stars: 5,
      text: "Every episode now gets 6–10 clips automatically. My team was skeptical but after the first week they were fully converted. Best $29 I spend monthly.",
      metric: "6–10 clips/ep",
    },
  ];

  const plans = [
    {
      id: "starter",
      name: "Starter",
      price: "₹0",
      period: "forever",
      desc: "Perfect for trying it out",
      features: ["5 clips / month", "720p export", "3 caption styles", "Basic AI scoring", "Email support"],
      cta: "Start Free",
      highlight: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: "₹2,499",
      period: "/ month",
      desc: "For serious creators",
      features: ["Unlimited clips", "1080p + 4K export", "10 caption styles", "Advanced AI scoring", "Custom branding", "Priority support", "Direct social publish"],
      cta: "Start Pro Trial",
      highlight: true,
      badge: "Most Popular",
    },
    {
      id: "team",
      name: "Team",
      price: "₹7,999",
      period: "/ month",
      desc: "For agencies & studios",
      features: ["Everything in Pro", "5 team seats", "Shared workspace", "White-label export", "API access", "Dedicated manager", "SLA guarantee"],
      cta: "Talk to Sales",
      highlight: false,
    },
  ];

  const featureGrid = [
    { icon: <Zap size={20} />, title: "AI Hook Detection", desc: "Automatically identifies the 3-8 seconds that make viewers stop scrolling." },
    { icon: <Scissors size={20} />, title: "Smart 9:16 Crop", desc: "Face-tracking reframe keeps your speaker perfectly centered across all cuts." },
    { icon: <Captions size={20} />, title: "Whisper Captions", desc: "Word-by-word animated captions in 12+ languages with 10 premium styles." },
    { icon: <TrendingUp size={20} />, title: "Viral Score", desc: "Every clip gets a 0–100 virality score based on energy, pacing and hook strength." },
    { icon: <Globe size={20} />, title: "Hindi + English", desc: "Full bilingual caption support for creators targeting regional audiences." },
    { icon: <Sparkles size={20} />, title: "10 Caption Themes", desc: "Bold, minimal, fire, neon — match your brand aesthetic in one click." },
    { icon: <Palette size={20} />, title: "Custom Branding", desc: "Add your logo, brand colors and lower thirds to every export automatically." },
    { icon: <Share2 size={20} />, title: "Direct Publishing", desc: "Push clips straight to TikTok, Instagram Reels and YouTube Shorts." },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white overflow-hidden">

      {/* Grid background */}
      <div className="fixed inset-0 opacity-[0.025]" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "72px 72px" }} />

      {/* Glow spots */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.07] pointer-events-none" style={{ background: "radial-gradient(circle, #F59E0B, transparent 70%)" }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.05] pointer-events-none" style={{ background: "radial-gradient(circle, #8B5CF6, transparent 70%)" }} />

      {/* Navbar spacer */}
      <div className="h-20" />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── HERO ──────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes heroFadeUp { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
        @keyframes floatA { 0%,100% { transform:translateY(0px) rotate(-2deg); } 50% { transform:translateY(-14px) rotate(-2deg); } }
        @keyframes floatB { 0%,100% { transform:translateY(0px) rotate(2deg); } 50% { transform:translateY(-10px) rotate(2deg); } }
        @keyframes floatC { 0%,100% { transform:translateY(0px) rotate(-1deg); } 50% { transform:translateY(-18px) rotate(-1deg); } }
        @keyframes pulseRing { 0%,100% { opacity:0.15; transform:scale(1); } 50% { opacity:0.04; transform:scale(1.08); } }
        @keyframes shimmer { 0% { background-position:200% center; } 100% { background-position:-200% center; } }
        .hero-word { animation: heroFadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .float-a { animation: floatA 6s ease-in-out infinite; }
        .float-b { animation: floatB 8s ease-in-out infinite; }
        .float-c { animation: floatC 7s ease-in-out 1s infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 30%, #fde68a 50%, #fbbf24 70%, #f59e0b 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
      `}</style>

      <section className="relative z-10 overflow-hidden">

        {/* ── Large ambient orbs ── */}
        <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(245,158,11,0.09) 0%, transparent 65%)" }} />
        <div className="absolute top-[60px] left-[8%] w-[320px] h-[320px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(245,158,11,0.05), transparent 70%)", animation: "pulseRing 5s ease-in-out infinite" }} />
        <div className="absolute top-[100px] right-[6%] w-[260px] h-[260px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.06), transparent 70%)", animation: "pulseRing 7s ease-in-out 2s infinite" }} />

        <div className="max-w-7xl mx-auto px-6 pt-20 pb-0">

          {/* ── CENTER COPY BLOCK ── */}
          <div className="text-center max-w-4xl mx-auto mb-16">

            {/* Eyebrow pill */}
            <div className="hero-word inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px] font-bold tracking-widest uppercase mb-8" style={{ animationDelay: "0ms" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              AI-Powered Shorts Engine
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>

            {/* Main headline */}
            <h1 className="font-black tracking-tighter leading-[1.0] mb-8">
              <div className="hero-word text-6xl lg:text-8xl text-white mb-1" style={{ animationDelay: "80ms" }}>
                Turn long videos
              </div>
              <div className="hero-word text-6xl lg:text-8xl mb-1" style={{ animationDelay: "160ms" }}>
                <span className="shimmer-text">into viral clips</span>
              </div>
              <div className="hero-word text-6xl lg:text-8xl text-white/15" style={{ animationDelay: "240ms" }}>
                in seconds.
              </div>
            </h1>

            {/* Subtext */}
            <p className="hero-word text-[17px] text-white/40 leading-relaxed max-w-2xl mx-auto mb-10" style={{ animationDelay: "320ms" }}>
              Drop any YouTube, Loom, or Zoom URL. ClipForge's AI finds the gold, auto-crops to 9:16, burns word-by-word captions, and delivers 1080p clips ready to post.
            </p>

            {/* CTA row */}
            <div className="hero-word flex flex-wrap items-center justify-center gap-4 mb-12" style={{ animationDelay: "400ms" }}>
              <Link to="/register" className="group relative inline-flex items-center gap-2.5 px-8 py-4 bg-amber-400 hover:bg-amber-300 text-[#0A0A0B] text-[15px] font-black rounded-2xl transition-all duration-200 hover:scale-[1.03] shadow-[0_0_40px_rgba(245,158,11,0.25)] hover:shadow-[0_0_60px_rgba(245,158,11,0.4)]">
                <Zap size={16} strokeWidth={3} />
                Start Forging Free
                <ArrowRight size={15} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <button
                className="inline-flex items-center gap-2.5 px-7 py-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] text-white/60 hover:text-white text-[15px] font-semibold rounded-2xl transition-all duration-200"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                <div className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center">
                  {isPlaying ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" className="ml-0.5" />}
                </div>
                Watch 60s Demo
              </button>
            </div>

            {/* Avatar social proof row */}
            <div className="hero-word flex items-center justify-center gap-4" style={{ animationDelay: "480ms" }}>
              <div className="flex items-center -space-x-2.5">
                {["PM", "AK", "SN", "RD", "VK"].map((init, i) => (
                  <div
                    key={init}
                    className="w-8 h-8 rounded-full border-2 border-[#0A0A0B] flex items-center justify-center text-[9px] font-black text-[#0A0A0B]"
                    style={{
                      background: ["#F59E0B","#10B981","#8B5CF6","#F59E0B","#06B6D4"][i],
                      zIndex: 5 - i,
                    }}
                  >
                    {init}
                  </div>
                ))}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1 mb-0.5">
                  {[...Array(5)].map((_, i) => <Star key={i} size={11} className="text-amber-400 fill-amber-400" />)}
                  <span className="text-[12px] font-black text-white/60 ml-1">4.9</span>
                </div>
                <p className="text-[12px] text-white/30">Loved by <span className="text-white/55 font-semibold">47,000+</span> creators</p>
              </div>
            </div>
          </div>

          {/* ── FLOATING CARDS + EDITOR MOCKUP ── */}
          <div className="relative flex items-end justify-center gap-5 pb-0">

            {/* ── Left floating clip card (9:16) ── */}
            <div className="float-a hidden lg:block w-[148px] flex-shrink-0 mb-10 self-end">
              <div className="relative bg-[#111113] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "9/16" }}>
                <img src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300&auto=format&fit=crop&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                {/* AI badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/30 backdrop-blur-sm">
                  <Zap size={8} className="text-amber-400" strokeWidth={3} />
                  <span className="text-amber-400 text-[8px] font-black">HOOK</span>
                </div>
                {/* Score */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/50 border border-white/10 backdrop-blur-sm">
                  <span className="text-emerald-400 text-[8px] font-black">96%</span>
                </div>
                {/* Caption */}
                <div className="absolute bottom-3 left-2 right-2">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1.5 text-center">
                    <span className="text-white text-[9px] font-black">This changed <span className="text-amber-400">EVERYTHING</span></span>
                  </div>
                </div>
                {/* Platform tag */}
                <div className="absolute bottom-[-1px] left-0 right-0 h-6 bg-gradient-to-t from-[#111113] to-transparent" />
              </div>
              <div className="mt-2 px-1">
                <div className="text-[9px] font-bold text-white/30">TikTok · 1080p</div>
                <div className="text-[8px] text-white/15 mt-0.5">0:37 duration</div>
              </div>
            </div>

            {/* ── CENTER Editor Mockup ── */}
            <div className="relative flex-shrink-0 w-full max-w-[680px]">
              {/* Glow behind */}
              <div className="absolute -inset-6 bg-amber-500/6 rounded-3xl blur-3xl pointer-events-none" />

              <div className="relative bg-[#111113] border border-white/[0.09] rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
                {/* Titlebar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0D0D0F]">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  <span className="ml-3 text-[11px] font-mono text-white/20">ClipForge Editor — project_q4_launch.mp4</span>
                  {/* Live processing badge */}
                  <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] font-bold text-emerald-400">Processing</span>
                  </div>
                </div>

                <div className="flex">
                  {/* Video pane */}
                  <div className="flex-1 p-4">
                    <div className="relative bg-black rounded-xl overflow-hidden aspect-video mb-3">
                      <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&auto=format&fit=crop&q=80" alt="Video preview" className="w-full h-full object-cover opacity-70" />
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                        <div className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                          <span className="text-white font-black text-sm tracking-wide">the <span className="text-amber-400">BEST</span> moment</span>
                        </div>
                      </div>
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm">
                        <Zap size={10} className="text-amber-400" strokeWidth={3} />
                        <span className="text-amber-400 text-[10px] font-bold">AI Hook</span>
                      </div>
                      <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10">
                        <span className="text-emerald-400 text-[10px] font-black">🔥 94%</span>
                      </div>
                      {!isPlaying && (
                        <button className="absolute inset-0 flex items-center justify-center group" onClick={() => setIsPlaying(true)}>
                          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-white/20 transition-all">
                            <Play size={16} fill="white" color="white" />
                          </div>
                        </button>
                      )}
                      {isPlaying && (
                        <button className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" onClick={() => setIsPlaying(false)}>
                          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                            <Pause size={16} fill="white" color="white" />
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-1">
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><Undo size={12} /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><Redo size={12} /></button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><RotateCcw size={12} /></button>
                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-all">
                          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><RotateCw size={12} /></button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><Layout size={12} /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><Type size={12} /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 transition-colors"><Maximize2 size={12} /></button>
                      </div>
                    </div>

                    <div className="relative h-1 bg-white/[0.06] rounded-full mb-2 cursor-pointer group">
                      <div className="h-full rounded-full bg-amber-400/80 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                      <div className="absolute -top-2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_8px_rgba(245,158,11,0.8)]" style={{ left: `${progressPct}%` }} />
                    </div>

                    <div className="flex justify-between text-[9px] font-mono text-white/20 mb-3">
                      <span>0:00</span><span>0:15</span><span>0:30</span><span>0:45</span><span>1:12</span>
                    </div>

                    <div className="relative h-10 rounded-lg overflow-hidden bg-black/30 border border-white/[0.05] mb-2">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0 overflow-hidden" style={{ left: `${i * 12.5}%`, width: "12.5%", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                          <div className="w-full h-full opacity-40" style={{ backgroundImage: "url(https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=60&auto=format&fit=crop)", backgroundSize: "cover", backgroundPosition: "center" }} />
                        </div>
                      ))}
                      <div className="absolute inset-y-0 border-2 border-amber-400/70 bg-amber-400/10 rounded" style={{ left: "20%", right: "20%" }} />
                      <div className="absolute inset-y-0 w-1 bg-amber-400 rounded-l cursor-ew-resize" style={{ left: "20%" }} />
                      <div className="absolute inset-y-0 w-1 bg-amber-400 rounded-r cursor-ew-resize" style={{ right: "20%" }} />
                    </div>

                    <div className="flex items-end gap-[1.5px] h-8 px-0.5">
                      {waveformBars.map((height, i) => {
                        const isActive = i >= 8 && i <= 32;
                        return (
                          <div key={i} className="flex-1 rounded-[1px] transition-all duration-300" style={{ height: `${height}%`, background: isActive ? "#F59E0B" : "rgba(255,255,255,0.08)" }} />
                        );
                      })}
                    </div>
                  </div>

                  {/* Right sidebar */}
                  <div className="w-44 border-l border-white/[0.06] p-3 flex flex-col gap-2">
                    <div className="text-[9px] font-bold tracking-widest uppercase text-white/20 mb-1 px-1">AI Tools</div>
                    {features.map((feat) => {
                      const isActive = activeFeature === feat.id;
                      return (
                        <button key={feat.id} onClick={() => setActiveFeature(feat.id)} className={`w-full text-left p-2.5 rounded-xl transition-all duration-200 ${isActive ? "bg-amber-500/10 border border-amber-500/25" : "hover:bg-white/[0.04] border border-transparent"}`}>
                          <div className={`mb-1.5 ${isActive ? "text-amber-400" : "text-white/30"}`}>{feat.icon}</div>
                          <div className={`text-[11px] font-bold mb-0.5 ${isActive ? "text-white" : "text-white/40"}`}>{feat.title}</div>
                          <div className="text-[9px] text-white/25 leading-tight">{feat.desc}</div>
                          {isActive && (
                            <div className="mt-2 flex items-center gap-1">
                              <Check size={8} className="text-amber-400" strokeWidth={3} />
                              <span className="text-[9px] text-amber-400/70 font-semibold">Active</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                    <div className="mt-auto pt-3 border-t border-white/[0.05] space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-white/25">Duration</span>
                        <span className="text-[9px] font-mono font-bold text-white/50">0:42</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-white/25">Score</span>
                        <span className="text-[9px] font-mono font-bold text-amber-400">94%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-white/25">Quality</span>
                        <span className="text-[9px] font-mono font-bold text-emerald-400">1080p</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Floating stat chips below editor ── */}
              <div className="flex items-center justify-center gap-3 mt-5">
                {stats.map(({ value, label }) => (
                  <div key={label} className="flex items-center gap-2 px-4 py-2 bg-[#111113] border border-white/[0.07] rounded-full">
                    <span className="text-[15px] font-black text-amber-400">{value}</span>
                    <span className="text-[11px] text-white/30 font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right floating clip card (9:16) ── */}
            <div className="float-b hidden lg:block w-[148px] flex-shrink-0 mb-16 self-end">
              <div className="relative bg-[#111113] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: "9/16" }}>
                <img src="https://images.unsplash.com/photo-1590004953392-5aba2e72269a?w=300&auto=format&fit=crop&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-400/20 border border-purple-400/30 backdrop-blur-sm">
                  <Sparkles size={8} className="text-purple-400" />
                  <span className="text-purple-400 text-[8px] font-black">VIRAL</span>
                </div>
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/50 border border-white/10 backdrop-blur-sm">
                  <span className="text-amber-400 text-[8px] font-black">91%</span>
                </div>
                <div className="absolute bottom-3 left-2 right-2">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1.5 text-center">
                    <span className="text-white text-[9px] font-black">You need to <span className="text-amber-400">HEAR</span> this</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 px-1">
                <div className="text-[9px] font-bold text-white/30">Reels · 1080p</div>
                <div className="text-[8px] text-white/15 mt-0.5">0:28 duration</div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom fade into next section */}
        <div className="h-20 bg-gradient-to-b from-transparent to-[#0A0A0B]" />
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── FEATURE CHIP STRIP ────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 border-y border-white/[0.05] bg-white/[0.015] py-14">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { icon: <Zap size={15} />, label: "AI Hook Detection" },
              { icon: <Scissors size={15} />, label: "Smart 9:16 Crop" },
              { icon: <Captions size={15} />, label: "Whisper Captions" },
              { icon: <TrendingUp size={15} />, label: "Viral Scoring" },
              { icon: <Globe size={15} />, label: "Hindi & English" },
              { icon: <Sparkles size={15} />, label: "10 Caption Styles" },
              { icon: <Palette size={15} />, label: "Custom Branding" },
              { icon: <Share2 size={15} />, label: "Direct Publish" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-amber-500/20 hover:bg-amber-500/[0.03] transition-all group cursor-default">
                <div className="text-amber-400/50 group-hover:text-amber-400 transition-colors">{icon}</div>
                <span className="text-[10px] font-semibold text-white/30 group-hover:text-white/60 transition-colors text-center leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-28">
        {/* Section header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/40 text-[11px] font-bold tracking-widest uppercase mb-5">
            <Clock size={10} />
            From URL to Viral in Minutes
          </div>
          <h2 className="text-4xl lg:text-5xl font-black tracking-tighter text-white mb-4">
            How ClipForge works
          </h2>
          <p className="text-white/35 text-[16px] max-w-lg mx-auto leading-relaxed">
            Four steps. Zero editing skills required. Clips that actually perform.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step, idx) => (
            <div key={step.number} className="relative group">
              {/* Connector line (desktop) */}
              {idx < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[calc(100%-0px)] w-5 h-px bg-white/[0.08] z-10" style={{ left: "calc(100% + 10px)", width: "calc(100% - 20px)", top: "40px" }} />
              )}

              <div className="relative h-full bg-[#111113] border border-white/[0.06] hover:border-amber-500/20 rounded-2xl p-6 transition-all duration-300 group-hover:bg-[#141416]">
                {/* Number */}
                <div className="text-[48px] font-black text-white/[0.04] leading-none absolute top-4 right-5 select-none">{step.number}</div>

                {/* Icon circle */}
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center text-amber-400 mb-5 group-hover:bg-amber-500/15 transition-colors">
                  {step.icon}
                </div>

                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] font-bold text-white/30 mb-4">
                  <ChevronRight size={9} className="text-amber-400" />
                  {step.tag}
                </div>

                <h3 className="text-[16px] font-black text-white mb-2.5">{step.title}</h3>
                <p className="text-[13px] text-white/35 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── FEATURE DEEP DIVE ─────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.05] bg-[#0C0C0E] py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/15 text-amber-400 text-[11px] font-bold tracking-widest uppercase mb-5">
              <Sparkles size={10} />
              Everything You Need
            </div>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter text-white mb-4">
              Built for creators who<br />
              <span className="text-amber-400">don't have time to edit</span>
            </h2>
            <p className="text-white/35 text-[16px] max-w-lg mx-auto">
              Every feature is designed to eliminate the boring parts of content creation.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featureGrid.map(({ icon, title, desc }) => (
              <div key={title} className="group p-5 rounded-2xl bg-[#111113] border border-white/[0.06] hover:border-amber-500/20 hover:bg-[#131315] transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-amber-500/8 border border-amber-500/10 flex items-center justify-center text-amber-400/60 group-hover:text-amber-400 group-hover:bg-amber-500/12 transition-all mb-4">
                  {icon}
                </div>
                <h4 className="text-[14px] font-black text-white mb-1.5">{title}</h4>
                <p className="text-[12px] text-white/30 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── SOCIAL PROOF ──────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-white/40 text-[11px] font-bold tracking-widest uppercase mb-5">
              <Users size={10} />
              47,000+ Creators Trust ClipForge
            </div>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter text-white mb-4">
              Real results.<br />
              <span className="text-white/25">Real creators.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {testimonials.map((t) => (
              <div key={t.name} className="relative group bg-[#111113] border border-white/[0.06] hover:border-amber-500/15 rounded-2xl p-7 transition-all duration-300">
                {/* Quote icon */}
                <Quote size={28} className="text-amber-400/10 absolute top-6 right-6" />

                {/* Stars */}
                <div className="flex items-center gap-0.5 mb-4">
                  {[...Array(t.stars)].map((_, i) => (
                    <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>

                <p className="text-[14px] text-white/55 leading-relaxed mb-6">"{t.text}"</p>

                {/* Metric chip */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/8 border border-emerald-500/15 text-[11px] font-black text-emerald-400 mb-6">
                  <TrendingUp size={10} />
                  {t.metric}
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.05]">
                  <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-[11px] font-black text-[#0A0A0B]">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-white">{t.name}</p>
                    <p className="text-[11px] text-white/30">{t.role}</p>
                  </div>
                  <span className="ml-auto text-[11px] text-white/20 font-mono">{t.handle}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── PRICING ───────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.05] bg-[#0C0C0E] py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/15 text-amber-400 text-[11px] font-bold tracking-widest uppercase mb-5">
              <Award size={10} />
              Simple, Honest Pricing
            </div>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter text-white mb-4">
              Start free.<br />
              <span className="text-amber-400">Scale when you're ready.</span>
            </h2>
            <p className="text-white/35 text-[16px] max-w-lg mx-auto">
              No hidden fees. No contracts. Cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-7 transition-all duration-300 ${
                  plan.highlight
                    ? "bg-[#111113] border-2 border-amber-400/40 shadow-[0_0_48px_rgba(245,158,11,0.08)]"
                    : "bg-[#111113] border border-white/[0.07] hover:border-white/[0.12]"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-[10px] font-black text-[#0A0A0B] tracking-wide">
                    <Flame size={9} strokeWidth={3} />
                    {plan.badge}
                  </div>
                )}

                <div className="mb-6">
                  <p className="text-[11px] font-bold tracking-widest uppercase text-white/30 mb-1">{plan.name}</p>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-4xl font-black text-white">{plan.price}</span>
                    <span className="text-[13px] text-white/30 font-medium">{plan.period}</span>
                  </div>
                  <p className="text-[12px] text-white/25">{plan.desc}</p>
                </div>

                <div className="space-y-3 mb-8">
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${plan.highlight ? "bg-amber-400/15" : "bg-white/[0.06]"}`}>
                        <Check size={9} className={plan.highlight ? "text-amber-400" : "text-white/40"} strokeWidth={3} />
                      </div>
                      <span className="text-[13px] text-white/45">{feat}</span>
                    </div>
                  ))}
                </div>

                <Link
                  to="/register"
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-black transition-all duration-200 ${
                    plan.highlight
                      ? "bg-amber-400 hover:bg-amber-300 text-[#0A0A0B] shadow-[0_0_24px_rgba(245,158,11,0.2)] hover:shadow-[0_0_32px_rgba(245,158,11,0.3)]"
                      : "bg-white/[0.05] hover:bg-white/[0.09] text-white/70 border border-white/[0.07]"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight size={13} strokeWidth={2.5} />
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-[12px] text-white/20 mt-8">
            All plans include a 7-day free trial. No credit card required for Starter.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── CTA BANNER ────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="relative z-10 py-28">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative rounded-3xl overflow-hidden border border-amber-400/20 bg-[#111113]">
            {/* Inner glow */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(245,158,11,0.08), transparent 70%)" }} />
            {/* Grid texture */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

            <div className="relative z-10 text-center px-8 py-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-[11px] font-bold tracking-widest uppercase mb-7">
                <Zap size={10} strokeWidth={3} />
                Free Forever Plan Available
              </div>

              <h2 className="text-4xl lg:text-5xl font-black tracking-tighter text-white mb-5">
                Your next viral clip<br />
                is one paste away.
              </h2>

              <p className="text-white/35 text-[16px] mb-10 max-w-md mx-auto leading-relaxed">
                47,000+ creators are already forging their way to the top. Join them — it takes less than 30 seconds to start.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link to="/register" className="inline-flex items-center gap-2.5 px-8 py-4 bg-amber-400 hover:bg-amber-300 text-[#0A0A0B] text-[15px] font-black rounded-xl transition-all duration-200 hover:scale-[1.02] shadow-[0_0_40px_rgba(245,158,11,0.25)] hover:shadow-[0_0_60px_rgba(245,158,11,0.35)]">
                  Start Forging Free
                  <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
                <Link to="/login" className="inline-flex items-center gap-2 px-6 py-4 text-white/40 hover:text-white text-[14px] font-semibold transition-colors">
                  Already have an account →
                </Link>
              </div>

              {/* Social proof mini row */}
              <div className="flex items-center justify-center gap-6 mt-10 pt-8 border-t border-white/[0.05]">
                {[
                  { icon: <Users size={13} />, text: "47K+ creators" },
                  { icon: <TrendingUp size={13} />, text: "2.4M clips made" },
                  { icon: <Star size={13} />, text: "4.9/5 rating" },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-[12px] text-white/25">
                    <span className="text-amber-400/50">{icon}</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── FOOTER ────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.05] py-14">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid sm:grid-cols-4 gap-10 mb-12">
            {/* Brand col */}
            <div className="sm:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
                  <Zap size={15} className="text-[#0A0A0B]" strokeWidth={3} />
                </div>
                <span className="text-[15px] font-black tracking-tight text-white">
                  Clip<span className="text-amber-400">Forge</span>
                </span>
              </div>
              <p className="text-[12px] text-white/25 leading-relaxed mb-4">
                AI-powered clip creation for creators who want to grow faster without editing longer.
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-500/8 border border-emerald-500/15 text-[10px] font-bold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                All systems operational
              </div>
            </div>

            {/* Links cols */}
            {[
              {
                heading: "Product",
                links: ["Features", "How it Works", "Pricing", "Changelog", "Roadmap"],
              },
              {
                heading: "Resources",
                links: ["Blog", "Tutorials", "API Docs", "Help Centre", "Status"],
              },
              {
                heading: "Company",
                links: ["About", "Careers", "Press Kit", "Privacy", "Terms"],
              },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <p className="text-[11px] font-black tracking-widest uppercase text-white/20 mb-4">{heading}</p>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-[13px] text-white/30 hover:text-white/70 transition-colors">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/[0.05]">
            <p className="text-[11px] text-white/15">© 2025 ClipForge Inc. All rights reserved. Made with ⚡ in India.</p>
            <div className="flex items-center gap-5">
              {["Privacy", "Terms", "Cookies"].map((link) => (
                <a key={link} href="#" className="text-[11px] text-white/20 hover:text-white/45 transition-colors">{link}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;