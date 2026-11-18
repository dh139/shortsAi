/**
 * Extracts the WhiteStair caption template catalogue + transition registries
 * from the shipped bundle (backend/whitestair_bundle.js) into a single JSON.
 *
 *   node tools/extract-whitestair-templates.js
 *
 * Produces backend/whitestair-templates.json
 *
 * The bundle is minified: theme objects reference module-level constants for
 * font family names and colours (e.g. fontFamily:Cv, color:vv). Those are
 * resolved back to their literal values so the catalogue is self-contained.
 */
const fs = require("fs");
const path = require("path");

const BUNDLE = path.join(__dirname, "..", "whitestair_bundle.js");
const OUT = path.join(__dirname, "..", "whitestair-templates.json");

const src = fs.readFileSync(BUNDLE, "utf8");

// ── primitives ───────────────────────────────────────────────────────────────
function balancedObjectAt(start) {
  let depth = 0, i = start, inStr = null;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return [src.slice(start, i + 1), i + 1]; }
    i++;
  }
  return [null, -1];
}

function evalLiteral(text) {
  if (text == null) return null;
  try { return new Function("return (" + text + ")")(); } catch { return null; }
}

// ── top-level constant scope ────────────────────────────────────────────────
// The bundle's theme objects reference module-level constants for font names
// and colours (fontFamily:Cv, color:vv). Collecting only literal assignments
// avoids picking up function-local shadowing.
//
// NOTE: distinguishing a regex literal from a division operator needs the
// "what can legally precede a regex" heuristic — minified code divides
// constantly, and treating every '/' as a regex start desyncs the scan.
function collectTopLevelConstants() {
  const map = Object.create(null);
  let depth = 0, i = 0, inStr = null, inRe = false, inLineComment = false, inBlockComment = false;
  let lastSignificant = "";
  const regexAllowedAfter = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "^", "~", "<", ">", "\n"]);

  function regexCanStartHere() {
    if (lastSignificant === "") return true;
    if (regexAllowedAfter.has(lastSignificant)) return true;
    // keyword before the slash
    const m = /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, i - 12), i));
    if (m) return ["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await"].includes(m[1]);
    return false;
  }

  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inLineComment) { if (c === "\n") inLineComment = false; i++; continue; }
    if (inBlockComment) { if (c === "*" && c2 === "/") { inBlockComment = false; i += 2; continue; } i++; continue; }
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) { inStr = null; lastSignificant = c; }
      i++; continue;
    }
    if (inRe) {
      if (c === "\\") { i += 2; continue; }
      if (c === "[") { inRe = false; i++; continue; }
      if (c === "/") { inRe = false; lastSignificant = "/"; i++; continue; }
      i++; continue;
    }
    if (c === "/" && c2 === "/") { inLineComment = true; i += 2; continue; }
    if (c === "/" && c2 === "*") { inBlockComment = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue; }
    if (c === "/") {
      if (regexCanStartHere()) { inRe = true; i++; continue; }
      lastSignificant = "/"; i++; continue;
    }
    if (!/\s/.test(c)) lastSignificant = c;
    if (c === "{" || c === "(" || c === "[") { depth++; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; i++; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (m) {
        const name = m[0];
        let j = i + name.length;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === "=" && src[j + 1] !== "=" && src[j - 1] !== "=" && src[j - 1] !== "!" && src[j - 1] !== "<" && src[j - 1] !== ">") {
          // read the literal
          let k = j + 1;
          while (k < src.length && /\s/.test(src[k])) k++;
          const ch = src[k];
          let text = null;
          if (ch === '"' || ch === "'") {
            let q = k + 1;
            while (q < src.length) { if (src[q] === "\\") { q += 2; continue; } if (src[q] === ch) break; q++; }
            text = src.slice(k, q + 1);
          } else if (ch === "[") {
            let d = 0, q = k, s2 = null;
            while (q < src.length) {
              const cc = src[q];
              if (s2) { if (cc === "\\") { q += 2; continue; } if (cc === s2) s2 = null; q++; continue; }
              if (cc === '"' || cc === "'" || cc === "`") { s2 = cc; q++; continue; }
              if (cc === "[") d++;
              else if (cc === "]") { d--; if (d === 0) { text = src.slice(k, q + 1); break; } }
              q++;
            }
          } else if (ch === "{") {
            const [t] = balancedObjectAt(k);
            text = t;
          } else {
            const num = /^-?\d*\.?\d+(?:e[+-]?\d+)?/.exec(src.slice(k));
            if (num) text = num[0];
            else {
              const bool = /^(true|false|null|undefined)/.exec(src.slice(k));
              if (bool) text = bool[0];
            }
          }
          if (text && !(name in map)) {
            const v = evalLiteral(text);
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || Array.isArray(v) || (v && typeof v === "object")) {
              map[name] = v;
            }
          }
          i = j;
          continue;
        }
        i += name.length;
        continue;
      }
    }
    i++;
  }
  return map;
}

const TOP_CONSTS = collectTopLevelConstants();

// Supplementary pass: grab any short identifier assigned a simple literal
// anywhere in the file. The depth-tracking scan can desync on exotic syntax,
// and a missing constant silently turns a theme's colour into undefined.
{
  const re = /(?:^|[^\w$.'"`\\])([A-Za-z_$][\w$]{0,3})\s*=\s*("(?:[^"\\\n]|\\.){0,120}"|'(?:[^'\\\n]|\\.){0,120}'|-?\d*\.?\d+(?:e[+-]?\d+)?|true|false|null)/g;
  let m;
  let guard = 0;
  while ((m = re.exec(src)) && guard++ < 400000) {
    const name = m[1];
    if (name in TOP_CONSTS) continue;
    let text = m[2];
    if (text === "null") continue;
    const v = evalLiteral(text);
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      TOP_CONSTS[name] = v;
    }
  }
}

// Evaluate inside a `with` scope so unresolved identifiers fall back to the
// bundle's own constants instead of throwing.
const SCOPE = new Proxy(TOP_CONSTS, {
  has: () => true,
  get(target, key) {
    if (key === Symbol.unscopables) return undefined;
    if (key in target) return target[key];
    return globalThis[key];
  },
});
function evalInScope(text) {
  if (!text) return null;
  try {
    // eslint-disable-next-line no-new-func
    return new Function("s", "with(s){ return (" + text + ") }")(SCOPE);
  } catch {
    try { return new Function("return (" + text + ")")(); } catch { return null; }
  }
}

// ── constant resolver ────────────────────────────────────────────────────────
const constCache = new Map();
function resolveIdentifier(name) {
  if (constCache.has(name)) return constCache.get(name);
  const re = new RegExp("(?:^|[^\\w$.])" + name + "\\s*=\\s*");
  const m = re.exec(src);
  if (!m) { constCache.set(name, undefined); return undefined; }
  let i = m.index + m[0].length;
  const c = src[i];
  let text = null;
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === c) break;
      j++;
    }
    text = src.slice(i, j + 1);
  } else if (c === "[") {
    let depth = 0, j = i, inStr = null;
    while (j < src.length) {
      const ch = src[j];
      if (inStr) { if (ch === "\\") { j += 2; continue; } if (ch === inStr) inStr = null; j++; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; j++; continue; }
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { text = src.slice(i, j + 1); break; } }
      j++;
    }
  } else if (c === "{") {
    const [t] = balancedObjectAt(i);
    text = t;
  } else {
    const mm = /^-?\d*\.?\d+(?:e[+-]?\d+)?/.exec(src.slice(i));
    if (mm) text = mm[0];
    else if (/^(true|false|null|undefined)/.test(src.slice(i))) text = src.slice(i).match(/^(true|false|null|undefined)/)[0];
  }
  const value = text ? evalLiteral(text) : undefined;
  const resolved = typeof value === "string" || typeof value === "number" || Array.isArray(value) ? value : undefined;
  constCache.set(name, resolved);
  return resolved;
}

/** Deep-resolve identifiers inside a parsed theme object. */
function deepResolve(value, depth = 0) {
  if (depth > 6) return value;
  if (typeof value === "string") {
    if (/^[A-Za-z_$][\w$]{0,3}$/.test(value)) {
      const r = resolveIdentifier(value);
      if (r !== undefined) return r;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => deepResolve(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepResolve(v, depth + 1);
    return out;
  }
  return value;
}

// ── factory-call collection ──────────────────────────────────────────────────
// Every template / transition is `SomeFn({id:"...", name:"...", ...})`.
const FACTORY_RE = /([A-Za-z_$][\w$]*)\(\{id:"([a-z0-9_-]{2,30})"/g;
const calls = [];
{
  let m;
  while ((m = FACTORY_RE.exec(src))) calls.push({ fn: m[1], id: m[2], at: m.index });
}

function collectFactory(fn) {
  const out = [];
  const needle = fn + "({";
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    const brace = src.indexOf("{", i);
    const [text, next] = balancedObjectAt(brace);
    if (!text) break;
    const obj = evalInScope(text);
    if (obj && obj.id) out.push(obj);
    i = next;
  }
  return out;
}

// ── 1. templates ─────────────────────────────────────────────────────────────
// Two catalogues exist in the bundle: the classic one (dE) and the typography
// one (SJ). Group factory calls by function name and take every group whose
// members look like templates (have a description + fontFamily).
const groups = new Map();
for (const c of calls) {
  if (!groups.has(c.fn)) groups.set(c.fn, []);
  groups.get(c.fn).push(c);
}

const templates = [];
const seenIds = new Set();
for (const [fn, list] of groups) {
  // Only consider groups that look like a catalogue (>= 3 members, all with names)
  if (list.length < 3) continue;
  const objs = collectFactory(fn);
  for (const o of objs) {
    if (!o || !o.id || seenIds.has(o.id)) continue;
    if (!o.name) continue;
    if (o.fontFamily === undefined && o.description === undefined) continue;
    seenIds.add(o.id);
    templates.push(deepResolve(o));
  }
}

// ── 2. transitions ───────────────────────────────────────────────────────────
function findGroupWith(id) {
  for (const [fn, list] of groups) if (list.some((c) => c.id === id)) return fn;
  return null;
}
const entranceFn = findGroupWith("pop-in");
const exitFn = findGroupWith("pop-out");

const entrances = collectFactory(entranceFn).map((e) => ({
  id: e.id, name: e.name, cssClass: e.cssClass || "", delayBase: e.delayBase ?? 0,
  type: e.type || "word", noAnimation: !!e.noAnimation, isDynamic: !!e.isDynamic,
  realTimings: !!e.realTimings, lineByLine: !!e.lineByLine, zoomAfterAll: !!e.zoomAfterAll,
  drawnPath: !!e.drawnPath, curvePath: e.curvePath || null, notifOnly: !!e.notifOnly,
}));

const exits = collectFactory(exitFn).map((e) => ({
  id: e.id, name: e.name, duration: e.duration ?? 0.4, easing: e.easing || null,
  keyframes: Array.isArray(e.keyframes) ? e.keyframes : [],
}));

// ── 3. CSS animation durations per cssClass ─────────────────────────────────
function evalAssignedObject(name) {
  const re = new RegExp("(?:^|[^\\w$.])" + name + "\\s*=\\s*\\{");
  const m = re.exec(src);
  if (!m) return null;
  const i = src.indexOf("{", m.index + m[0].length - 1);
  const [text] = balancedObjectAt(i);
  return evalLiteral(text);
}
const cssDurations = evalAssignedObject("Xx") || {};

// ── 4. per-template entrance scale ───────────────────────────────────────────
function extractEntranceScale() {
  const m = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)=e=>e\?e\.discipline\?/.exec(src);
  if (!m) return {};
  const fnName = m[1];
  const chainStart = src.indexOf(fnName + "=e=>e?e.discipline?");
  // The chain ends at the next `,` that closes the assignment.
  let depth = 0, end = chainStart, inStr = null;
  for (let i = chainStart; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { if (depth === 0) { end = i; break; } depth--; }
    else if (c === "," && depth === 0) { end = i; break; }
  }
  const chain = src.slice(chainStart, end);
  // constant table
  const consts = {};
  const constRe = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)=(-?\d*\.?\d+)(?=[,;])/g;
  let cm;
  while ((cm = constRe.exec(src))) consts[cm[1]] = Number(cm[2]);
  // walk the ternary chain
  const out = {};
  const branchRe = /e\.([A-Za-z0-9_]+)((?:\|\|e\.[A-Za-z0-9_]+)*)\?([A-Za-z_$][\w$]*)/g;
  let bm;
  while ((bm = branchRe.exec(chain))) {
    const keys = [bm[1], ...(bm[2] ? bm[2].match(/e\.([A-Za-z0-9_]+)/g).map((s) => s.slice(2)) : [])];
    const v = consts[bm[3]];
    if (v !== undefined) for (const k of keys) out[k] = v;
  }
  return out;
}
const templateEntranceScale = extractEntranceScale();

// ── 5. colour presets + gradient palettes ───────────────────────────────────
function collectByIds(ids) {
  const res = {};
  for (const id of ids) {
    const i = src.indexOf('id:"' + id + '"');
    if (i < 0) continue;
    const brace = src.indexOf("{", i);
    const [text] = balancedObjectAt(brace);
    const o = evalLiteral(text);
    if (o) res[id] = deepResolve(o);
  }
  return res;
}
const colorPresetIds = ["rust","yellow","cyan","neon","crimson","magenta","violet","white","ice","green","blue","orange","steel","default","none"];
const paletteIds = ["sunrise","ember","mint","grape","copper","teal","red","lime","pink","aqua","purple"];

// ── 6. keyframe names + CSS blocks ──────────────────────────────────────────
function extractKeyframes() {
  const names = new Set();
  const re = /@keyframes\s+([A-Za-z][\w-]*)\s*\{/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return [...names];
}
function extractCssBlocks() {
  const blocks = [];
  const re = /"((?:[^"\\]|\\.){200,})"/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = m[1];
    if (raw.indexOf("@keyframes") < 0) continue;
    let text;
    try { text = JSON.parse('"' + raw + '"'); } catch { continue; }
    blocks.push(text);
  }
  return blocks;
}

// ── output ───────────────────────────────────────────────────────────────────
const payload = {
  generatedAt: new Date().toISOString(),
  source: "whitestair_bundle.js (public bundle)",
  templates: templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description || "",
    fontFamily: t.fontFamily ?? null,
    accentFont: t.accentFont ?? null,
    lineFonts: Array.isArray(t.lineFonts) ? t.lineFonts : null,
    fontSize: t.fontSize ?? null,
    fontWeight: t.fontWeight ?? null,
    color: t.color ?? t.primaryColor ?? null,
    highlightColor: t.highlightColor ?? null,
    accentColor: t.accentColor ?? null,
    outlineColor: t.outlineColor ?? null,
    fontBorderWidth: t.fontBorderWidth ?? null,
    textCase: t.textCase ?? null,
    position: t.position ?? null,
    singleLine: t.singleLine ?? null,
    fixedChunking: t.fixedChunking ?? null,
    minWordsPerChunk: t.minWordsPerChunk ?? null,
    maxWordsPerChunk: t.maxWordsPerChunk ?? null,
    linesPerBlock: t.linesPerBlock ?? null,
    disableTransitions: t.disableTransitions ?? null,
    notifDefaultTransition: t.notifDefaultTransition ?? null,
    tags: Array.isArray(t.tags) ? t.tags : [],
    structuralFlags: Object.keys(t).filter((k) => t[k] === true),
    raw: t,
  })),
  entrances,
  exits,
  cssDurations,
  templateEntranceScale,
  colorPresets: collectByIds(colorPresetIds),
  gradientPalettes: collectByIds(paletteIds),
  keyframeNames: extractKeyframes(),
  cssBlocks: extractCssBlocks(),
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
console.log("templates        :", payload.templates.length);
console.log("entrances        :", payload.entrances.length);
console.log("exits            :", payload.exits.length);
console.log("cssDurations     :", Object.keys(payload.cssDurations).length);
console.log("entranceScale    :", Object.keys(payload.templateEntranceScale).length);
console.log("colorPresets     :", Object.keys(payload.colorPresets).length);
console.log("gradientPalettes :", Object.keys(payload.gradientPalettes).length);
console.log("keyframeNames    :", payload.keyframeNames.length);
console.log("cssBlocks        :", payload.cssBlocks.length);
console.log("->", OUT);
