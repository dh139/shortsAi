const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 2
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Bricolage Grotesque,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,4,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.25,0:00:00.65,Caption,,0,0,0,,{\\an5\\pos(540,1460)}{\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H004AFF9D&\\fscx108\\fscy108\\alpha&HFF&\\t(0,70,\\alpha&H00&)\\fscx60\\fscy60\\t(0,110,\\fscx112\\fscy112)\\t(110,200,\\fscx100\\fscy100)}VIRAL {\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H00E8EDE8&}MOMENTS {\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H00E8EDE8&}CAPTURED
Dialogue: 0,0:00:00.65,0:00:01.05,Caption,,0,0,0,,{\\an5\\pos(540,1460)}{\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H00E8EDE8&}VIRAL {\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H004AFF9D&\\fscx108\\fscy108}MOMENTS {\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H00E8EDE8&}CAPTURED
Dialogue: 0,0:00:01.05,0:00:01.55,Caption,,0,0,0,,{\\an5\\pos(540,1460)}{\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H00E8EDE8&}VIRAL {\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H00E8EDE8&}MOMENTS {\\fnBricolage Grotesque\\fs96\\3c&H00000000&\\bord6\\shad4\\c&H004AFF9D&\\fscx108\\fscy108}CAPTURED
`;

fs.writeFileSync('d:/shortsAi/backend/uploads/test_active.ass', assContent);
const safeAss = 'd\\:/shortsAi/backend/uploads/test_active.ass';
const fontsDirSafe = 'd\\:/shortsAi/backend/fonts';

execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', 'd:/shortsAi/backend/uploads/test_1080p_sec.mp4',
  '-vf', `ass='${safeAss}':fontsdir='${fontsDirSafe}'`,
  '-ss', '0.85', '-vframes', '1',
  'd:/shortsAi/backend/uploads/test_active_frame.jpg'
]);
console.log('Frame extracted successfully! Size:', fs.statSync('d:/shortsAi/backend/uploads/test_active_frame.jpg').size);
