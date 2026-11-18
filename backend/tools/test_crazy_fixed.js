const fs = require('fs');
const { execFileSync } = require('child_process');

const assCrazy = `[Script Info]
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
Dialogue: 0,0:00:00.25,0:00:02.00,Caption,,0,0,0,,{\\an5\\pos(540,960)}{\\fnMontserrat\\fs65\\3c&H00000000&\\bord4\\shad3\\c&H00FFFFFF&\\alpha&HFF&\\t(0,36,\\alpha&H00&)\\fscx60\\fscy60\\t(0,66,\\fscx112\\fscy112)\\t(66,120,\\fscx100\\fscy100)}this is\\N{\\fnMontserrat Bold\\fs135\\3c&H00000000&\\bord8\\shad8\\c&H00008FFF&\\fscx115\\fscy115\\alpha&HFF&\\t(260,296,\\alpha&H00&)\\fscx60\\fscy60\\t(260,326,\\fscx115\\fscy115)\\t(326,380,\\fscx115\\fscy115)}HOW PREMIUM\\N{\\fnMontserrat\\fs65\\3c&H00000000&\\bord4\\shad3\\c&H00FFFFFF&\\alpha&HFF&\\t(580,616,\\alpha&H00&)\\fscx60\\fscy60\\t(580,646,\\fscx112\\fscy112)\\t(646,700,\\fscx100\\fscy100)}captions look
`;

fs.writeFileSync('d:/shortsAi/backend/uploads/test_crazy_fixed.ass', assCrazy);
const safeAss = 'd\\:/shortsAi/backend/uploads/test_crazy_fixed.ass';
const fontsDirSafe = 'd\\:/shortsAi/backend/fonts';

execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', 'd:/shortsAi/backend/uploads/test_1080p_sec.mp4',
  '-vf', `ass='${safeAss}':fontsdir='${fontsDirSafe}'`,
  '-ss', '1.0', '-vframes', '1',
  'd:/shortsAi/backend/uploads/test_crazy_frame.jpg'
]);
console.log('Crazy Frame extracted successfully!');
