# Shorts Studio — Viral Clip Generator (no login)

Generate viral 9:16 clips from a YouTube URL **or an uploaded video** — with
accurate word-by-word captions in **English / Hindi (Devanagari) / Hinglish
(Roman) / Gujarati**, 33 trending caption styles (pop/bounce/karaoke/neon/
slide/fade/pill), podcast split framing, caption drag + word editing, and
1080p-first downloads (1080p → 720p → best lower — never 4K/1440p).
**No register / login required.**

## Setup

### 1. System tools
- **FFmpeg + ffprobe** in PATH. Windows: https://ffmpeg.org/download.html
- **whisper** for real captions: `pip install openai-whisper` (needs Python).
  Without it, captions fall back to placeholders. For best Indic accuracy,
  whisper downloads the `base`/`small` model automatically on first use.
- `yt-dlp` — ships via `npm install` (`youtube-dl-exec`) or keep `yt-dlp.exe`
  next to `backend/server.js`.

### 2. Backend (port 5000)
```bash
cd backend
npm install
npm start
```
No `MONGODB_URI` needed — sessions are in-memory. Health: `http://localhost:5000/api/health`
- AI clip picking: Powered by **Google AI Studio (Gemini)** (`GEMINI_API_KEY`).
  Analyzes full timestamped transcripts, chapters, and metadata to extract high-hook,
  viral short-form moments for YouTube Shorts / Reels / TikTok.

### 3. Frontend (port 3000)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` — paste a URL or upload a file, pick language +
framing, Generate.

## What changed (v17)
- Login removed — `/` is the studio. Old `/login`/`/register` redirect home.
- Downloader v11: exact-height 1080p, else 720p, else best lower. **Never 4K
  or 1440p** — the format chain cannot pick a resolution above 1080p. Quality is
  probed from the file, never guessed from size. A stall watchdog kills any
  attempt that shows no download progress for 5 minutes and the next strategy
  resumes from kept fragments.
- Whisper: `base` full-video, `small` per-clip for Hindi/Gujarati; language
  hint skips the 30s probe; Hinglish = Hindi STT transliterated to Roman.
- Captions: 33 styles with burned-in animations (libass). Preview and the
  downloaded file are the same burn. Drag position in fullscreen 9:16 player;
  edit words via Words button; layout via Framing pills (Smart/Split/Center/Fit).
- Upload: `POST /api/upload` (multipart `video`) → same clip + caption pipeline.
- Endpoints: `POST /api/generate-clips` `{url, language, layout}`,
  `POST /api/add-captions/:clipId`, `PUT /api/clips/:clipId/captions`,
  `POST /api/re-layout`, `GET /api/download/:clipId_captioned?style=&...`,
  `POST /api/extend-cut-clip`.

## Palette / design
Orange `#FF6B35`, off-white `#F5F4F0`, slate `#2C4A5E`, black. Fonts: Outfit /
Inter (UI), Poppins / Montserrat / Impact (captions).
