const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const path = require("path")
const fs = require("fs").promises
const youtubedl = require("youtube-dl-exec")
const ffmpeg = require("fluent-ffmpeg")
const { v4: uuidv4 } = require("uuid")
const http = require("http")
const socketIo = require("socket.io")
require("dotenv").config()

// Import auth routes
const authRoutes = require("./routes/auth")
const User = require("./models/user");

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

const PORT = process.env.PORT || 5000

// Store active processing sessions
const processingSessions = new Map()

// Middleware
app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ytshorts", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

const db = mongoose.connection
db.on("error", console.error.bind(console, "MongoDB connection error:"))
db.once("open", () => {
  console.log("✅ Connected to MongoDB")
})

// Auth routes
app.use("/api/auth", authRoutes)

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
  try {
    await fs.access("uploads")
  } catch {
    await fs.mkdir("uploads", { recursive: true })
    await fs.mkdir("uploads/videos", { recursive: true })
    await fs.mkdir("uploads/clips", { recursive: true })
    await fs.mkdir("uploads/thumbnails", { recursive: true })
  }
}

// Utility function to safely delete files
const safeDeleteFile = async (filePath) => {
  try {
    await fs.access(filePath)
    await fs.unlink(filePath)
    console.log(`Deleted file: ${path.basename(filePath)}`)
  } catch (error) {
    console.log(`File not found or already deleted: ${path.basename(filePath)}`)
  }
}

// Verify file exists and get its info
const verifyVideoFile = async (filePath) => {
  try {
    await fs.access(filePath)
    const stats = await fs.stat(filePath)
    const fileSizeMB = Math.round(stats.size / (1024 * 1024))
    console.log(`Video file verified: ${path.basename(filePath)} (${fileSizeMB}MB)`)
    return { exists: true, size: fileSizeMB, stats }
  } catch (error) {
    console.error(`Video file verification failed: ${path.basename(filePath)}`)
    return { exists: false, size: 0, stats: null }
  }
}

const calculateDynamicTimeout = async (url) => {
  try {
    const videoInfo = await youtubedl(url, {
      dumpSingleJson: true,
      noDownload: true,
      noPlaylist: true,
    })

    const durationSeconds = videoInfo.duration || 300
    const filesize = videoInfo.filesize || 0
    
    // Estimate timeout: 1-2 seconds per minute of video + buffer
    let estimatedTimeout = Math.max(120000, (durationSeconds / 60) * 2000) + 60000 // min 2 min, +1 min buffer
    
    // If filesize is available, use it for better estimation
    if (filesize > 0) {
      // Assume average 1MB per second download (conservative)
      const estimatedSeconds = filesize / (1024 * 1024) / 1
      estimatedTimeout = Math.max(estimatedTimeout, estimatedSeconds * 1500) // 1.5x multiplier for safety
    }

    console.log(`[v0] Calculated dynamic timeout: ${Math.floor(estimatedTimeout / 1000)}s for ${Math.floor(durationSeconds / 60)}min video`)
    return {
      timeout: Math.min(estimatedTimeout, 600000), // Cap at 10 minutes max
      duration: durationSeconds,
      filesize: filesize,
    }
  } catch (error) {
    console.warn(`[v0] Could not calculate dynamic timeout, using default: ${error.message}`)
    return { timeout: 300000, duration: 300, filesize: 0 } // Default 5 minutes
  }
}

const downloadWithRetry = async (url, outputPath, options, maxRetries = 3, baseTimeout = 180000) => {
  let lastError = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeoutMs = baseTimeout * Math.pow(1.5, attempt - 1) // Increase timeout with each retry
      console.log(`[v0] Download attempt ${attempt}/${maxRetries}, timeout: ${Math.floor(timeoutMs / 1000)}s`)
      
      await Promise.race([
        youtubedl(url, { ...options, output: outputPath }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`timeout_${Math.floor(timeoutMs / 1000)}s`)),
            timeoutMs,
          ),
        ),
      ])
      
      console.log(`[v0] Download attempt ${attempt} succeeded`)
      return { success: true, attempt }
    } catch (error) {
      lastError = error
      const errorMsg = error.message || String(error)
      console.error(`[v0] Download attempt ${attempt} failed: ${errorMsg}`)
      
      // If it's a timeout, retry. If it's other error, may still retry
      if (attempt < maxRetries && (errorMsg.includes("timeout") || errorMsg.includes("temporary"))) {
        console.log(`[v0] Retrying in 5 seconds...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      } else if (attempt === maxRetries) {
        console.error(`[v0] All ${maxRetries} download attempts failed`)
        throw error
      }
    }
  }
  
  throw lastError
}

const downloadHighQualityVideo = async (url, outputPath, sessionId) => {
  const session = processingSessions.get(sessionId)
  try {
    console.log(`⬇️ Downloading video with bestvideo+bestaudio strategy...`)
    
    if (session) {
      session.currentStep = `Analyzing video dimensions...`
      session.progress = 5
      io.emit("progress", { sessionId, ...session })
    }

    const timeoutInfo = await calculateDynamicTimeout(url)
    
    if (session) {
      session.currentStep = `Downloading video (${Math.floor(timeoutInfo.duration / 60)} min video)...`
      session.progress = 8
      io.emit("progress", { sessionId, ...session })
    }

    // Ensure the directory exists
    const outputDir = path.dirname(outputPath)
    await fs.mkdir(outputDir, { recursive: true })

    console.log(`[v0] Starting download with ${timeoutInfo.timeout / 1000}s timeout`)
    
    const downloadOptions = {
      format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
      noPlaylist: true,
      retries: 3,
      fragmentRetries: 5,
      skipUnavailableFragments: true,
      mergeOutputFormat: "mp4",
      quiet: false,
      keepFragments: false,
      socketTimeout: 30000, // 30s socket timeout
    }

    try {
      await downloadWithRetry(url, outputPath, downloadOptions, 3, timeoutInfo.timeout)
    } catch (retryError) {
      console.error(`[v0] Retry strategy exhausted, trying fallback format...`)
      // Fallback to simple best format with shorter timeout
      await downloadWithRetry(url, outputPath, {
        format: "best[ext=mp4]",
        noPlaylist: true,
        retries: 2,
      }, 2, 180000)
    }

    const verification = await verifyVideoFile(outputPath)
    console.log(`[v0] File verification: exists=${verification.exists}, size=${verification.size}MB`)
    
    if (!verification.exists) {
      throw new Error("Video file was not created after download")
    }

    if (verification.size < 10) {
      throw new Error(`Downloaded file too small: ${verification.size}MB - incomplete download`)
    }

    console.log(`✅ DOWNLOAD SUCCESS: ${verification.size}MB WITH AUDIO`)

    if (session) {
      session.currentStep = `✅ Downloaded ${verification.size}MB video`
      session.progress = 15
      io.emit("progress", { sessionId, ...session })
    }

    return {
      ...verification,
      quality: "HD",
      height: 720,
    }
  } catch (error) {
    console.error("❌ Download failed:", error.message)
    
    if (session) {
      session.currentStep = `⚠️ Download error: ${error.message}`
      io.emit("progress", { sessionId, ...session })
    }
    
    throw new Error(`Failed to download video: ${error.message}`)
  }
}

// Detect video type and language from title/description
const detectVideoTypeAndLanguage = (videoInfo) => {
  const title = (videoInfo.title || "").toLowerCase()
  const description = (videoInfo.description || "").toLowerCase()
  const channel = (videoInfo.uploader || "").toLowerCase()

  // Language detection
  const hindiKeywords = ["hindi", "हिंदी", "भारत", "india", "bollywood", "desi", "indian"]
  const englishKeywords = ["english", "america", "usa", "british", "uk"]

  let language = "english" // default

  if (
    hindiKeywords.some(
      (keyword) => title.includes(keyword) || description.includes(keyword) || channel.includes(keyword),
    )
  ) {
    language = "hindi"
  }

  // Video type detection
  let videoType = "general"

  if (
    title.includes("podcast") ||
    title.includes("interview") ||
    title.includes("conversation") ||
    title.includes("पॉडकास्ट") ||
    title.includes("बातचीत") ||
    title.includes("साक्षात्कार")
  ) {
    videoType = "podcast"
  } else if (
    title.includes("vlog") ||
    title.includes("daily") ||
    title.includes("routine") ||
    title.includes("व्लॉग") ||
    title.includes("दिनचर्या")
  ) {
    videoType = "vlog"
  } else if (
    title.includes("tutorial") ||
    title.includes("how to") ||
    title.includes("guide") ||
    title.includes("ट्यूटोरियल") ||
    title.includes("कैसे करें") ||
    title.includes("सीखें")
  ) {
    videoType = "tutorial"
  } else if (
    title.includes("comedy") ||
    title.includes("funny") ||
    title.includes("memes") ||
    title.includes("कॉमेडी") ||
    title.includes("हास्य") ||
    title.includes("मजेदार")
  ) {
    videoType = "comedy"
  } else if (
    title.includes("gaming") ||
    title.includes("gameplay") ||
    title.includes("game") ||
    title.includes("गेमिंग") ||
    title.includes("खेल")
  ) {
    videoType = "gaming"
  } else if (
    title.includes("music") ||
    title.includes("song") ||
    title.includes("dance") ||
    title.includes("संगीत") ||
    title.includes("गाना") ||
    title.includes("नृत्य")
  ) {
    videoType = "music"
  } else if (
    title.includes("news") ||
    title.includes("breaking") ||
    title.includes("update") ||
    title.includes("समाचार") ||
    title.includes("न्यूज") ||
    title.includes("अपडेट")
  ) {
    videoType = "news"
  } else if (
    title.includes("review") ||
    title.includes("unboxing") ||
    title.includes("comparison") ||
    title.includes("रिव्यू") ||
    title.includes("समीक्षा") ||
    title.includes("तुलना")
  ) {
    videoType = "review"
  }

  console.log(`Detected: ${language} ${videoType} video`)
  return { language, videoType }
}

// Enhanced smart moment detection for different video types and languages
const detectSmartMoments = (duration, videoType, language, videoInfo) => {
  const moments = []
  const durationMinutes = duration / 60

  // Calculate clips based on video type
  let optimalClips, clipPatterns

  switch (videoType) {
    case "podcast":
      optimalClips = Math.min(25, Math.max(10, Math.floor(durationMinutes * 0.25)))
      clipPatterns = getPodcastPatterns(duration, language)
      break
    case "vlog":
      optimalClips = Math.min(18, Math.max(7, Math.floor(durationMinutes * 0.35)))
      clipPatterns = getVlogPatterns(duration, language)
      break
    case "tutorial":
      optimalClips = Math.min(12, Math.max(5, Math.floor(durationMinutes * 0.3)))
      clipPatterns = getTutorialPatterns(duration, language)
      break
    case "comedy":
      optimalClips = Math.min(20, Math.max(8, Math.floor(durationMinutes * 0.4)))
      clipPatterns = getComedyPatterns(duration, language)
      break
    case "gaming":
      optimalClips = Math.min(15, Math.max(6, Math.floor(durationMinutes * 0.3)))
      clipPatterns = getGamingPatterns(duration, language)
      break
    case "music":
      optimalClips = Math.min(10, Math.max(4, Math.floor(durationMinutes * 0.25)))
      clipPatterns = getMusicPatterns(duration, language)
      break
    case "news":
      optimalClips = Math.min(12, Math.max(5, Math.floor(durationMinutes * 0.3)))
      clipPatterns = getNewsPatterns(duration, language)
      break
    case "review":
      optimalClips = Math.min(15, Math.max(6, Math.floor(durationMinutes * 0.3)))
      clipPatterns = getReviewPatterns(duration, language)
      break
    default:
      optimalClips = Math.min(15, Math.max(6, Math.floor(durationMinutes * 0.3)))
      clipPatterns = getGeneralPatterns(duration, language)
  }

  console.log(
    `Generating ${optimalClips} clips for ${language} ${videoType} video (${Math.floor(durationMinutes)} minutes)`,
  )

  const usedTimeRanges = []
  const minGapBetweenClips = videoType === "comedy" ? 30 : 45

  for (let i = 0; i < optimalClips; i++) {
    let attempts = 0
    let validClip = false

    while (!validClip && attempts < 100) {
      const selectedPattern = clipPatterns[Math.floor(Math.random() * clipPatterns.length)]
      const patternStartTime = Math.max(selectedPattern.timeRange[0], 30)
      const patternEndTime = Math.min(selectedPattern.timeRange[1], duration - 60)

      if (patternEndTime <= patternStartTime) {
        attempts++
        continue
      }

      const clipDuration =
        selectedPattern.duration[0] +
        Math.floor(Math.random() * (selectedPattern.duration[1] - selectedPattern.duration[0]))
      const maxStartTime = patternEndTime - clipDuration

      if (maxStartTime <= patternStartTime) {
        attempts++
        continue
      }

      const startTime = patternStartTime + Math.floor(Math.random() * (maxStartTime - patternStartTime))
      const endTime = startTime + clipDuration

      const overlaps = usedTimeRanges.some(
        (range) =>
          (startTime >= range.start - minGapBetweenClips && startTime <= range.end + minGapBetweenClips) ||
          (endTime >= range.start - minGapBetweenClips && endTime <= range.end + minGapBetweenClips) ||
          (startTime <= range.start && endTime >= range.end),
      )

      if (!overlaps && startTime >= 0 && endTime <= duration) {
        const baseScore = 65 + Math.floor(Math.random() * 30)
        const patternBonus = Math.floor(selectedPattern.probability * 8)
        const viralScore = Math.min(98, baseScore + patternBonus)

        moments.push({
          id: uuidv4(),
          startTime,
          endTime,
          duration: clipDuration,
          viralScore,
          title: selectedPattern.type,
          reason: selectedPattern.reason,
          pattern: selectedPattern.type,
          quality: "high",
          videoType,
          language,
          minStartTime: Math.max(0, startTime - 30),
          maxEndTime: Math.min(duration, endTime + 30),
          originalStart: startTime,
          originalEnd: endTime,
        })

        usedTimeRanges.push({ start: startTime, end: endTime })
        validClip = true
      }

      attempts++
    }
  }

  moments.sort((a, b) => b.viralScore - a.viralScore)

  console.log(
    `Generated ${moments.length} smart clips with average viral score: ${Math.floor(
      moments.reduce((sum, m) => sum + m.viralScore, 0) / moments.length,
    )}%`,
  )

  return moments
}

const getPodcastPatterns = (duration, language) => {
  const hindiReasons = [
    "शक्तिशाली बयान",
    "मुख्य अंतर्दृष्टि",
    "विवादास्पद राय",
    "व्यक्तिगत कहानी",
    "विशेषज्ञ सलाह",
    "भावनात्मक क्षण",
  ]

  const englishReasons = [
    "Powerful statement",
    "Key insight",
    "Controversial opinion",
    "Personal story",
    "Expert advice",
    "Emotional moment",
  ]

  const reasons = language === "hindi" ? hindiReasons : englishReasons

  return [
    { type: "Opening Hook", timeRange: [60, 300], probability: 0.9, duration: [15, 25], reason: reasons[0] },
    {
      type: "Key Question",
      timeRange: [300, duration * 0.3],
      probability: 0.8,
      duration: [18, 30],
      reason: reasons[1],
    },
    {
      type: "Insight Moment",
      timeRange: [duration * 0.2, duration * 0.8],
      probability: 0.85,
      duration: [20, 35],
      reason: reasons[1],
    },
    {
      type: "Story/Example",
      timeRange: [duration * 0.3, duration * 0.9],
      probability: 0.75,
      duration: [25, 40],
      reason: reasons[3],
    },
    {
      type: "Expert Advice",
      timeRange: [duration * 0.3, duration * 0.9],
      probability: 0.8,
      duration: [20, 30],
      reason: reasons[4],
    },
  ]
}

const getVlogPatterns = (duration, language) => {
  const hindiReasons = [
    "दिलचस्प पल",
    "मजेदार घटना",
    "दैनिक हाइलाइट",
    "व्यक्तिगत अनुभव",
  ]

  const englishReasons = [
    "Interesting moment",
    "Funny incident",
    "Daily highlight",
    "Personal experience",
  ]

  const reasons = language === "hindi" ? hindiReasons : englishReasons

  return [
    {
      type: "Daily Highlight",
      timeRange: [0, duration * 0.4],
      probability: 0.8,
      duration: [15, 25],
      reason: reasons[2],
    },
    {
      type: "Funny Moment",
      timeRange: [duration * 0.2, duration * 0.8],
      probability: 0.9,
      duration: [10, 20],
      reason: reasons[1],
    },
    {
      type: "Personal Share",
      timeRange: [duration * 0.3, duration * 0.9],
      probability: 0.7,
      duration: [18, 30],
      reason: reasons[3],
    },
  ]
}

const getComedyPatterns = (duration, language) => {
  const hindiReasons = ["हास्यप्रद पल", "कॉमेडी का चरम", "मजेदार संवाद", "हंसी का फव्वारा"]
  const englishReasons = ["Hilarious moment", "Comedy peak", "Funny dialogue", "Burst of laughter"]

  const reasons = language === "hindi" ? hindiReasons : englishReasons

  return [
    { type: "Comedy Peak", timeRange: [0, duration], probability: 0.95, duration: [8, 18], reason: reasons[1] },
    { type: "Funny Dialogue", timeRange: [0, duration], probability: 0.9, duration: [10, 20], reason: reasons[2] },
    { type: "Meme Moment", timeRange: [0, duration], probability: 0.85, duration: [6, 15], reason: reasons[0] },
  ]
}

const getGamingPatterns = (duration, language) => {
  const hindiReasons = ["एपिक जीत", "अविश्वसनीय खेल", "गेमिंग हाइलाइट"]
  const englishReasons = ["Epic win", "Incredible play", "Gaming highlight"]

  const reasons = language === "hindi" ? hindiReasons : englishReasons

  return [
    { type: "Epic Win", timeRange: [0, duration], probability: 0.9, duration: [15, 25], reason: reasons[0] },
    { type: "Skill Showcase", timeRange: [0, duration], probability: 0.85, duration: [18, 30], reason: reasons[2] },
  ]
}

const getTutorialPatterns = (duration, language) => {
  const hindiReasons = ["मुख्य सीख", "व्यावहारिक टिप", "समस्या समाधान"]
  const englishReasons = ["Key learning", "Practical tip", "Problem solution"]

  const reasons = language === "hindi" ? hindiReasons : englishReasons

  return [
    {
      type: "Key Learning",
      timeRange: [duration * 0.2, duration * 0.8],
      probability: 0.9,
      duration: [20, 30],
      reason: reasons[0],
    },
    {
      type: "Practical Tip",
      timeRange: [duration * 0.3, duration * 0.9],
      probability: 0.85,
      duration: [18, 28],
      reason: reasons[1],
    },
  ]
}

const getMusicPatterns = (duration, language) => {
  const reasons =
    language === "hindi"
      ? ["संगीत हाइलाइट", "बेस्ट बीट"]
      : ["Music highlight", "Best beat"]

  return [
    {
      type: "Music Highlight",
      timeRange: [duration * 0.2, duration * 0.8],
      probability: 0.9,
      duration: [15, 25],
      reason: reasons[0],
    },
    {
      type: "Beat Drop",
      timeRange: [duration * 0.3, duration * 0.7],
      probability: 0.85,
      duration: [10, 20],
      reason: reasons[1],
    },
  ]
}

const getNewsPatterns = (duration, language) => {
  const reasons =
    language === "hindi"
      ? ["मुख्य समाचार", "महत्वपूर्ण अपडेट"]
      : ["Main news", "Important update"]

  return [
    { type: "Breaking News", timeRange: [0, duration * 0.3], probability: 0.9, duration: [18, 28], reason: reasons[0] },
    {
      type: "Key Analysis",
      timeRange: [duration * 0.3, duration * 0.8],
      probability: 0.8,
      duration: [20, 30],
      reason: reasons[1],
    },
  ]
}

const getReviewPatterns = (duration, language) => {
  const reasons =
    language === "hindi"
      ? ["मुख्य रिव्यू", "अंतिम राय"]
      : ["Main review", "Final verdict"]

  return [
    {
      type: "Main Review",
      timeRange: [duration * 0.2, duration * 0.7],
      probability: 0.85,
      duration: [20, 30],
      reason: reasons[0],
    },
    {
      type: "Final Verdict",
      timeRange: [duration * 0.7, duration],
      probability: 0.9,
      duration: [18, 28],
      reason: reasons[1],
    },
  ]
}

const getGeneralPatterns = (duration, language) => {
  const reasons =
    language === "hindi"
      ? ["दिलचस्प पल", "मुख्य हाइलाइट"]
      : ["Interesting moment", "Main highlight"]

  return [
    { type: "Highlight", timeRange: [0, duration], probability: 0.8, duration: [15, 25], reason: reasons[1] },
    {
      type: "Best Part",
      timeRange: [duration * 0.2, duration * 0.8],
      probability: 0.75,
      duration: [18, 28],
      reason: reasons[0],
    },
  ]
}

const extractClipFast = (inputPath, outputPath, startTime, duration, videoType) => {
  return new Promise(async (resolve, reject) => {
    // Verify input file exists before processing
    const inputVerification = await verifyVideoFile(inputPath)
    if (!inputVerification.exists) {
      reject(new Error(`Input video file not found: ${inputPath}`))
      return
    }

    console.log(`Extracting clip from verified input: ${path.basename(inputPath)} (${inputVerification.size}MB)`)

    let ffmpegCmd = ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .videoCodec("libx264")
      .audioCodec("aac")

    if (videoType === "podcast") {
      // Crop the top half and bottom half separately, then scale to 720x1280 with both visible
      // This creates a 2-person vertical layout (stacked)
      ffmpegCmd.outputOptions([
        "-filter:v",
        "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
        "-preset ultrafast",
        "-crf 21",
        "-movflags +faststart",
        "-threads 4",
        "-profile:v high",
        "-level 4.1",
        "-pix_fmt yuv420p",
      ])
    } else {
      ffmpegCmd.size("720x1280")
        .aspect("9:16")
        .outputOptions([
          "-preset ultrafast",
          "-crf 21",
          "-movflags +faststart",
          "-threads 4",
          "-profile:v high",
          "-level 4.1",
          "-pix_fmt yuv420p",
        ])
    }

    ffmpegCmd
      .on("end", async () => {
        // Verify output file was created
        const outputVerification = await verifyVideoFile(outputPath)
        if (outputVerification.exists) {
          console.log(`High-quality clip extracted: ${path.basename(outputPath)}`)
          resolve()
        } else {
          reject(new Error(`Output clip was not created: ${outputPath}`))
        }
      })
      .on("error", (err) => {
        console.error(`Error extracting clip ${path.basename(outputPath)}:`, err.message)
        reject(err)
      })
      .run()
  })
}

// Custom clip extraction for extend/cut functionality with high quality
const extractCustomClip = (inputPath, outputPath, startTime, duration, videoType) => {
  return new Promise(async (resolve, reject) => {
    // Verify input file exists before processing
    const inputVerification = await verifyVideoFile(inputPath)
    if (!inputVerification.exists) {
      reject(new Error(`Input video file not found: ${inputPath}`))
      return
    }

    let ffmpegCmd = ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .videoCodec("libx264")
      .audioCodec("aac")

    if (videoType === "podcast") {
      ffmpegCmd.outputOptions([
        "-filter:v",
        "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
        "-preset ultrafast",
        "-crf 20",
        "-movflags +faststart",
        "-threads 4",
        "-profile:v high",
        "-level 4.1",
        "-pix_fmt yuv420p",
      ])
    } else {
      ffmpegCmd.size("720x1280")
        .aspect("9:16")
        .outputOptions([
          "-preset ultrafast",
          "-crf 20",
          "-movflags +faststart",
          "-threads 4",
          "-profile:v high",
          "-level 4.1",
          "-pix_fmt yuv420p",
        ])
    }

    ffmpegCmd
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run()
  })
}

// High quality thumbnail generation
const generateThumbnailFast = (videoPath, outputPath, timeOffset) => {
  return new Promise(async (resolve, reject) => {
    // Verify input file exists before processing
    const inputVerification = await verifyVideoFile(videoPath)
    if (!inputVerification.exists) {
      reject(new Error(`Input video file not found: ${videoPath}`))
      return
    }

    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timeOffset],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "720x1280",
      })
      .outputOptions(["-q:v 2"]) // Slightly faster than 1, still good quality
      .on("end", () => {
        console.log(`High-quality thumbnail generated: ${path.basename(outputPath)}`)
        resolve()
      })
      .on("error", (err) => {
        console.error(`Error generating thumbnail ${path.basename(outputPath)}:`, err.message)
        reject(err)
      })
  })
}

const processClipsInParallel = async (videoPath, viralMoments, sessionId, userId, videoType) => {
  const clips = []
  const batchSize = 6 // Increased from 4 to 6 for faster parallel processing

  // Final verification before processing
  const videoVerification = await verifyVideoFile(videoPath)
  if (!videoVerification.exists) {
    throw new Error(`Video file not found for processing: ${videoPath}`)
  }

  console.log(
    `Processing ${viralMoments.length} clips from ${videoVerification.size}MB video in batches of ${batchSize}`,
  )

  for (let i = 0; i < viralMoments.length; i += batchSize) {
    const batch = viralMoments.slice(i, i + batchSize)
    const batchPromises = batch.map(async (moment, batchIndex) => {
      const clipPath = `uploads/clips/${moment.id}.mp4`
      const thumbnailPath = `uploads/thumbnails/${moment.id}.jpg`

      try {
        console.log(`Processing clip ${i + batchIndex + 1}/${viralMoments.length}: ${moment.title}`)
        await extractClipFast(videoPath, clipPath, moment.startTime, moment.duration, videoType)
        await generateThumbnailFast(videoPath, thumbnailPath, moment.startTime + 2)

        return {
          id: moment.id,
          title: `${moment.title} - ${moment.reason}`,
          startTime: moment.startTime,
          endTime: moment.endTime,
          duration: moment.duration,
          viralScore: moment.viralScore,
          thumbnail: `/uploads/thumbnails/${moment.id}.jpg`,
          videoUrl: `/uploads/clips/${moment.id}.mp4`,
          quality: moment.quality,
          videoType: moment.videoType,
          language: moment.language,
          minStartTime: moment.minStartTime,
          maxEndTime: moment.maxEndTime,
          originalStart: moment.originalStart,
          originalEnd: moment.originalEnd,
          canExtend: true,
          canCut: true,
        }
      } catch (error) {
        console.error(`Failed to process clip ${moment.id}:`, error.message)
        return null
      }
    })

    const batchResults = await Promise.all(batchPromises)
    const validClips = batchResults.filter((clip) => clip !== null)
    clips.push(...validClips)

    const session = processingSessions.get(sessionId)
    if (session) {
      session.completedSteps = i + batch.length
      session.progress = 40 + Math.floor((session.completedSteps / viralMoments.length) * 50)
      session.currentStep = `Processed ${Math.min(i + batch.length, viralMoments.length)} of ${viralMoments.length} clips`
      io.emit("progress", { sessionId, ...session })
    }
  }

  // Update user statistics in MongoDB
  if (userId && clips.length > 0) {
    try {
      await User.findByIdAndUpdate(userId, {
        $inc: {
          videosProcessed: 1,
          clipsGenerated: clips.length,
        },
      })
      console.log(`✅ Updated user stats: +1 video, +${clips.length} clips`)
    } catch (error) {
      console.error("Error updating user stats:", error)
    }
  }

  return clips
}

// API Routes
app.post("/api/generate-clips", async (req, res) => {
  try {
    const { url } = req.body
    if (!url) {
      return res.status(400).json({
        success: false,
        error: "YouTube URL is required",
      })
    }

    const sessionId = uuidv4()
    console.log("🎯 Processing URL:", url, "Session:", sessionId)

    // Get user ID from token if provided
    let userId = null
    try {
      const token = req.header("Authorization")?.replace("Bearer ", "")
      if (token) {
        const jwt = require("jsonwebtoken")
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
        userId = decoded.userId
      }
    } catch (error) {
      console.log("No valid token provided, processing without user tracking")
    }

    processingSessions.set(sessionId, {
      url,
      userId,
      status: "starting",
      progress: 0,
      currentStep: "Starting video download...",
      totalSteps: 0,
      completedSteps: 0,
    })

    res.json({
      success: true,
      sessionId,
      message: "Processing started - optimized for 2-3 minute generation",
    })

    processVideoInBackground(sessionId, url)
  } catch (error) {
    console.error("Error starting clip generation:", error)
    res.status(500).json({
      success: false,
      error: "Failed to start processing",
    })
  }
})

const processVideoInBackground = async (sessionId, url) => {
  const session = processingSessions.get(sessionId)
  let videoPath = null

  try {
    session.status = "analyzing"
    session.currentStep = "🔍 Analyzing video..."
    session.progress = 5
    io.emit("progress", { sessionId, ...session })

    session.status = "downloading"
    session.currentStep = "⬇️ Downloading video with audio..."
    session.progress = 10
    io.emit("progress", { sessionId, ...session })

    videoPath = `uploads/videos/${sessionId}.mp4`
    console.log("Starting video download...")

    // Download using ONLY the working method
    const downloadResult = await downloadHighQualityVideo(url, videoPath, sessionId)
    if (!downloadResult.exists) {
      throw new Error("Video download failed")
    }

    console.log(`✅ VIDEO DOWNLOADED: ${downloadResult.size}MB`)

    session.currentStep = "Analyzing video type and language..."
    session.progress = 20
    io.emit("progress", { sessionId, ...session })

    const videoInfo = await youtubedl(url, {
      dumpSingleJson: true,
      noDownload: true,
      noPlaylist: true,
    })

    const duration = videoInfo.duration || 300
    const { language, videoType } = detectVideoTypeAndLanguage(videoInfo)

    console.log(
      `✅ Video: ${Math.floor(duration / 60)} minutes, Type: ${videoType}, Language: ${language}`,
    )

    session.currentStep = `Smart AI analyzing ${language} ${videoType} video...`
    session.progress = 30
    io.emit("progress", { sessionId, ...session })

    const viralMoments = detectSmartMoments(duration, videoType, language, videoInfo)

    session.status = "extracting"
    session.currentStep = `Processing ${viralMoments.length} clips with optimized settings...`
    session.totalSteps = viralMoments.length
    session.completedSteps = 0
    session.progress = 40
    io.emit("progress", { sessionId, ...session })

    const clips = await processClipsInParallel(videoPath, viralMoments, sessionId, session.userId, videoType)

    // Store video info for extend/cut functionality
    session.videoInfo = {
      title: videoInfo.title || "YouTube Video",
      duration: duration,
      originalUrl: url,
      language: language,
      videoType: videoType,
      quality: downloadResult.quality,
      fileSize: downloadResult.size,
      originalVideoPath: videoPath,
    }

    session.status = "completed"
    session.currentStep = `✅ All ${clips.length} clips ready in optimized format!`
    session.progress = 100
    session.clips = clips

    io.emit("progress", { sessionId, ...session })

    console.log(`✅ Generated ${clips.length} optimized clips`)

    // Clean up: Delete the original video after a delay
    setTimeout(async () => {
      try {
        await safeDeleteFile(videoPath)
        console.log(`Cleaned up original video for session: ${sessionId}`)
        if (session.videoInfo) {
          delete session.videoInfo.originalVideoPath
        }
      } catch (error) {
        console.error(`Error cleaning up video for session ${sessionId}:`, error.message)
      }
    }, 300000) // Delete after 5 minutes
  } catch (error) {
    console.error("❌ Processing failed:", error)
    session.status = "error"
    session.currentStep = "❌ Failed to process video"
    session.error = error.message
    io.emit("progress", { sessionId, ...session })

    // Clean up on error
    if (videoPath) {
      await safeDeleteFile(videoPath)
    }
  }
}


app.post("/api/extend-cut-clip", async (req, res) => {
  try {
    const { clipId, newStartTime, newEndTime, sessionId } = req.body

    if (!clipId || newStartTime === undefined || newEndTime === undefined || !sessionId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      })
    }

    const session = processingSessions.get(sessionId)
    if (!session || !session.videoInfo || !session.videoInfo.originalVideoPath) {
      return res.status(404).json({
        success: false,
        error: "Session not found or original video no longer available",
      })
    }

    const originalVideoPath = session.videoInfo.originalVideoPath
    const videoType = session.videoInfo.videoType

    // Check if original video still exists
    const videoVerification = await verifyVideoFile(originalVideoPath)
    if (!videoVerification.exists) {
      return res.status(404).json({
        success: false,
        error: "Original video no longer available for editing",
      })
    }

    const newClipId = uuidv4()
    const newClipPath = `uploads/clips/${newClipId}.mp4`
    const newThumbnailPath = `uploads/thumbnails/${newClipId}.jpg`
    const newDuration = newEndTime - newStartTime

    // Extract custom high-quality clip
    await extractCustomClip(originalVideoPath, newClipPath, newStartTime, newDuration, videoType)
    await generateThumbnailFast(originalVideoPath, newThumbnailPath, newStartTime + 2)

    // Find original clip for reference
    const originalClip = session.clips.find((clip) => clip.id === clipId)

    const customClip = {
      id: newClipId,
      title: `Custom ${originalClip ? originalClip.title : "Clip"}`,
      startTime: newStartTime,
      endTime: newEndTime,
      duration: newDuration,
      viralScore: originalClip ? originalClip.viralScore : 85,
      thumbnail: `/uploads/thumbnails/${newClipId}.jpg`,
      videoUrl: `/uploads/clips/${newClipId}.mp4`,
      quality: "custom-max-quality",
      isCustom: true,
      originalClipId: clipId,
    }

    // Update user stats for custom clip
    if (session.userId) {
      try {
        await User.findByIdAndUpdate(session.userId, {
          $inc: { clipsGenerated: 1 },
        })
        console.log(`✅ Updated user stats: +1 custom clip`)
      } catch (error) {
        console.error("Error updating user stats for custom clip:", error)
      }
    }

    res.json({
      success: true,
      clip: customClip,
      message: "Custom clip created successfully",
    })
  } catch (error) {
    console.error("Error creating custom clip:", error)
    res.status(500).json({
      success: false,
      error: "Failed to create custom clip",
    })
  }
})

app.get("/api/session/:sessionId", (req, res) => {
  const { sessionId } = req.params
  const session = processingSessions.get(sessionId)

  if (!session) {
    return res.status(404).json({
      success: false,
      error: "Session not found",
    })
  }

  res.json({
    success: true,
    session,
  })
})

// Download clip endpoint
app.get("/api/download/:clipId", async (req, res) => {
  try {
    const { clipId } = req.params
    const clipPath = `uploads/clips/${clipId}.mp4`

    await fs.access(clipPath)
    res.download(clipPath, `viral_clip_${clipId}.mp4`)
  } catch (error) {
    console.error("Download error:", error)
    res.status(404).json({
      success: false,
      error: "Clip not found",
    })
  }
})

// Preview clip endpoint
app.get("/api/preview/:clipId", async (req, res) => {
  try {
    const { clipId } = req.params
    const clipPath = `uploads/clips/${clipId}.mp4`

    await fs.access(clipPath)
    const stat = await fs.stat(clipPath)
    const fileSize = stat.size
    const range = req.headers.range

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = Number.parseInt(parts[0], 10)
      const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1
      const chunksize = end - start + 1
      const file = require("fs").createReadStream(clipPath, { start, end })
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      }
      res.writeHead(206, head)
      file.pipe(res)
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      }
      res.writeHead(200, head)
      require("fs").createReadStream(clipPath).pipe(res)
    }
  } catch (error) {
    console.error("Preview error:", error)
    res.status(404).json({
      success: false,
      error: "Clip not found",
    })
  }
})

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "YTShorts API - Production-grade with smart retry and dynamic timeouts",
  })
})

// Cleanup endpoint
app.post("/api/cleanup/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = processingSessions.get(sessionId)

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      })
    }

    // Delete original video if it exists
    if (session.videoInfo && session.videoInfo.originalVideoPath) {
      await safeDeleteFile(session.videoInfo.originalVideoPath)
      delete session.videoInfo.originalVideoPath
    }

    res.json({
      success: true,
      message: "Session cleaned up successfully",
    })
  } catch (error) {
    console.error("Cleanup error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to cleanup session",
    })
  }
})

// Start server
const startServer = async () => {
  await ensureUploadsDir()
  server.listen(PORT, () => {
    console.log(`🎯 YTShorts API server running on port ${PORT}`)
    console.log(`✅ Smart retry mechanism with exponential backoff enabled`)
    console.log(`✅ Dynamic timeout calculation enabled`)
    console.log(`✅ Podcast vertical split enabled`)
    console.log(`✅ MongoDB integration enabled`)
    console.log(`Health check: http://localhost:${PORT}/api/health`)
  })
}

startServer()
