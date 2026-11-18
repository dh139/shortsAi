/**
 * Burns the caption templates onto a test clip and writes sample frames, so
 * the rendered result can be eyeballed.
 *
 *   node tools/test-caption-burn.js [templateId ...]
 *
 * Output: backend/uploads/captest/<template>-<n>.jpg
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const engine = require("../captionEngine");

const BACKEND = path.join(__dirname, "..");
const OUT_DIR = path.join(BACKEND, "uploads", "captest");
const FONT_DIR = path.join(BACKEND, "fonts");
const SOURCE = path.join(BACKEND, "uploads", "test_1080p_sec.mp4");

const ffmpegPathSafe = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");

function run(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function main() {
  const wanted = process.argv.slice(2);
  const catalogue = engine.listTemplates({ width: 1080, height: 1920 });
  const ids = wanted.length
    ? wanted
    : ["master", "mrbeast-classic", "discipline", "impact-glow", "karaoke-classic", "glowly-1", "vogue", "boxed"];

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // A 9:16 test plate.
  const plate = path.join(OUT_DIR, "_plate.mp4");
  if (!fs.existsSync(plate)) {
    run([
      "-i", SOURCE,
      "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=-0.08:saturation=0.7",
      "-t", "5", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", plate,
    ]);
  }

  // A short script with word-level timings.
  const words = [];
  const script = [
    "this", "is", "how", "premium", "captions", "look", "when", "every",
    "word", "lands", "on", "its", "own", "timestamp",
  ];
  let t = 0.25;
  script.forEach((w, i) => {
    const dur = 0.22 + (i % 3) * 0.06;
    words.push({ word: w, start: t, end: t + dur });
    t += dur + 0.04;
  });

  for (const id of ids) {
    const spec = engine.resolveTemplate(id, { width: 1080, height: 1920 });
    const ass = engine.buildAss(spec, words, { width: 1080, height: 1920 });
    const assPath = path.join(OUT_DIR, `${id}.ass`);
    fs.writeFileSync(assPath, ass, "utf8");

    const out = path.join(OUT_DIR, `${id}.mp4`);
    run([
      "-i", plate,
      "-vf", `ass='${ffmpegPathSafe(assPath)}':fontsdir='${ffmpegPathSafe(FONT_DIR)}'`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
      out,
    ]);

    // Sample frames across the clip.
    for (const at of [0.55, 1.35, 2.45]) {
      run(["-ss", String(at), "-i", out, "-vframes", "1", "-q:v", "3",
        path.join(OUT_DIR, `${id}-${at}.jpg`)]);
    }
    console.log(
      `${id.padEnd(18)} font=${spec.fontFamily} ${spec.fontSize}px ${spec.fontWeight} ` +
      `colour=${spec.color} entrance=${spec.entrance} chunks=${spec.wordsPerChunk} lines=${spec.linesPerBlock}`,
    );
  }
  console.log("frames ->", OUT_DIR);
}

main();
