# YTShorts - Viral Clip Generator

A powerful MERN stack application that generates viral short clips from YouTube videos using AI-powered analysis.

## Features

- 🎯 **Real Video Processing**: Downloads and processes actual YouTube videos
- ⚡ **AI-Powered Analysis**: Identifies the most engaging moments automatically
- 📱 **Social Media Ready**: Generates clips in 9:16 format perfect for TikTok, Instagram Reels, and YouTube Shorts
- 💾 **Instant Downloads**: Download clips as high-quality MP4 files
- 🎬 **Video Preview**: Preview clips before downloading
- 📊 **Viral Score**: Each clip gets a viral potential rating

## System Requirements

- Node.js 16+ 
- FFmpeg (for video processing)
- youtube-dl or yt-dlp (handled by npm package)

## Installation

### 1. Install FFmpeg

**Windows:**
- Download from https://ffmpeg.org/download.html
- Add to system PATH

**macOS:**
\`\`\`bash
brew install ffmpeg
\`\`\`

**Ubuntu/Debian:**
\`\`\`bash
sudo apt update
sudo apt install ffmpeg
\`\`\`

### 2. Setup Backend

\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

### 3. Setup Frontend

\`\`\`bash
cd frontend
npm install
npm start
\`\`\`

### 4. Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## How It Works

1. **Video Download**: Uses youtube-dl to download YouTube videos
2. **Content Analysis**: AI analyzes video for viral moments based on:
   - Scene changes
   - Audio peaks
   - Visual engagement factors
3. **Clip Extraction**: FFmpeg extracts clips in optimal format (9:16 ratio)
4. **Thumbnail Generation**: Creates preview thumbnails for each clip
5. **Download**: Serves clips for instant download

## API Endpoints

- `POST /api/generate-clips` - Generate clips from YouTube URL
- `GET /api/download/:clipId` - Download specific clip
- `GET /api/preview/:clipId` - Stream clip for preview
- `GET /api/health` - Health check

## File Structure

\`\`\`
ytshorts/
├── backend/
│   ├── server.js          # Express server
│   ├── package.json       # Backend dependencies
│   └── uploads/           # Generated clips storage
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── App.css        # Styles
│   │   └── index.jsx      # React entry point
│   ├── public/
│   └── package.json       # Frontend dependencies
└── scripts/
    └── setup-system.js    # System setup script
\`\`\`

## Configuration

### Environment Variables (Optional)

Create `.env` file in backend directory:

\`\`\`env
PORT=5000
MAX_CLIP_DURATION=30
MAX_CLIPS_PER_VIDEO=4
UPLOAD_PATH=./uploads
\`\`\`

## Troubleshooting

### Common Issues

1. **FFmpeg not found**
   - Ensure FFmpeg is installed and in system PATH
   - Restart terminal after installation

2. **YouTube download fails**
   - Check if URL is valid and public
   - Some videos may be restricted

3. **Video processing slow**
   - Processing time depends on video length
   - Longer videos take more time to analyze

4. **Clips not generating**
   - Check backend logs for errors
   - Ensure sufficient disk space

## Performance Tips

- Videos under 10 minutes process faster
- Higher quality videos may take longer
- Ensure good internet connection for downloads

## License

MIT License - feel free to use for personal and commercial projects.
