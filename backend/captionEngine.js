/**
 * Caption engine — renders the WhiteStair template catalogue to burned-in
 * subtitles (ASS/libass) and to a matching browser preview.
 *
 * The catalogue in `whitestair-templates.json` is extracted from the public
 * WhiteStair bundle (see tools/extract-whitestair-templates.js). It carries
 * the real per-template typography and layout rules, which is what makes the
 * captions look designed rather than generated:
 *
 *   fontFamily / lineFonts / fontSize / fontWeight   typography
 *   color / accentColor / outlineColor                colour
 *   fontBorderWidth                                   stroke width
 *   textCase                                          case
 *   position                                          top 14% / centre 50% / bottom 85%
 *   minWordsPerChunk / maxWordsPerChunk / linesPerBlock   layout
 *   singleLine / fixedChunking                        layout mode
 *
 * SIZING matches WhiteStair's own renderer exactly:
 *
 *   fontSize = 0.6 * theme.fontSize * captionScale      (on a 360-wide canvas)
 *
 * and everything is scaled by outputWidth / 360 for the final frame, so the
 * burned result has the same proportions as the preview.
 *
 * ANIMATION is the other half. WhiteStair drives per-word entrances with CSS
 * keyframes and a per-word `animation-delay`. libass cannot run CSS, but it
 * can animate scale, rotation, alpha, blur and position, so each entrance is
 * re-implemented here as an ASS `\t()` chain with the same geometry and
 * timing.
 */
const fs = require("fs");
const path = require("path");

const CATALOGUE_PATH = path.join(__dirname, "whitestair-templates.json");
const FONT_INDEX_PATH = path.join(__dirname, "fonts", "_index.json");

// WhiteStair lays captions out on a 360x640 reference canvas.
const REFERENCE_WIDTH = 360;
const REFERENCE_HEIGHT = 640;
const SIZE_FACTOR = 0.6;        // WhiteStair: 0.6 * theme.fontSize
const BASE_UNIT = 14;           // WhiteStair: max(9, 14 * scale)
const LINE_HEIGHT = 1.3;

// ── load catalogue + font index ──────────────────────────────────────────────
let catalogue = null;
function loadCatalogue() {
  if (catalogue) return catalogue;
  catalogue = JSON.parse(fs.readFileSync(CATALOGUE_PATH, "utf8"));
  return catalogue;
}

let fontIndex = null;
function loadFontIndex() {
  if (fontIndex) return fontIndex;
  try {
    fontIndex = JSON.parse(fs.readFileSync(FONT_INDEX_PATH, "utf8"));
  } catch {
    fontIndex = { families: {}, byLower: {} };
  }
  return fontIndex;
}

/**
 * Map a WhiteStair font family to the font file we actually installed, and
 * return the family name libass must be told to use.
 */
function resolveFont(family, weight) {
  const idx = loadFontIndex();
  if (!family) return { family: "Arial", file: null };
  const hit = idx.byLower[String(family).toLowerCase()];
  if (!hit) {
    // Fall back to any installed family with the same first word.
    const first = String(family).toLowerCase().split(/\s+/)[0];
    for (const [key, value] of Object.entries(idx.byLower)) {
      if (key.split(/\s+/)[0] === first) return { family: value.family, file: pickWeight(value.weights, weight) };
    }
    return { family, file: null };
  }
  return { family: hit.family, file: pickWeight(hit.weights, weight) };
}

function pickWeight(weights, weight) {
  if (!weights) return null;
  const want = Number(weight) || 400;
  if (weights[want]) return weights[want];
  const available = Object.keys(weights).map(Number).sort((a, b) => a - b);
  if (!available.length) return null;
  // Nearest available weight.
  let best = available[0];
  for (const w of available) if (Math.abs(w - want) < Math.abs(best - want)) best = w;
  return weights[best];
}

// ── legacy style ids → catalogue template ids ────────────────────────────────
// The previous hand-written preset names stay valid so existing projects and
// bookmarks keep working; they now resolve to real catalogue templates.
const LEGACY_ALIASES = {
  shortai: "shortai",
  discipline: "discipline",
  crazy: "crazy",
  estate4: "estate-3",
  hormozi1: "mrbeast-classic",
  hormozi2: "impact-glow",
  beast: "impact-2",
  karaoke: "karaoke-classic",
  bounce: "mrbeast-classic",
  neon: "glowly-1",
  fire: "impact-glow",
  minimal: "solo",
  brutal: "slam",
  boxed: "boxed",
  typewriter: "word-highlight",
  slide: "clean",
  fadeIn: "clean",
  pill: "oneword-pill",
  pop: "mrbeast-classic",
  negativa: "editor",
  cove: "smooth",
  leon: "red-wipe",
  laguna: "clean",
  tuba: "clean",
  splitz: "story",
  aria: "headline",
  stack: "triple",
  lume: "story",
  marca: "boxed",
  canto: "story",
  silk: "glow-word",
  slash: "vogue",
  dense: "scatter",
  open: "clean",
  vibe: "clean",
  rise: "headline",
  prism: "fusion-1",
};

// ── colour helpers ───────────────────────────────────────────────────────────
function hexToAss(hex, alpha) {
  if (!hex) return "&H00FFFFFF";
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return "&H00FFFFFF";
  const c = m[1];
  const r = c.slice(0, 2), g = c.slice(2, 4), b = c.slice(4, 6);
  const a = alpha === undefined ? "00" : alpha;
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function withAlpha(hex, alphaByte) {
  return hexToAss(hex, alphaByte);
}

function applyTextCase(text, textCase) {
  if (!text) return text;
  switch (textCase) {
    case "uppercase": return text.toUpperCase();
    case "lowercase": return text.toLowerCase();
    case "capitalize": return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default: return text;
  }
}

// ── template resolution ──────────────────────────────────────────────────────
// WhiteStair applies a per-template size override before rendering (the
// `OE` function in the bundle). Templates that would otherwise be oversized
// get scaled down; cursive gets scaled up.
const SIZE_OVERRIDES = {
  spotlight: 0.72,
  discipline: 0.85,
  creator3: 0.85,
  hind: 0.85,
  cursive: 1.5,
  spark: 0.88,
  tripleColors: 0.82,
};

/**
 * Resolve a template id (or legacy alias) into a complete render spec.
 *
 * @param {string} id            template id or legacy alias
 * @param {object} opts          { captionScale, width, height }
 */
function resolveTemplate(id, opts = {}) {
  const cat = loadCatalogue();
  const wanted = LEGACY_ALIASES[id] || id;

  const posOverride = opts.overrides || opts || {};
  const width = Number(opts.width) || 1080;
  const height = Number(opts.height) || 1920;
  const scale = width / REFERENCE_WIDTH;

  // ── ShortAI Editorial Signature Template ──────────────────────────────────
  if (id === "shortai" || wanted === "shortai") {
    const requestedFamily = posOverride.fontFamily || "Bricolage Grotesque";
    const mainFont = resolveFont(requestedFamily, 800);
    const customFontSize = Number(posOverride.fontSize) > 0 ? Number(posOverride.fontSize) : 96;
    const fontSizePx = Math.round(customFontSize * (width / 1080));
    const color = posOverride.textColor || "#EDEDE8";
    const accent = posOverride.highlightColor || "#9DFF4A";
    const posXpct = posOverride.positionX != null ? Number(posOverride.positionX) : 50;
    const posYpct = posOverride.positionY != null ? Number(posOverride.positionY) : 76;

    return {
      id: "shortai",
      requestedId: "shortai",
      name: "ShortAI Editorial",
      description: "ShortAI signature editorial style: bold grotesque with active word acid pop",
      tags: ["Featured", "Signature", "Editorial", "Dynamic", "Karaoke"],
      fontFamily: mainFont.family,
      fontFile: mainFont.file,
      lineFontFamilies: [],
      fontWeight: 800,
      fontSize: fontSizePx,
      fontSizeRef: Math.round(fontSizePx / scale),
      refFontSize: Math.round(fontSizePx / scale),
      strokeWidth: Math.max(2, Math.round(6 * (width / 1080))),
      refStroke: 2,
      color,
      accent,
      outline: "#000000",
      textCase: "uppercase",
      position: { x: posXpct, y: posYpct },
      linesPerBlock: 1,
      minWordsPerChunk: 2,
      maxWordsPerChunk: 3,
      wordsPerChunk: 3,
      oneWord: false,
      singleLine: true,
      entrance: "pop-in",
      entranceCssClass: "anim-pop",
      entranceDuration: 0.25,
      entranceBaseDuration: 0.25,
      entranceDelayBase: 0.08,
      entranceScale: 1,
      exit: "none",
      karaoke: true, // Active word highlighting enabled!
      perWordEntrance: false,
      hidden: false,
      reference: { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT },
      frame: { width, height },
    };
  }

  const theme =
    cat.templates.find((t) => t.id === wanted) ||
    cat.templates.find((t) => t.id === id) ||
    cat.templates.find((t) => t.id === "mrbeast-classic");

  if (!theme) throw new Error("caption template catalogue is empty");

  const captionScale = Number(opts.captionScale) > 0 ? Number(opts.captionScale) : 1;
  const flags = theme.structuralFlags || [];

  // ── typography ─────────────────────────────────────────────────────────────
  const fontWeight = Number(theme.fontWeight) || 700;
  const requestedFamily = posOverride.fontFamily || theme.fontFamily;
  const mainFont = resolveFont(requestedFamily, fontWeight);
  const lineFonts = (theme.lineFonts || []).map((f) => resolveFont(f, fontWeight));

  // ── sizes (reference canvas → output canvas) ──────────────────────────────
  let fontSizePx;
  let refFontSize;
  if (posOverride.fontSize && Number(posOverride.fontSize) > 0) {
    fontSizePx = Math.round(Number(posOverride.fontSize) * (width / 1080));
    refFontSize = Math.round(fontSizePx / scale);
  } else {
    let themeSize = Number(theme.fontSize) || 36;
    for (const [flag, factor] of Object.entries(SIZE_OVERRIDES)) {
      if (flags.includes(flag)) { themeSize = Math.round(themeSize * factor); break; }
    }
    refFontSize = Math.max(BASE_UNIT, Math.round(SIZE_FACTOR * themeSize * captionScale));
    fontSizePx = Math.round(refFontSize * scale);
  }
  const refStroke = theme.fontBorderWidth > 0 ? Math.max(1, Math.round(0.5 * theme.fontBorderWidth)) : 0;
  const strokePx = Math.max(0, Math.round(refStroke * scale));

  // ── position ───────────────────────────────────────────────────────────────
  let posXpct = posOverride.positionX != null ? Number(posOverride.positionX) : 50;
  let posYpct = posOverride.positionY != null ? Number(posOverride.positionY) : (
    theme.position === "top" ? 18 :
    theme.position === "center" ? 50 : 76
  );
  if (flags.includes("podcast") && posOverride.positionX == null && posOverride.positionY == null) {
    posXpct = 8; posYpct = 86;
  }
  const pos = { x: posXpct, y: posYpct };

  // ── colour ─────────────────────────────────────────────────────────────────
  let rawColor = posOverride.textColor || theme.color || theme.primaryColor || "#FFFFFF";
  if (rawColor === "#000000" && (!theme.outlineColor || theme.outlineColor === "#000000")) {
    rawColor = "#FFFFFF";
  }
  const color = rawColor;
  const accent = posOverride.highlightColor || theme.accentColor || theme.highlightColor || color;
  const outline = theme.outlineColor || "#000000";

  // ── layout ─────────────────────────────────────────────────────────────────
  const linesPerBlock = Math.max(1, Number(theme.linesPerBlock) || 1);
  const minWords = Math.max(1, Number(theme.minWordsPerChunk) || 2);
  const maxWords = Math.max(minWords, Number(theme.maxWordsPerChunk) || Math.max(minWords, 3));
  const singleLine = !!theme.singleLine;

  // Words per chunk. Multi-line templates distribute the chunk over their
  // lines; the big "one word at a time" templates keep a single word so the
  // entrance animation lands on one word.
  const ONE_WORD_TEMPLATES = new Set([
    "master", "slam", "punch", "vogue", "headline", "kinetic", "discipline",
    "impact-glow", "impact-2", "crazy-2", "crazy", "estate-3", "estate-2",
    "estate", "estate-1", "scatter", "spotlight", "gamer", "creator-4",
    "dyn-luxe", "dyn-poster", "dyn-estate", "red-wipe", "hook", "cook",
  ]);
  const oneWord = (ONE_WORD_TEMPLATES.has(theme.id) || flags.includes("wordByWord")) && linesPerBlock <= 1;
  // A multi-line block needs one chunk's worth of words per line, so the
  // lines stack instead of replacing each other.
  const wordsPerChunk = linesPerBlock > 1
    ? Math.max(linesPerBlock, Math.min(maxWords, linesPerBlock * 2))
    : oneWord
      ? 1
      : maxWords;

  // ── motion ─────────────────────────────────────────────────────────────────
  const entrance = pickEntrance(cat, flags, theme);
  const exit = pickExit(cat, flags, theme);
  // WhiteStair squeezes every entrance to the last word's duration per
  // template; the same number is used here so the two match.
  const entranceScale = pickEntranceScale(cat, flags) || 1;
  const baseDuration = entrance.duration ?? (cat.cssDurations[entrance.cssClass] || 0.4);
  // The template's static cap. The effective duration is computed per chunk
  // (see buildAss) because WhiteStair squeezes the entrance to the chunk's
  // own length: "the shared --entrance-scale squeezing all of this down to
  // the last word's duration".
  const duration = baseDuration * entranceScale;

  return {
    id: theme.id,
    requestedId: id,
    name: theme.name,
    description: theme.description,
    tags: theme.tags || [],
    fontFamily: mainFont.family,
    fontFile: mainFont.file,
    lineFontFamilies: lineFonts.map((f) => f.family),
    fontWeight,
    fontSize: fontSizePx,
    fontSizeRef: refFontSize,
    refFontSize,
    strokeWidth: strokePx,
    refStroke,
    color,
    accent,
    outline,
    textCase: theme.textCase || "none",
    position: pos,
    linesPerBlock,
    minWordsPerChunk: minWords,
    maxWordsPerChunk: maxWords,
    wordsPerChunk,
    oneWord,
    singleLine,
    entrance: entrance.id,
    entranceCssClass: entrance.cssClass,
    entranceDuration: Number(duration.toFixed(3)),
    entranceBaseDuration: Number(baseDuration.toFixed(3)),
    entranceDelayBase: entrance.delayBase || 0,
    entranceScale,
    exit: exit.id,
    karaoke: flags.includes("karaoke") || flags.includes("word-highlight") || flags.includes("popular") || flags.includes("focus"),
    perWordEntrance: oneWord,
    hidden: !!theme.raw?.hidden,
    reference: { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT },
    frame: { width, height },
  };
}

/**
 * Template → entrance animation.
 *
 * WhiteStair gives most templates a bespoke entrance (masterPop, impactPop,
 * slamIn, punchInLeft, redWipeRise, vogueFromLeft, luxeBlurIn, …). The names
 * come straight from the template's own @keyframes in the bundle, so this
 * table is the one-to-one mapping from a template to its motion.
 */
const TEMPLATE_ENTRANCE = {
  master: "appear-zoom",
  discipline: "slide-up",
  "impact-glow": "slam",
  "impact-2": "slam",
  slam: "slam",
  punch: "punch-in-left",
  "red-wipe": "pop-in",
  vogue: "slide-left",
  spotlight: "appear-zoom",
  creator: "pop-in",
  "creator-2": "pop-in",
  "creator-3": "pop-in",
  "creator-4": "pop-in",
  "estate-1": "slide-up",
  estate: "slide-up",
  "estate-2": "slide-up",
  "estate-3": "slide-up",
  "dyn-estate": "slide-up",
  "dyn-classic": "pop-in",
  "dyn-creator": "pop-in",
  "dyn-simple": "pop-in",
  "dyn-poster": "pop-in",
  "dyn-doctor": "pop-in",
  "dyn-luxe": "luxe-blur",
  gamer: "gamer-door",
  boxed: "pop-in",
  perfect: "pop-in",
  girly: "pop-in",
  "girly-sparkle": "pop-in",
  scatter: "bounce-drop",
  sticker: "pop-in",
  ransom: "pop-in",
  "ransom-animate": "pop-in",
  kinetic: "slide-up",
  clean: "slide-up",
  editor: "pop-in",
  headline: "pop-in",
  "script-mix": "pop-in",
  scribble: "pop-in",
  gilded: "slide-up",
  notification: "notif-slide-down",
  "popup-chat-bubble": "notif-pop",
  "popup-chat-bubble-left": "notif-pop",
  "dynamic-sliding-highlight": "pop-in",
  "karaoke-classic": "fade",
  "word-highlight": "pop-in",
  popular: "pop-in",
  focus: "pop-in",
  open: "pop-in",
  "mrbeast-classic": "pop-in",
  solo: "slide-up",
  handwritten: "fade",
  cleanRise: "slide-up",
  story: "slide-up",
  cook: "fade",
  "cursive-highlight": "fade",
  "oneword-pill": "pop-in",
  "glow-word": "fade",
  "torn-paper": "pop-in",
  "shadow-3d": "pop-in",
  "crazy-2": "slide-up",
  crazy: "pop-in",
  spark: "pop-in",
  smooth: "pop-in",
  "smooth-fusion": "pop-in",
  triple: "pop-in",
  fusion: "pop-in",
  "shine-1": "pop-in",
  "shine-2": "pop-in",
  "glowly-1": "pop-in",
  "glowly-2": "pop-in",
  "bubble-pop": "pop-in",
  "mint-punch": "pop-in",
  "mrbeast": "pop-in",
};

/**
 * Template-specific entrances that have no entry in WhiteStair's transition
 * registry (they are baked into the template's own @keyframes).
 */
const VIRTUAL_ENTRANCES = {
  fade: { id: "fade", name: "Fade", cssClass: "anim-fade", delayBase: 0.08, duration: 0.3 },
  "punch-in-left": { id: "punch-in-left", name: "Punch In", cssClass: "anim-punch", delayBase: 0.06, duration: 0.22 },
  "luxe-blur": { id: "luxe-blur", name: "Luxe Blur", cssClass: "anim-luxe", delayBase: 0.1, duration: 0.42 },
  "gamer-door": { id: "gamer-door", name: "Gamer Door", cssClass: "anim-gamer-door", delayBase: 0.1, duration: 0.5 },
  "crazy2-right": { id: "crazy2-right", name: "Crazy 2", cssClass: "anim-crazy2-right", delayBase: 0.1, duration: 0.9 },
};

/** Choose the entrance transition for a template. */
function pickEntrance(cat, flags, theme) {
  const byId = new Map(cat.entrances.map((e) => [e.id, e]));
  const explicit = TEMPLATE_ENTRANCE[theme.id];
  if (explicit) {
    if (byId.has(explicit)) return byId.get(explicit);
    if (VIRTUAL_ENTRANCES[explicit]) return VIRTUAL_ENTRANCES[explicit];
  }
  if (theme.notifDefaultTransition && byId.has(theme.notifDefaultTransition)) {
    return byId.get(theme.notifDefaultTransition);
  }
  const map = [
    ["crazy2", "crazy2-right"],
    ["gamer", "gamer-door"],
    ["notificationBanner", "notif-slide-down"],
    ["popupChat", "notif-pop"],
  ];
  for (const [flag, id] of map) {
    if (!flags.includes(flag)) continue;
    if (byId.has(id)) return byId.get(id);
    if (VIRTUAL_ENTRANCES[id]) return VIRTUAL_ENTRANCES[id];
  }
  return byId.get("pop-in") || cat.entrances[0];
}

function pickExit(cat, flags, theme) {
  const byId = new Map(cat.exits.map((e) => [e.id, e]));
  return byId.get("none") || cat.exits[0];
}

/** WhiteStair's per-template entrance scale (the `Sy` function in the bundle). */
function pickEntranceScale(cat, flags) {
  const scale = cat.templateEntranceScale || {};
  const map = [
    ["discipline", "discipline"], ["kinetic", "kinetic"], ["impactGlow", "impactGlow"],
    ["slam", "slam"], ["punch", "punch"], ["redWipe", "redWipe"], ["boxed", "boxed"],
    ["popupChat", "popupChat"], ["perfect", "perfect"], ["notificationBanner", "notificationBanner"],
    ["hind", "hind"], ["smooth", "smooth"], ["gamer", "gamer"], ["typographyDynamic", "typographyDynamic"],
    ["crazy2", "crazy2"], ["estateTri", "estateTri"], ["dynSimple", "dynSimple"],
    ["dynPoster", "dynPoster"], ["dynEstate", "dynEstate"], ["editor", "editor"],
    ["solo", "solo"], ["girly", "girly"], ["scatter", "scatter"], ["spotlight", "spotlight"],
    ["slidingHighlight", "slidingHighlight"], ["sticker", "sticker"],
    ["ransomAnimate", "ransomAnimate"], ["ransom", "ransom"], ["master", "master"],
  ];
  for (const [flag, key] of map) if (flags.includes(flag) && scale[key] !== undefined) return scale[key];
  return 1;
}

// ── entrance animations ──────────────────────────────────────────────────────
// Each entry returns ASS override tags that animate a chunk from its entrance
// state to its resting state.
//
//   (d, off) -> d = duration in ms, off = delay in ms before the animation
//               starts (the word's own offset inside the block)
//
// The geometry mirrors WhiteStair's CSS keyframes one-for-one; see
// `whitestair-templates.json` → keyframeNames / cssBlocks for the originals.
const ENTRANCE_ASS = {
  "pop-in": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx60\\fscy60\\t(${off},${off + Math.round(d * 0.55)},\\fscx112\\fscy112)\\t(${off + Math.round(d * 0.55)},${off + d},\\fscx100\\fscy100)`
  ],
  spring: (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx50\\fscy50\\t(${off},${off + Math.round(d * 0.62)},\\fscx120\\fscy120)\\t(${off + Math.round(d * 0.62)},${off + d},\\fscx100\\fscy100)`
  ],
  slam: (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(70, Math.round(d * 0.25))},\\alpha&H00&)\\fscx220\\fscy220\\blur5\\t(${off},${off + d},\\fscx100\\fscy100\\blur0)`
  ],
  "appear-zoom": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx50\\fscy50\\t(${off},${off + Math.round(d * 0.7)},\\fscx110\\fscy110)\\t(${off + Math.round(d * 0.7)},${off + d},\\fscx100\\fscy100)`
  ],
  "slide-up": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(90, Math.round(d * 0.3))},\\alpha&H00&)`
  ],
  "slide-down-fade": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(90, Math.round(d * 0.3))},\\alpha&H00&)`
  ],
  "slide-left": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(90, Math.round(d * 0.3))},\\alpha&H00&)`
  ],
  "slide-right": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(90, Math.round(d * 0.3))},\\alpha&H00&)`
  ],
  "bounce-drop": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx100\\fscy100\\t(${off},${off + Math.round(d * 0.66)},\\fscx112\\fscy112)\\t(${off + Math.round(d * 0.66)},${off + Math.round(d * 0.85)},\\fscx98\\fscy98)\\t(${off + Math.round(d * 0.85)},${off + d},\\fscx100\\fscy100)`
  ],
  "rotate-3d": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\frx90\\t(${off},${off + d},\\frx0)`
  ],
  "blur-reveal": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\blur8\\t(${off},${off + d},\\blur0)`
  ],
  flicker: (d, off = 0) => [
    `\\alpha&H30&\\t(${off},${off + Math.round(d * 0.2)},\\alpha&H00&)\\t(${off + Math.round(d * 0.2)},${off + Math.round(d * 0.5)},\\alpha&H40&)\\t(${off + Math.round(d * 0.5)},${off + d},\\alpha&H00&)`
  ],
  typewriter: (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(60, Math.round(d * 0.25))},\\alpha&H00&)`
  ],
  "char-snap": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(70, Math.round(d * 0.25))},\\alpha&H00&)\\fscx180\\fscy180\\frz15\\t(${off},${off + d},\\fscx100\\fscy100\\frz0)`
  ],
  "notif-pop": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx55\\fscy55\\t(${off},${off + Math.round(d * 0.6)},\\fscx106\\fscy106)\\t(${off + Math.round(d * 0.6)},${off + d},\\fscx100\\fscy100)`
  ],
  "notif-slide-down": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)`
  ],
  "notif-slide-left": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)`
  ],
  fade: (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(90, Math.round(d * 0.35))},\\alpha&H00&)`
  ],
  "punch-in-left": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(70, Math.round(d * 0.25))},\\alpha&H00&)\\fscx135\\fscy135\\t(${off},${off + d},\\fscx100\\fscy100)`
  ],
  "luxe-blur": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\blur7\\t(${off},${off + d},\\blur0)`
  ],
  "gamer-door": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx40\\fscy130\\t(${off},${off + d},\\fscx100\\fscy100)`
  ],
  "crazy2-right": (d, off = 0) => [
    `\\alpha&HFF&\\t(${off},${off + Math.min(80, Math.round(d * 0.3))},\\alpha&H00&)\\fscx120\\fscy120\\t(${off},${off + Math.round(d * 0.68)},\\fscx112\\fscy112)\\t(${off + Math.round(d * 0.68)},${off + d},\\fscx100\\fscy100)`
  ],
  none: () => [],
};

function entranceTags(spec, durationSec, offsetMs = 0) {
  const fn = ENTRANCE_ASS[spec.entrance] || ENTRANCE_ASS["pop-in"];
  const dur = Math.max(60, Math.round((durationSec ?? spec.entranceDuration) * 1000));
  return fn(dur, Math.max(0, Math.round(offsetMs))).join("");
}

// ── text measurement ─────────────────────────────────────────────────────────
// libass lays the text out itself, so we only need a rough width to place
// multi-line chunks and to pick a font size that fits the frame.
function estimateTextWidth(text, fontSize, fontFamily) {
  const narrow = /^(Bebas Neue|Anton|Archivo Black|Oswald|Impact)$/i.test(fontFamily || "");
  let width = 0;
  for (const ch of String(text || "")) {
    if (/[A-Z]/.test(ch)) width += fontSize * (narrow ? 0.52 : 0.62);
    else if (/[a-z]/.test(ch)) width += fontSize * (narrow ? 0.4 : 0.46);
    else if (/[0-9]/.test(ch)) width += fontSize * 0.5;
    else if (/[\u0900-\u097F\u0A80-\u0AFF]/.test(ch)) width += fontSize * 0.6;
    else if (ch === " ") width += fontSize * 0.28;
    else width += fontSize * 0.36;
  }
  return width;
}

// ── chunking ─────────────────────────────────────────────────────────────────
/**
 * Group words into display chunks.
 *
 * WhiteStair's rules:
 *   - `singleLine` templates keep one line per chunk.
 *   - `fixedChunking` templates use min/max words per chunk.
 *   - multi-line templates repeat the chunk once per line.
 */
function buildChunks(words, spec) {
  const chunks = [];
  const perChunk = Math.max(1, spec.wordsPerChunk || spec.maxWordsPerChunk || 2);
  for (let i = 0; i < words.length; i += perChunk) {
    const group = words.slice(i, i + perChunk);
    if (group.length) chunks.push(group);
  }
  return chunks;
}

function splitIntoLines(group, linesPerBlock) {
  if (linesPerBlock <= 1 || group.length <= 1) return [group];
  const lines = [];
  const per = Math.max(1, Math.ceil(group.length / linesPerBlock));
  for (let i = 0; i < group.length; i += per) lines.push(group.slice(i, i + per));
  return lines;
}

// ── ASS builder ──────────────────────────────────────────────────────────────
const assTime = (seconds) => {
  const v = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = Math.floor(v % 60);
  const cs = Math.round((v % 1) * 100);
  const carry = cs >= 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s + (carry ? 1 : 0)).padStart(2, "0")}.${String(carry ? cs - 100 : cs).padStart(2, "0")}`;
};

/**
 * Build an ASS subtitle document for the given words.
 *
 * @param {object} spec          resolved template spec
 * @param {Array}  words         [{ word, start, end }]
 * @param {object} frame         { width, height }
 */
function buildAss(spec, words, frame = {}) {
  const width = frame.width || spec.frame.width || 1080;
  const height = frame.height || spec.frame.height || 1920;
  const scale = width / REFERENCE_WIDTH;

  const posX = Math.round((spec.position.x / 100) * width);
  const posY = Math.round((spec.position.y / 100) * height);

  const primary = withAlpha(spec.color, "00");
  const accent = withAlpha(spec.accent, "00");
  const outline = withAlpha(spec.outline, "00");
  const fontName = spec.fontFamily;

  // Karaoke swaps the two: the word being spoken renders in PrimaryColour
  // (the accent) and settles into SecondaryColour (the normal colour).
  const stylePrimary = spec.karaoke ? accent : primary;
  const styleSecondary = spec.karaoke ? primary : accent;

  const bold = spec.fontWeight >= 600 ? "-1" : "0";
  // BorderStyle 1 = outline only. A border style of 3 draws an opaque box
  // behind the glyphs, which is not what any of these templates want.
  const borderStyle = "1";
  const outlinePx = spec.strokeWidth;
  // WhiteStair separates light text from the footage with a soft shadow.
  // ASS shadows are hard-edged, so a small offset is the closest match.
  const shadow = Math.max(1, Math.round(spec.fontSize * 0.035));
  // Line height follows WhiteStair: 1.3 x max(base unit, font size).
  const refLineHeight = LINE_HEIGHT * Math.max(
    Math.max(9, Math.round(BASE_UNIT * Math.min(1, REFERENCE_WIDTH / 340))),
    spec.refFontSize,
  );
  const lineHeightPx = Math.round(refLineHeight * scale);

  const header = `﻿[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 2
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${fontName},${spec.fontSize},${stylePrimary},${styleSecondary},${outline},&H64000000,${bold},0,0,0,100,100,0,0,${borderStyle},${outlinePx},${shadow},5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = [];
  const chunks = buildChunks(words, spec);

  for (const chunk of chunks) {
    const chunkStart = chunk[0].start;
    const chunkEnd = chunk[chunk.length - 1].end;
    if (!(chunkEnd > chunkStart)) continue;

    // The entrance is squeezed to the chunk's own length so a fast chunk does
    // not animate past its own words.
    const chunkSpan = Math.max(0.05, chunkEnd - chunkStart);
    const base = spec.entranceBaseDuration || spec.entranceDuration || 0.4;
    const dynamicScale = Math.min(1, chunkSpan / base);
    const scale = Math.max(0.3, Math.min(spec.entranceScale || 1, dynamicScale) || dynamicScale);
    const animMs = Math.max(60, Math.round(base * scale * 1000));

    // Multi-word active word highlighting for karaoke / editorial styles:
    if (spec.karaoke && spec.linesPerBlock === 1 && chunk.length > 1) {
      for (let k = 0; k < chunk.length; k++) {
        const activeWord = chunk[k];
        const subStart = k === 0 ? chunkStart : activeWord.start;
        const subEnd = k === chunk.length - 1 ? chunkEnd : (chunk[k + 1]?.start || activeWord.end);
        if (!(subEnd > subStart)) continue;

        const renderedWords = chunk.map((w, wIdx) => {
          const shown = applyTextCase(w.word, spec.textCase);
          const isActive = wIdx === k;
          const wColor = isActive ? accent : primary;
          const wScale = isActive ? "\\fscx108\\fscy108" : "\\fscx100\\fscy100";
          const tags = [
            `\\fn${fontName}`,
            `\\fs${spec.fontSize}`,
            `\\3c${outline}`,
            `\\bord${outlinePx}`,
            `\\shad${shadow}`,
            `\\c${wColor}`,
            wScale,
          ];
          if (k === 0 && wIdx === 0) {
            tags.push(entranceTags(spec, animMs / 1000, 0));
          }
          return `{${tags.filter(Boolean).join("")}}${shown}`;
        }).join(" ");

        const pos = `\\an5\\pos(${posX},${posY})`;
        lines.push(`Dialogue: 0,${assTime(subStart)},${assTime(subEnd)},Caption,,0,0,0,,{${pos}}${renderedWords}`);
      }
      continue;
    }

    // Split the chunk across the template's line count.
    const lineGroups = splitIntoLines(chunk, spec.linesPerBlock);

    // One event per block. Every word carries its own entrance, delayed to
    // the moment it is spoken, so the words land on their timestamps exactly
    // like WhiteStair's per-word `animation-delay`.
    const isDiscipline = spec.id === "discipline" || spec.requestedId === "discipline";
    const isCrazy = spec.id === "crazy" || spec.requestedId === "crazy";
    const isEstate = (spec.id && spec.id.startsWith("estate")) || spec.requestedId === "estate4";

    const rendered = lineGroups.map((lineGroup, lineIdx) =>
      lineGroup
        .map((w, wordIdx) => {
          let shown = applyTextCase(w.word, spec.textCase);
          const delay = Math.max(0, Math.round((w.start - chunkStart) * 1000));
          const wordMs = Math.max(60, Math.round(Math.max(0.12, w.end - w.start) * 1000));

          let wFont = fontName;
          let wSize = spec.fontSize;
          let wColor = primary;
          let wOutline = outline;
          let wBord = outlinePx;
          let wShad = shadow;
          let extraTags = "";

          // WhiteStair signature styling
          if (isDiscipline) {
            // Alex Brush cursive red accent on line 2 (or last line)
            const isAccent = (lineGroups.length >= 3 && lineIdx === 2) || (lineGroups.length === 2 && lineIdx === 1) || (lineGroups.length === 1 && wordIdx === lineGroup.length - 1 && lineGroup.length > 1);
            if (isAccent) {
              wFont = "Alex Brush";
              wSize = Math.round(spec.fontSize * 1.35);
              wColor = hexToAss(spec.accent || "#E50012");
              wOutline = hexToAss("#000000");
              wBord = 4;
              wShad = 4;
              extraTags += "\\frz-4";
            } else if (lineIdx === 1 && lineGroups.length >= 3) {
              wFont = "Montserrat Bold";
              wColor = hexToAss(spec.color || "#FFFFFF");
              wSize = Math.round(spec.fontSize * 1.2);
              wBord = 6;
              wShad = 4;
            } else {
              wFont = "Montserrat";
              wColor = hexToAss(spec.color || "#FFFFFF");
              wSize = Math.round(spec.fontSize * 0.65);
              wBord = 4;
              wShad = 3;
            }
          } else if (isCrazy) {
            // WhiteStair Crazy: middle line is massive 3D metallic hero
            const isHero = lineGroups.length >= 2 ? (lineIdx === 1 || (lineGroups.length === 2 && lineIdx === 1)) : (wordIdx === 1 || lineGroup.length === 1);
            if (isHero) {
              wFont = "Montserrat Bold";
              wColor = hexToAss(spec.accent || "#FF8F00");
              wOutline = hexToAss("#000000");
              wSize = Math.round(spec.fontSize * 1.35);
              wBord = 8;
              wShad = 8;
              extraTags += "\\fscx115\\fscy115";
            } else {
              wFont = "Montserrat";
              wColor = hexToAss((spec.color && spec.color !== "#FF8F00") ? spec.color : "#FFFFFF");
              wSize = Math.round(spec.fontSize * 0.62);
              wBord = 4;
              wShad = 3;
            }
          } else if (isEstate) {
            // WhiteStair Estate 4: last line is massive 3D cyan hero with white border
            const isHero = lineGroups.length >= 2 ? (lineIdx === lineGroups.length - 1) : (wordIdx === lineGroup.length - 1);
            if (isHero) {
              wFont = "Montserrat Bold";
              wColor = hexToAss((spec.accent && spec.accent !== "#FFFFFF") ? spec.accent : "#1CD0FF");
              wOutline = hexToAss("#FFFFFF");
              wSize = Math.round(spec.fontSize * 1.25);
              wBord = 6;
              wShad = 6;
              extraTags += "\\fscx112\\fscy112";
            } else {
              wFont = "Inter";
              wColor = hexToAss(spec.color || "#FFFFFF");
              wSize = Math.round(spec.fontSize * 0.68);
              wBord = 4;
              wShad = 3;
            }
          }

          const tags = [
            `\\fn${wFont}`,
            `\\fs${wSize}`,
            `\\3c${wOutline}`,
            `\\bord${wBord}`,
            `\\shad${wShad}`,
            extraTags,
          ];
          if (spec.karaoke) {
            tags.push(`\\kf${Math.max(1, Math.round(wordMs / 10))}`);
          } else {
            tags.push(`\\c${wColor}`);
          }
          // The word starts hidden and is revealed by its own entrance.
          tags.push(entranceTags(spec, animMs / 1000, delay));
          return `{${tags.filter(Boolean).join("")}}${shown}`;
        })
        .join(" "),
    );

    const text = rendered.join("\\N");
    const pos = `\\an5\\pos(${posX},${posY})`;
    lines.push(
      `Dialogue: 0,${assTime(chunkStart)},${assTime(chunkEnd)},Caption,,0,0,0,,{${pos}}${text}`,
    );
  }

  return header + lines.join("\n") + "\n";
}

// ── catalogue for the UI ─────────────────────────────────────────────────────
/**
 * A compact catalogue the frontend can render: enough to draw the style
 * picker and the preview, without shipping the whole extraction payload.
 */
function listTemplates(opts = {}) {
  const cat = loadCatalogue();
  const width = Number(opts.width) || 1080;
  const height = Number(opts.height) || 1920;
  const items = [];
  const seen = new Set();

  // Add ShortAI Editorial flagship template at the very top
  try {
    const sSpec = resolveTemplate("shortai", { width, height });
    items.push({
      id: "shortai",
      name: "ShortAI Editorial",
      description: sSpec.description,
      tags: ["Featured", "Signature", "Editorial", "Dynamic", "Karaoke"],
      fontFamily: sSpec.fontFamily,
      fontWeight: sSpec.fontWeight,
      fontSize: sSpec.fontSize,
      color: sSpec.color,
      accent: sSpec.accent,
      outline: sSpec.outline,
      strokeWidth: sSpec.strokeWidth,
      textCase: sSpec.textCase,
      position: sSpec.position,
      entrance: sSpec.entrance,
      entranceDuration: sSpec.entranceDuration,
      karaoke: true,
      linesPerBlock: 1,
      minWordsPerChunk: 2,
      maxWordsPerChunk: 3,
    });
    seen.add("shortai");
  } catch (e) {}

  for (const t of cat.templates) {
    if (t.hidden) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    let spec;
    try {
      spec = resolveTemplate(t.id, { width, height });
    } catch {
      continue;
    }
    items.push({
      id: t.id,
      name: t.name,
      description: t.description,
      tags: t.tags || [],
      fontFamily: spec.fontFamily,
      fontWeight: spec.fontWeight,
      fontSize: spec.fontSize,
      color: spec.color,
      accent: spec.accent,
      outline: spec.outline,
      strokeWidth: spec.strokeWidth,
      textCase: spec.textCase,
      position: spec.position,
      entrance: spec.entrance,
      entranceDuration: spec.entranceDuration,
      karaoke: spec.karaoke,
      linesPerBlock: spec.linesPerBlock,
      minWordsPerChunk: spec.minWordsPerChunk,
      maxWordsPerChunk: spec.maxWordsPerChunk,
    });
  }
  return {
    templates: items,
    entrances: cat.entrances.map((e) => ({ id: e.id, name: e.name, cssClass: e.cssClass, delayBase: e.delayBase, duration: cat.cssDurations[e.cssClass] || 0.4 })),
    exits: cat.exits.map((e) => ({ id: e.id, name: e.name, duration: e.duration })),
    aliases: LEGACY_ALIASES,
    reference: { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT },
  };
}

module.exports = {
  REFERENCE_WIDTH,
  REFERENCE_HEIGHT,
  listTemplates,
  resolveTemplate,
  buildAss,
  buildChunks,
  estimateTextWidth,
  entranceTags,
  applyTextCase,
  LEGACY_ALIASES,
};
