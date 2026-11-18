/**
 * Builds an index of the TTF files in backend/fonts so the caption engine can
 * ask for "Montserrat at weight 700" and get the right file — and, more
 * importantly, learn the font's REAL family name.
 *
 *   node tools/build-font-index.js
 *
 * Produces backend/fonts/_index.json
 *
 * Two things this has to get right:
 *
 * 1. The ASS `Fontname` field has to match the family name fontconfig
 *    reports, and that is the name inside the file ("Bebas Neue",
 *    "Alfa Slab One", …), not the file name we chose when downloading.
 *
 * 2. Google's static instances put the full face name in name ID 1 —
 *    "Montserrat Black", "Poppins ExtraBold", "Kanit SemiBold" — and leave
 *    the typographic family empty. But "Archivo Black" and "Poppins Black"
 *    look identical structurally, so the only reliable way to tell the family
 *    "Archivo Black" from the weight "Black" of family "Poppins" is the
 *    catalogue: we only split a name when the part before the style word is
 *    itself a family the templates actually use.
 */
const fs = require("fs");
const path = require("path");

const FONT_DIR = path.join(__dirname, "..", "fonts");
const CATALOGUE = path.join(__dirname, "..", "whitestair-templates.json");
const OUT = path.join(FONT_DIR, "_index.json");

/** Parse the sfnt `name` table. */
function readFontNames(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12) return null;

  const numTables = buf.readUInt16BE(4);
  let nameOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > buf.length) break;
    if (buf.toString("ascii", rec, rec + 4) === "name") {
      nameOffset = buf.readUInt32BE(rec + 8);
      break;
    }
  }
  if (nameOffset < 0 || nameOffset + 6 > buf.length) return null;

  const count = buf.readUInt16BE(nameOffset + 2);
  const stringOffset = nameOffset + buf.readUInt16BE(nameOffset + 4);

  const wanted = { 1: [], 2: [], 16: [], 17: [] };
  for (let i = 0; i < count; i++) {
    const rec = nameOffset + 6 + i * 12;
    if (rec + 12 > buf.length) break;
    const platformID = buf.readUInt16BE(rec);
    const languageID = buf.readUInt16BE(rec + 4);
    const nameID = buf.readUInt16BE(rec + 6);
    const length = buf.readUInt16BE(rec + 8);
    const offset = buf.readUInt16BE(rec + 10);
    if (!wanted[nameID]) continue;
    const score =
      platformID === 3 && languageID === 0x409 ? 3 :
      platformID === 3 ? 2 :
      platformID === 0 ? 1 : 0;
    if (score === 0 && languageID !== 0) continue;
    const start = stringOffset + offset;
    if (start + length > buf.length) continue;
    let text;
    if (platformID === 3 || platformID === 0) {
      const bytes = Buffer.from(buf.slice(start, start + length));
      for (let k = 0; k + 1 < bytes.length; k += 2) {
        const t = bytes[k];
        bytes[k] = bytes[k + 1];
        bytes[k + 1] = t;
      }
      text = bytes.toString("utf16le").replace(/\0/g, "").trim();
    } else {
      text = buf.toString("latin1", start, start + length).trim();
    }
    if (!text) continue;
    wanted[nameID].push({ score, text });
  }

  const pick = (list) => {
    if (!list || !list.length) return null;
    list.sort((a, b) => b.score - a.score);
    return list[0].text;
  };

  return {
    family: pick(wanted[1]),
    subfamily: pick(wanted[2]),
    typographicFamily: pick(wanted[16]),
    typographicSubfamily: pick(wanted[17]),
  };
}

/** Map a style name to a numeric weight. */
function weightOf(subfamily) {
  if (!subfamily) return 400;
  const s = subfamily.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s === "" || s === "regular") return 400;
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("demibold")) return 600;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  if (s.includes("bold")) return 700;
  return 400;
}

/** Style words that may suffix a family name inside name ID 1. */
const STYLE_WORDS = {
  thin: 100, extralight: 200, "extra light": 200, ultralight: 200, "ultra light": 200,
  light: 300, regular: 400, book: 400, medium: 500, semibold: 600, "semi bold": 600,
  demibold: 600, "demi bold": 600, bold: 700, extrabold: 800, "extra bold": 800,
  ultrabold: 800, "ultra bold": 800, black: 900, heavy: 900, blackheavy: 900,
};

function resolveFamily(nameID1, requested) {
  if (!nameID1) return null;
  // Exact match against a requested family wins outright.
  for (const fam of requested) if (nameID1 === fam) return { family: fam, weight: null };
  // Otherwise the trailing word may be a style of a requested family.
  for (const fam of requested) {
    if (!nameID1.startsWith(fam + " ")) continue;
    const rest = nameID1.slice(fam.length + 1).trim().toLowerCase();
    const w = STYLE_WORDS[rest.replace(/[^a-z ]/g, "")];
    if (w) return { family: fam, weight: w };
  }
  return null;
}

// ── requested families come from the template catalogue ──────────────────────
const cat = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const requested = new Set();
for (const t of cat.templates) {
  if (t.fontFamily && !t.fontFamily.includes(",")) requested.add(t.fontFamily);
  for (const f of t.lineFonts || []) if (f && !f.includes(",")) requested.add(f);
  if (t.accentFont) requested.add(t.accentFont);
}
["Alfa Slab One", "Pacifico", "Luckiest Guy", "Permanent Marker", "Chewy", "Amatic SC",
 "Righteous", "Bangers", "Shadows Into Light", "Dancing Script", "Lobster", "Great Vibes",
 "Satisfy", "Allura", "Alex Brush", "Bricolage Grotesque", "Archivo Black", "Lato"]
  .forEach((f) => requested.add(f));
const requestedList = [...requested];

// ── index ────────────────────────────────────────────────────────────────────
const files = fs.readdirSync(FONT_DIR).filter((f) => f.toLowerCase().endsWith(".ttf"));
const families = new Map();

for (const file of files) {
  let names;
  try { names = readFontNames(path.join(FONT_DIR, file)); } catch { continue; }
  if (!names) continue;
  if (/italic|oblique/i.test(names.typographicSubfamily || names.subfamily || "")) continue;

  // Prefer the typographic family when the file carries one.
  let family = names.typographicFamily || null;
  let weight = weightOf(names.typographicSubfamily || names.subfamily);

  if (!family || !requestedList.some((f) => f.toLowerCase() === family.toLowerCase())) {
    const resolved = resolveFamily(names.family, requestedList);
    if (!resolved) continue;
    family = resolved.family;
    if (resolved.weight !== null) weight = resolved.weight;
    else if (names.typographicSubfamily) weight = weightOf(names.typographicSubfamily);
    else weight = weightFromFileName(file);
  } else {
    // Typographic family known — take the weight from the style name.
    weight = weightOf(names.typographicSubfamily || names.subfamily);
    if (names.typographicSubfamily === "Regular" && names.family !== family) {
      weight = weightFromFileName(file);
    }
  }

  if (!families.has(family)) families.set(family, { family, weights: {}, files: [] });
  const entry = families.get(family);
  entry.files.push(file);
  const prev = entry.weights[weight];
  const isVariable = /\[[^\]]+\]/.test(file);
  if (!prev || (prev.variable && !isVariable)) {
    entry.weights[weight] = { file, variable: isVariable };
  }
}

/** Fallback: read the weight out of our own "-NNN.ttf" naming. */
function weightFromFileName(file) {
  const m = /-(\d{3})\.ttf$/i.exec(file);
  if (m) return Number(m[1]);
  if (/-Regular\.ttf$/i.test(file)) return 400;
  return 400;
}

const out = {};
for (const [family, entry] of families) {
  out[family] = {
    family,
    weights: Object.fromEntries(Object.entries(entry.weights).map(([w, v]) => [w, v.file])),
    files: entry.files.sort(),
  };
}

const byLower = {};
for (const [family, entry] of Object.entries(out)) {
  byLower[family.toLowerCase()] = { family, weights: entry.weights };
}

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), families: out, byLower }, null, 2), "utf8");
console.log("families indexed:", Object.keys(out).length, "of", requestedList.size, "requested");
const missing = requestedList.filter((f) => !out[f]);
if (missing.length) console.log("not found on disk:", missing.join(", "));
console.log("->", OUT);
