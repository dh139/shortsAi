const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs").promises;

async function run() {
  const inputVideo = "uploads/clips/d4db75f4-4099-4b7f-92d4-94cc69a14941.mp4";
  const outputVideo = "uploads/clips/test_font_output.mp4";
  const assPath = "uploads/test_font.ass";
  
  // Create a sample ASS subtitle content with Poppins font
  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: S,Poppins,90,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,60,60,346,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,S,,0,0,0,,{\\an2}Poppins Bold Font Test
`;

  await fs.writeFile(assPath, assContent, "utf8");
  
  const safeAss = path.resolve(assPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
  const fontsDir = path.resolve("fonts");
  const fontsDirSafe = fontsDir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
  
  console.log("Safe ASS Path:", safeAss);
  console.log("Fonts Dir Safe Path:", fontsDirSafe);
  
  const vfVal = `ass='${safeAss}':fontsdir='${fontsDirSafe}'`;
  
  ffmpeg(inputVideo)
    .output(outputVideo)
    .videoCodec("libx264")
    .audioCodec("copy")
    .outputOptions([
      "-vf", vfVal,
      "-preset", "superfast",
      "-loglevel", "verbose" // Ask for verbose logging to see font selection logs
    ])
    .on("start", (cmd) => {
      console.log("Spawned command:", cmd);
    })
    .on("stderr", (line) => {
      if (line.includes("font") || line.includes("Font") || line.includes("ass") || line.includes("Parsed")) {
        console.log("[ffmpeg]", line);
      }
    })
    .on("end", () => {
      console.log("Successfully completed!");
    })
    .on("error", (err) => {
      console.error("Failed:", err.message);
    })
    .run();
}

run();
