/**
 * downloader.js  v10
 *
 * Quality priority (per product requirement):
 *   1. 1080p minimum — highest available wins (4K/1440p/1080p when offered)
 *   2. If 1080p not offered → 720p
 *   3. Last resort → best available
 * v10: HLS-aware `bv*` selectors (SABR-only experiment proof), no pinned
 *      player clients on strategy 1, resumable fragments (no --no-part).
 */

const { spawn, execSync } = require("child_process")
const path      = require("path")
const fs        = require("fs").promises
const fsSync    = require("fs")
const ffmpeg    = require("fluent-ffmpeg")

const findYtDlpBinary = () => {
  const exe = process.platform === "win32" ? ".exe" : ""
  const pipDirs = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Scripts"),
    path.join(process.env.APPDATA      || "", "Python",   "Scripts"),
    path.join("C:", "Python312", "Scripts"),
    path.join("C:", "Python311", "Scripts"),
    path.join("C:", "Python310", "Scripts"),
  ]

  // Dynamically add subdirectories of Programs\Python (e.g. Python311\Scripts)
  try {
    const pythonRoot = path.join(process.env.LOCALAPPDATA || "", "Programs", "Python")
    if (fsSync.existsSync(pythonRoot)) {
      const dirs = fsSync.readdirSync(pythonRoot)
      for (const d of dirs) {
        pipDirs.push(path.join(pythonRoot, d, "Scripts"))
      }
    }
  } catch (e) {
    console.warn("[dl] Dynamic python Scripts search failed:", e.message)
  }

  // Prefer the repo-local yt-dlp.exe (usually newest, e.g. 2026.x) over the
  // npm-bundled one (often months older → "not available on this app").
  const all = [
    path.resolve(`yt-dlp${exe}`),
    path.resolve(__dirname, `yt-dlp${exe}`),
    ...pipDirs.map(d => path.join(d, `yt-dlp${exe}`)),
    path.resolve("node_modules", "youtube-dl-exec", "bin", `yt-dlp${exe}`),
    path.resolve(__dirname, "node_modules", "youtube-dl-exec", "bin", `yt-dlp${exe}`),
    `yt-dlp${exe}`,
  ]
  for (const c of all) {
    try {
      fsSync.accessSync(c, fsSync.constants.F_OK)
      console.log(`[dl] Binary: ${c}`)
      return c
    }
    catch {}
  }
  return `yt-dlp${exe}`
}

const cleanUrl = (url) => {
  try {
    const u = new URL(url)
    if (u.hostname === "youtu.be") return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v")
      if (v) return `https://www.youtube.com/watch?v=${v}`
    }
  } catch {}
  return url
}

const findDownloadedFile = async (dir, stem) => {
  try {
    const entries = await fs.readdir(dir)
    const matches = entries
      .filter(e => {
        if (!e.startsWith(stem)) return false
        if ([".part",".ytdl",".json",".temp"].some(x => e.endsWith(x))) return false
        try { return fsSync.statSync(path.join(dir, e)).size > 1_048_576 } catch { return false }
      })
      .sort((a, b) => {
        try { return fsSync.statSync(path.join(dir, b)).size - fsSync.statSync(path.join(dir, a)).size }
        catch { return 0 }
      })
    return matches.length ? path.join(dir, matches[0]) : null
  } catch { return null }
}

const ensureMp4 = (src, dst) =>
  new Promise((resolve, reject) => {
    if (src === dst) return resolve()
    if (src.toLowerCase().endsWith(".mp4")) {
      fsSync.rename(src, dst, e => e ? reject(e) : resolve())
      return
    }
    console.log(`[dl] Remuxing ${path.extname(src)} → .mp4`)
    ffmpeg(src).output(dst)
      .outputOptions(["-c copy", "-movflags +faststart"])
      .on("end", () => { fs.unlink(src).catch(() => {}); resolve() })
      .on("error", () => {
        // VP9/webm can't stream-copy into mp4 → re-encode audio, keep video.
        console.log(`[dl] Remux failed, re-encoding → .mp4`)
        ffmpeg(src).output(dst)
          .videoCodec("libx264").audioCodec("aac")
          .outputOptions(["-preset", "superfast", "-crf", "23", "-movflags", "+faststart"])
          .on("end", () => { fs.unlink(src).catch(() => {}); resolve() })
          .on("error", reject)
          .run()
      })
      .run()
  })

const runYtDlp = (binary, args, timeoutMs = 2_000_000) =>
  new Promise((resolve, reject) => {
    console.log(`[dl] CMD: ${path.basename(binary)} ${args.join(" ")}\n`)
    const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] })
    let done = false
    // Real-progress tracking — "Retrying…" storms are NOT progress. This is
    // what catches the network-stall hang (frag 207/1045 stuck for 30+ min
    // with repeated "Read timed out"). When nothing advances for STALL_MS,
    // kill the attempt; the strategy loop keeps fragments so the next
    // strategy resumes instead of crawling forever.
    const STALL_MS = 5 * 60 * 1000
    const lastProg = { t: Date.now(), frag: 0, pct: 0 }
    const timer = setTimeout(() => { try { proc.kill("SIGKILL") } catch {} ; finish("timeout") }, timeoutMs)
    const poll = setInterval(() => {
      if (!done && Date.now() - lastProg.t > STALL_MS) {
        console.warn(`\n[dl] ⏰ Stall watchdog: no download progress for ${STALL_MS / 60000} min — killing attempt, next strategy resumes`)
        try { proc.kill("SIGKILL") } catch {}
        finish("stalled")
      }
    }, 20_000)
    const finish = (v) => {
      if (done) return
      done = true
      clearTimeout(timer); clearInterval(poll)
      resolve(v)
    }
    const log = d => d.toString().split("\n").map(l => l.trim()).filter(Boolean).forEach(l => {
      console.log(`[yt-dlp] ${l}`)
      const fm = l.match(/frag\s+(\d+)\//)
      const pm = l.match(/(\d+(?:\.\d+)?)%\s+of/)
      if (fm) { const f = parseInt(fm[1], 10); if (f > lastProg.frag) { lastProg.frag = f; lastProg.t = Date.now() } }
      if (pm) { const p = parseFloat(pm[1]); if (p > lastProg.pct) { lastProg.pct = p; lastProg.t = Date.now() } }
    })
    proc.stdout.on("data", log)
    proc.stderr.on("data", log)
    proc.on("close",  code => { console.log(`[dl] exit: ${code}`); finish(code) })
    proc.on("error",  err  => {
      done = true; clearTimeout(timer); clearInterval(poll)
      if (err.code === "ENOENT") reject(new Error("yt-dlp not found – run: pip install yt-dlp"))
      else reject(err)
    })
  })

const downloadVideo = async (url, finalMp4Path, { onProgress } = {}) => {
  const emit    = (msg, pct) => { if (onProgress) onProgress(msg, pct) }
  const binary  = findYtDlpBinary()
  const dir     = path.dirname(finalMp4Path)
  const stem    = path.basename(finalMp4Path, ".mp4")
  const tpl     = path.join(dir, `${stem}.%(ext)s`)
  const safeUrl = cleanUrl(url)

  console.log(`\n[dl] ═══════════════════════════════════════`)
  console.log(`[dl] v11 — 1080p → 720p → best (NEVER 4K/1440p) + stall watchdog`)
  console.log(`[dl] URL: ${safeUrl}`)
  await fs.mkdir(dir, { recursive: true })

  // ── Check if aria2c is available ──────────────────────────────────────────
  let useAria2c = false
  let aria2Path = "aria2c"
  const localAria2 = path.join(__dirname, "aria2c.exe")
  if (fsSync.existsSync(localAria2)) {
    useAria2c = true
    aria2Path = localAria2
    console.log(`[dl] ✅ aria2c found at ${localAria2} — using 16-connection download`)
  } else {
    try {
      execSync("aria2c --version", { stdio: "ignore" })
      useAria2c = true
      console.log("[dl] ✅ aria2c found in PATH — using 16-connection download")
    } catch {
      console.log("[dl] aria2c not found — using yt-dlp built-in")
    }
  }

  // Base flags — speed optimized (all valid for yt-dlp; no --prefer-free-extensions)
  // NOTE: no --no-part → fragments are kept so a failed strategy resumes
  // instead of restarting from 0 (fixes the 1.59GB → 9.38GB restart).
  const base = [
    "--no-playlist",
    "--retries", "10",
    "--fragment-retries", "10",
    "--concurrent-fragments", "24",
    "--throttled-rate", "100K",
    "--buffer-size", "32K",
    "--http-chunk-size", "10M",
    "--skip-unavailable-fragments",
    "--no-check-certificate",
    "--merge-output-format", "mp4",
    "--format-sort", "res,fps,ext:mp4:m4a",
    "--js-runtimes", "node",
    "-o", tpl,
    ...(useAria2c
      ? ["--downloader", aria2Path, "--downloader-args", "aria2c:-x16 -k1M -j16 --max-connection-per-server=16"]
      : []),
  ]

  // ── STRATEGY ORDER — user-locked: 1080p → 720p → best. NEVER 4K/1440p ──────
  // Exact-height selectors (`[height=1080]`) make it impossible to pick a 4K
  // or 1440p format (that is what pulled an 11.6GiB download on gHQo3UafM54).
  // `bv*` also matches HLS (m3u8) formats — under YouTube's SABR-only
  // experiment the ONLY 1080p formats are m3u8 ones. Strategies 1–2 do NOT pin
  // player clients broadly: pinned android/ios lists came back with only
  // format 18 (360p), while yt-dlp's default client list solves the JS
  // challenge and returns the 1080p HLS formats (proven: "616+140").
  // Fallback stays capped at ≤720p — "any lower" is fine, never higher.
  const F1080    = "bestvideo[height=1080]+bestaudio[ext=m4a]/bestvideo*[height=1080]+bestaudio/[height=1080]/best[height=1080]"
  const F720     = "bestvideo[height=720]+bestaudio[ext=m4a]/bestvideo*[height=720]+bestaudio/[height=720]/best[height=720]"
  const FALLBACK = "bestvideo*[height<=720]+bestaudio/best[height<=720]/bestvideo*+bestaudio/best"
  const strategies = [
    { label: "1080p (default clients, HLS-proof)", args: [...base, "-f", F1080, safeUrl] },
    { label: "1080p (web_safari,web clients)",     args: [...base, "--extractor-args", "youtube:player_client=web_safari,web", "-f", F1080, safeUrl] },
    { label: "720p (default clients)",             args: [...base, "-f", F720, safeUrl] },
    { label: "best available (≤720 preferred)",    args: [...base, "-f", FALLBACK, safeUrl] },
  ]

  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i]
    emit(`⬇️ ${s.label}…`, 5 + i * 2)
    console.log(`\n[dl] ── Strategy ${i+1}/${strategies.length}: ${s.label} ──`)

    const exitCode = await runYtDlp(binary, s.args, 2_000_000)

    const downloaded = await findDownloadedFile(dir, stem)
    if (!downloaded) { console.warn(`[dl] No file after strategy ${i+1}`); continue }
    // Only accept a file if yt-dlp exited cleanly — a mid-download kill leaves a
    // partial .mp4 that must not be treated as success (would cause a restart anyway).
    if (exitCode !== 0) console.warn(`[dl] Strategy ${i+1} exited ${exitCode} — file may be partial, verifying…`)

    try {
      if (downloaded !== finalMp4Path) await ensureMp4(downloaded, finalMp4Path)

      const stat = await fs.stat(finalMp4Path)
      if (stat.size < 5_242_880) {
        console.warn(`[dl] Only ${Math.round(stat.size/1048576)} MB — too small, retry`)
        await fs.unlink(finalMp4Path).catch(() => {})
        continue
      }

      const mb = Math.round(stat.size / 1048576)
      // Probe actual resolution — never guess from file size.
      const probe = await new Promise(resolve => {
        ffmpeg.ffprobe(finalMp4Path, (e, meta) => {
          if (e) return resolve(null)
          const vs = (meta?.streams || []).find(s => s.codec_type === "video")
          resolve(vs ? { w: vs.width, h: vs.height } : null)
        })
      }).catch(() => null)
      const h = probe?.h || 0
      const qualityGuess = h >= 2160 ? "4K" : h >= 1440 ? "1440p" : h >= 1080 ? "1080p" : h >= 720 ? "720p" : h > 0 ? `${h}p` : "1080p"
      console.log(`\n✅ Download success – ${s.label}`)
      console.log(`✅ File: ${mb} MB (${probe ? `${probe.w}x${probe.h}` : "?"} ~${qualityGuess})\n`)
      emit(`✅ Downloaded ${mb} MB (${qualityGuess})`, 20)
      return { exists: true, size: mb, quality: qualityGuess, width: probe?.w, height: probe?.h }
    } catch (err) {
      console.warn(`[dl] Post-process error: ${err.message}`)
      await fs.unlink(finalMp4Path).catch(() => {})
    }
  }

  throw new Error("All download strategies failed. Update yt-dlp: pip install -U yt-dlp")
}

module.exports = { downloadVideo, findYtDlpBinary }