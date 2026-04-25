const mongoose = require("mongoose");

const clipJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, index: true },
  status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  videoUrl: String,
  clips: [{
    clipId: String,
    title: String,
    startTime: Number,
    duration: Number,
    viralScore: Number,
    thumbnail: String,
    videoPath: String,
    splitScreenMode: { type: Boolean, default: false },
    speakerCount: { type: Number, default: 1 },
  }],
  currentStep: String,
  errorMessage: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: { expireAfterSeconds: 0 } },
}, { timestamps: true });

module.exports = mongoose.model("ClipJob", clipJobSchema);
