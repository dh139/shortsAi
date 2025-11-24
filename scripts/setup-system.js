const { exec } = require("child_process")
const fs = require("fs")
const path = require("path")

console.log("🚀 Setting up YTShorts system...")

// Check if FFmpeg is installed
const checkFFmpeg = () => {
  return new Promise((resolve) => {
    exec("ffmpeg -version", (error) => {
      if (error) {
        console.log("❌ FFmpeg not found. Please install FFmpeg:")
        console.log("   - Windows: Download from https://ffmpeg.org/download.html")
        console.log("   - macOS: brew install ffmpeg")
        console.log("   - Ubuntu: sudo apt install ffmpeg")
        resolve(false)
      } else {
        console.log("✅ FFmpeg is installed")
        resolve(true)
      }
    })
  })
}

// Check if youtube-dl is available
const checkYoutubeDL = () => {
  return new Promise((resolve) => {
    exec("youtube-dl --version", (error) => {
      if (error) {
        console.log("⚠️  youtube-dl not found globally, using npm package instead")
      } else {
        console.log("✅ youtube-dl is available")
      }
      resolve(true)
    })
  })
}

// Create necessary directories
const createDirectories = async () => {
  const dirs = ["backend/uploads", "backend/uploads/videos", "backend/uploads/clips", "backend/uploads/thumbnails"]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`✅ Created directory: ${dir}`)
    }
  }
}

// Main setup function
const setup = async () => {
  console.log("\n📋 System Requirements Check:")

  const ffmpegOk = await checkFFmpeg()
  await checkYoutubeDL()

  console.log("\n📁 Creating directories...")
  await createDirectories()

  console.log("\n📦 Installation Instructions:")
  console.log("1. Backend setup:")
  console.log("   cd backend && npm install")
  console.log("   npm run dev")
  console.log("")
  console.log("2. Frontend setup (in new terminal):")
  console.log("   cd frontend && npm install")
  console.log("   npm start")
  console.log("")
  console.log("3. Access the application:")
  console.log("   Frontend: http://localhost:3000")
  console.log("   Backend API: http://localhost:5000")

  if (!ffmpegOk) {
    console.log("\n⚠️  WARNING: FFmpeg is required for video processing!")
    console.log("   Please install FFmpeg before running the application.")
  }

  console.log("\n🎉 Setup complete!")
}

setup()
