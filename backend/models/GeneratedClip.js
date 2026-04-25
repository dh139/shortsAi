const mongoose = require("mongoose");

const generatedClipSchema = new mongoose.Schema({
  clipId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  sessionId: String,
  title: String,
  videoUrl: String,
  thumbnail: String,
  videoPath: String,
  duration: Number,
  startTime: Number,
  viralScore: Number,
  videoType: { type: String, enum: ["podcast", "vlog", "tutorial", "comedy", "gaming", "music", "news", "review", "general"] },
  language: { type: String, default: "english" },
  captionStyle: String,
  splitScreenMode: { type: Boolean, default: false },
  speakerCount: { type: Number, default: 1 },
  tags: [String],
  views: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("GeneratedClip", generatedClipSchema);
