const fs = require('fs');
const { execFileSync } = require('child_process');

const assEstate = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 2
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Montserrat,100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,0,4,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.25,0:00:02.00,Caption,,0,0,0,,{\\an5\\pos(540,960)}{\\fnInter\\fs68\\3c&H00000000&\\bord4\\shad3\\c&H00FFFFFF&\\alpha&HFF&\\t(0,60,\\alpha&H00&)}trending templates\\N{\\fnInter\\fs68\\3c&H00000000&\\bord4\\shad3\\c&H00FFFFFF&\\alpha&HFF&\\t(300,360,\\alpha&H00&)}designed for\\N{\\fnMontserrat Bold\\fs130\\3c&H00FFFFFF&\\bord6\\shad6\\c&H00FFD01C&\\fscx112\\fscy112\\alpha&HFF&\\t(600,660,\\alpha&H00&)}VIRAL REELS
`;

fs.writeFileSync('d:/shortsAi/backend/uploads/test_estate_fixed.ass', assEstate);
const safeAss = 'd\\:/shortsAi/backend/uploads/test_estate_fixed.ass';
const fontsDirSafe = 'd\\:/shortsAi/backend/fonts';

execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', 'd:/shortsAi/backend/uploads/test_1080p_sec.mp4',
  '-vf', `ass='${safeAss}':fontsdir='${fontsDirSafe}'`,
  '-ss', '1.0', '-vframes', '1',
  'd:/shortsAi/backend/uploads/test_estate_frame.jpg'
]);
console.log('Estate Frame extracted successfully!');
