/**
 * Downloads every font family the WhiteStair template catalogue needs into
 * backend/fonts, as real TTF files with discrete weights.
 *
 *   node tools/fetch-caption-fonts.js
 *
 * Why TTF and not woff2/woff/eot: the burned-in render goes through libass
 * (fontsdir=...), which reads TTF/OTF only. A missing font file means libass
 * silently substitutes a default face â€” which is exactly how captions end up
 * looking "not like the preview" in the downloaded file.
 *
 * Why discrete weights: libass renders a VARIABLE font's default instance
 * only, so a "Bold" flag on a variable font is ignored and every caption comes
 * out at regular weight. The CSS API gives us one static file per weight.
 *
 * The Google Fonts CSS API serves:
 *   woff2 â†’ modern browsers, woff â†’ Firefox 3.6, eot â†’ IE â‰¤ 8,
 *   ttf   â†’ Android 4.x user-agents. We use the Android one.
 *
 * Families that Google does not serve (e.g. Bricolage Grotesque) fall back to
 * the google/fonts repository on raw.githubusercontent.com.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const FONT_DIR = path.join(__dirname, "..", "fonts");
const CATALOGUE = path.join(__dirname, "..", "whitestair-templates.json");
const RAW = "https://raw.githubusercontent.com/google/fonts/main/";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; U; Android 4.3; en-us; SM-T210R Build/JSS15J) " +
  "AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30";

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": ANDROID_UA, ...headers }, timeout: 45000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location, headers).then(resolve, reject);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

const isTtf = (buf) => {
  const m = buf.slice(0, 4).toString("hex");
  return m === "00010000" || m === "74727565" || m === "74746366" || m === "4f54544f";
};

/** Pull the truetype src urls (with their weight) out of a css payload. */
function parseFaces(css) {
  const out = [];
  for (const block of css.split("@font-face").slice(1)) {
    const weight = (/font-weight:\s*(\d+)/.exec(block) || [])[1] || "400";
    const style = (/font-style:\s*(\w+)/.exec(block) || [])[1] || "normal";
    const m = /src:\s*url\(([^)]+)\)\s*format\('truetype'\)/.exec(block);
    if (m) out.push({ url: m[1], weight: Number(weight), style });
  }
  return out;
}

const flatName = (family) => family.replace(/[^A-Za-z0-9]+/g, "");
const slugName = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function fetchFromGoogle(family) {
  const css = (
    await get(
      "https://fonts.googleapis.com/css2?family=" +
        encodeURIComponent(family).replace(/%20/g, "+") +
        ":wght@400;500;600;700;800;900",
    )
  ).toString("utf8");
  const faces = parseFaces(css);
  if (!faces.length) throw new Error("no truetype faces in css");
  const saved = [];
  for (const face of faces) {
    const buf = await get(face.url);
    if (!isTtf(buf)) throw new Error(`not a truetype payload (${buf.slice(0, 4).toString("hex")})`);
    const name = `${flatName(family)}-${face.weight}${face.style === "italic" ? "Italic" : ""}.ttf`;
    const dest = path.join(FONT_DIR, name);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    saved.push(`${name} (${buf.length}B)`);
  }
  return saved;
}

async function fetchFromRepo(family) {
  const Family = flatName(family);
  const dirs = [];
  for (const lic of ["ofl", "apache", "ufl"]) {
    dirs.push(`${lic}/${slugName(family)}`, `${lic}/${family.toLowerCase().replace(/[^a-z0-9]+/g, "")}`);
  }
  const candidates = [
    `${Family}-Regular.ttf`, `${Family}-Medium.ttf`, `${Family}-SemiBold.ttf`,
    `${Family}-Bold.ttf`, `${Family}-ExtraBold.ttf`, `${Family}-Black.ttf`,
    `${Family}-Light.ttf`, `${Family}-ExtraLight.ttf`, `${Family}.ttf`,
    `${Family}[wght].ttf`, `${Family}[opsz,wght].ttf`, `${Family}[wdth,wght].ttf`,
  ];
  let dir = null;
  for (const d of dirs) {
    for (const f of candidates) {
      const buf = await get(RAW + `${d}/${f}`).catch(() => null);
      if (buf && isTtf(buf)) { dir = d; break; }
    }
    if (dir) break;
  }
  if (!dir) throw new Error("family directory not found");
  const saved = [];
  for (const f of candidates) {
    const buf = await get(RAW + `${dir}/${f}`).catch(() => null);
    if (!buf || !isTtf(buf)) continue;
    const dest = path.join(FONT_DIR, f);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    saved.push(`${f} (${buf.length}B)`);
    if (f.endsWith("-Regular.ttf") && !f.includes("[")) break;
  }
  if (!saved.length) throw new Error("no usable ttf files");
  return saved;
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const cat = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));

  const families = new Set();
  for (const t of cat.templates) {
    if (t.fontFamily && !t.fontFamily.includes(",")) families.add(t.fontFamily);
    for (const f of t.lineFonts || []) if (f && !f.includes(",")) families.add(f);
    if (t.accentFont) families.add(t.accentFont);
  }
  ["Lato", "Alfa Slab One", "Pacifico", "Luckiest Guy", "Permanent Marker", "Chewy", "Amatic SC",
   "Righteous", "Bangers", "Shadows Into Light", "Dancing Script", "Lobster",
   "Great Vibes", "Satisfy", "Allura", "Alex Brush", "Bricolage Grotesque", "Archivo Black"]
    .forEach((f) => families.add(f));

  // Provided by the operating system, or already vendored in the repo.
  const skip = new Set(["Impact", "Arial Black", "Georgia", "Bricolage Grotesque"]);

  const list = [...families].filter((f) => !skip.has(f));
  const report = { ok: [], failed: [], skipped: [...skip] };

  const results = await mapLimit(list, 4, async (family) => {
    try {
      const files = await fetchFromGoogle(family);
      return { family, files };
    } catch (e) {
      try {
        const files = await fetchFromRepo(family);
        return { family, files, viaRepo: true };
      } catch (e2) {
        return { family, error: `${e.message} | repo: ${e2.message}` };
      }
    }
  });

  for (const r of results) {
    if (r.error) report.failed.push(`${r.family}: ${r.error}`);
    else report.ok.push(...r.files.map((f) => `${r.family}${r.viaRepo ? " (repo)" : ""} -> ${f}`));
  }

  console.log("families ok:", new Set(report.ok.map((s) => s.split(" -> ")[0])).size);
  if (report.failed.length) {
    console.log("failed:", report.failed.length);
    report.failed.forEach((f) => console.log("  !", f));
  } else {
    console.log("all families downloaded");
  }
  fs.writeFileSync(
    path.join(FONT_DIR, "_manifest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), files: report.ok, failed: report.failed, skipped: report.skipped }, null, 2),
    "utf8",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });

