/**
 * downloader.js  v8
 *
 * CHANGES FROM v7:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. STRATEGY ORDER CHANGED: Standard web (previously strategy 3) now runs FIRST
 *    because it is the most reliably working strategy. web_creator follows as fallback.
 *
 * Strategy order:
 *   1. Standard web 1080p (mp4 + m4a)   ← was strategy 3, most reliable
 *   2. Standard web wide                ← new broad fallback
 *   3. web_creator 1080p                ← was strategy 1
 *   4. web_creator wide                 ← was strategy 2
 *   5. ios + missing_pot                ← was strategy 4
 *   6. 720p                             ← was strategy 5
 *   7. best available                   ← last resort
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
  const all = [
    ...pipDirs.map(d => path.join(d, `yt-dlp${exe}`)),
    path.resolve("node_modules", "youtube-dl-exec", "bin", `yt-dlp${exe}`),
    path.resolve(`yt-dlp${exe}`),
    `yt-dlp${exe}`,
  ]
  for (const c of all) {
    try { fsSync.accessSync(c, fsSync.constants.F_OK); console.log(`[dl] Binary: ${c}`); return c }
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
      .on("error", reject)
      .run()
  })

const runYtDlp = (binary, args, timeoutMs = 2_000_000) =>
  new Promise((resolve, reject) => {
    console.log(`[dl] CMD: ${path.basename(binary)} ${args.join(" ")}\n`)
    const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] })
    const log  = d => d.toString().split("\n").map(l => l.trim()).filter(Boolean)
                       .forEach(l => console.log(`[yt-dlp] ${l}`))
    proc.stdout.on("data", log)
    proc.stderr.on("data", log)
    const timer = setTimeout(() => { proc.kill("SIGKILL"); resolve("timeout") }, timeoutMs)
    proc.on("close",  code => { clearTimeout(timer); console.log(`[dl] exit: ${code}`); resolve(code) })
    proc.on("error",  err  => {
      clearTimeout(timer)
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
  console.log(`[dl] v8 — Standard web strategy first`)
  console.log(`[dl] URL: ${safeUrl}`)
  await fs.mkdir(dir, { recursive: true })

  // ── Check if aria2c is available ──────────────────────────────────────────
  let useAria2c = false
  try {
    execSync("aria2c --version", { stdio: "ignore" })
    useAria2c = true
    console.log("[dl] ✅ aria2c found — using 16-connection download")
  } catch {
    console.log("[dl] aria2c not found — using yt-dlp built-in (install aria2 for faster downloads)")
  }

  // Base flags — speed optimized
  const base = [
    "--no-playlist",
    "--retries", "5",
    "--fragment-retries", "5",
    "--concurrent-fragments", "16",
    "--throttled-rate", "100K",
    "--buffer-size", "32K",
    "--http-chunk-size", "10M",
    "--skip-unavailable-fragments",
    "--no-check-certificate",
    "--no-part",
    "--merge-output-format", "mp4",
    "-o", tpl,
    ...(useAria2c
      ? ["--downloader", "aria2c", "--downloader-args", "aria2c:-x16 -k1M -j16 --max-connection-per-server=16"]
      : []),
  ]

  // ── STRATEGY ORDER — Strategy 3 (standard web) is FIRST ──────────────────
  const strategies = [
    // STRATEGY 1 (was #3): Standard web — most reliable, no special client needed
    {
      label: "1080p standard web",
      args: [
        ...base,
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        safeUrl,
      ],
    },
    // STRATEGY 2: Standard web — wide format selector
    {
      label: "1080p standard web (wide)",
      args: [
        ...base,
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        safeUrl,
      ],
    },
    // STRATEGY 3 (was #1): web_creator — good for some videos
    {
      label: "1080p web_creator",
      args: [
        ...base,
        "--extractor-args", "youtube:player_client=web_creator",
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        safeUrl,
      ],
    },
    // STRATEGY 4 (was #2): web_creator wide
    {
      label: "1080p web_creator (wide)",
      args: [
        ...base,
        "--extractor-args", "youtube:player_client=web_creator",
        "-f", "bestvideo[height<=1080]+bestaudio/best",
        safeUrl,
      ],
    },
    // STRATEGY 5 (was #4): ios + missing_pot
    {
      label: "1080p ios+missing_pot",
      args: [
        ...base,
        "--extractor-args", "youtube:player_client=ios,formats=missing_pot",
        "-f", "bestvideo[height<=1080]+bestaudio/best",
        safeUrl,
      ],
    },
    // STRATEGY 6: 720p fallback
    {
      label: "720p",
      args: [...base, "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best", safeUrl],
    },
    // STRATEGY 7: Last resort — any best format
    {
      label: "best available",
      args: [...base, "-f", "b", safeUrl],
    },
  ]

  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i]
    emit(`⬇️ ${s.label}…`, 5 + i * 2)
    console.log(`\n[dl] ── Strategy ${i+1}/${strategies.length}: ${s.label} ──`)

    await runYtDlp(binary, s.args, 2_000_000)

    const downloaded = await findDownloadedFile(dir, stem)
    if (!downloaded) { console.warn(`[dl] No file after strategy ${i+1}`); continue }

    try {
      if (downloaded !== finalMp4Path) await ensureMp4(downloaded, finalMp4Path)

      const stat = await fs.stat(finalMp4Path)
      if (stat.size < 5_242_880) {
        console.warn(`[dl] Only ${Math.round(stat.size/1048576)} MB — too small, retry`)
        await fs.unlink(finalMp4Path).catch(() => {})
        continue
      }

      const mb           = Math.round(stat.size / 1048576)
      const qualityGuess = mb > 200 ? "1080p" : mb > 80 ? "720p" : "360p"
      console.log(`\n✅ Download success – ${s.label}`)
      console.log(`✅ File: ${mb} MB (~${qualityGuess})\n`)
      emit(`✅ Downloaded ${mb} MB (${qualityGuess})`, 20)
      return { exists: true, size: mb, quality: qualityGuess }
    } catch (err) {
      console.warn(`[dl] Post-process error: ${err.message}`)
      await fs.unlink(finalMp4Path).catch(() => {})
    }
  }

  throw new Error("All download strategies failed. Update yt-dlp: pip install -U yt-dlp")
}

module.exports = { downloadVideo }