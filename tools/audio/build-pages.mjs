// Joins one reciter's ayah files into one MP3 per mushaf page (p001.mp3 … p604.mp3) plus index.json with where each
// ayah starts inside its page file. The basmala (the reciter's 001001) goes before ayah 1 of every surah except 1 and 9.
// Each ayah is decoded to PCM first, so the offsets are exact sample counts, then the page is encoded once (CBR, so
// seeking in the browser lands where the index says).
// Options (environment variables; tools/audio/build-reciter.mjs sets them from reciters.config.json):
//   KEEP_LEAD_MS / KEEP_TAIL_MS  trim the quiet before / after each ayah down to this much, so one ayah follows the
//                  other at once (no pause between them). A trimmed edge gets an 8 ms fade so the cut never clicks;
//                  an edge that is already short is left as it is. Unset = joined as they are.
//   QUIET_DB       what counts as quiet when trimming (default -40 dBFS).
//   BASMALA_FROM_S the basmala starts this far into 001001 (Ali Jaber's 001001 begins with the isti'adha).
//   BASMALA_GAIN_DB gain for the basmala put before the surahs (a 001001 recorded much quieter than the rest).
//   FATIHA1_GAIN_DB gain for 1:1 itself, when its 001001 is also much quieter than the rest of that reciter's Fatiha.
//   MUSHAF_INDEX   the print whose pages the files are cut by (default: data/mushaf/mushaf_index.json, 1421H).
//   PAGES          only build these pages, e.g. PAGES=1-3 (a quick test).
// Needs ffmpeg / ffprobe on the PATH.
// usage: node tools/audio/build-pages.mjs <source folder of SSSAAA.mp3> <output folder> [bitrate kbps=64]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [srcDir, outDir, kbps = "64"] = process.argv.slice(2);
if (!srcDir || !outDir) throw new Error("usage: node tools/audio/build-pages.mjs <source folder> <output folder> [kbps]");
const MUSHAF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/mushaf");
const idx = JSON.parse(fs.readFileSync(process.env.MUSHAF_INDEX || path.join(MUSHAF, "mushaf_index.json"), "utf8"));
const chapters = JSON.parse(fs.readFileSync(path.join(MUSHAF, "chapters.json"), "utf8"));
fs.mkdirSync(outDir, { recursive: true });

// The rate most of the files have (some reciters' 001001 comes from another recording at a higher rate).
const rates = ["002001", "002255", "018001", "036001", "067001", "112001"].map((n) => parseInt(execFileSync("ffprobe", ["-v", "error",
  "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", path.join(srcDir, `${n}.mp3`)]).toString().trim(), 10));
const common = rates.sort((a, b) => rates.filter((r) => r === b).length - rates.filter((r) => r === a).length || b - a)[0];
const RATE = Math.min(common, 44100);
const KEEP_LEAD = process.env.KEEP_LEAD_MS ? Math.round((Number(process.env.KEEP_LEAD_MS) / 1000) * RATE) : null;
const KEEP_TAIL = process.env.KEEP_TAIL_MS ? Math.round((Number(process.env.KEEP_TAIL_MS) / 1000) * RATE) : null;
const BASMALA_FROM_S = Number(process.env.BASMALA_FROM_S || 0);
const BASMALA_GAIN_DB = Number(process.env.BASMALA_GAIN_DB || 0);
const FATIHA1_GAIN_DB = Number(process.env.FATIHA1_GAIN_DB || 0);

// pages[p] = [[surah, ayah], …] in reading order; ayah 0 = the basmala before that surah.
const pages = Array.from({ length: 605 }, () => []);
for (const c of chapters) {
  const list = idx.ayahPages[c.id];
  for (let a = 1; a <= c.verses_count; a++) {
    if (a === 1 && c.bismillah_pre) pages[list[0]].push([c.id, 0]);
    pages[list[a - 1]].push([c.id, a]);
  }
}

const fileOf = (s, a) => path.join(srcDir, a === 0 ? "001001.mp3" : `${String(s).padStart(3, "0")}${String(a).padStart(3, "0")}.mp3`);

function run(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [], err = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", reject);
    p.on("close", (code) => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(Buffer.concat(err).toString().slice(-400))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

const pcmCache = new Map(); // the basmala is decoded once
async function pcm(s, a) {
  const key = a === 0 ? "basmala" : null;
  if (key && pcmCache.has(key)) return pcmCache.get(key);
  const isBasmala = a === 0 || (s === 1 && a === 1);
  const filters = ["-ac", "1", "-ar", String(RATE)];
  const gain = a === 0 ? BASMALA_GAIN_DB : s === 1 && a === 1 ? FATIHA1_GAIN_DB : 0;
  if (gain) filters.push("-af", `volume=${gain}dB`);
  const buf = await run(["-v", "error", ...(isBasmala && BASMALA_FROM_S ? ["-ss", String(BASMALA_FROM_S)] : []), "-i", fileOf(s, a),
    ...filters, "-f", "s16le", "-"]);
  if (key) pcmCache.set(key, buf);
  return buf;
}

// Quiet at the start / end of an ayah (10 ms windows under QUIET_DB, default -40 dBFS), in samples.
const QUIET = 32768 * 10 ** (Number(process.env.QUIET_DB || -40) / 20);
function edges(buf) {
  const x = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2), w = Math.round(RATE / 100);
  const loud = (i) => { let s = 0; for (let j = i; j < i + w && j < x.length; j++) s += x[j] * x[j]; return Math.sqrt(s / w) > QUIET; };
  let lead = 0, tail = 0;
  while (lead < x.length && !loud(lead)) lead += w;
  while (tail < x.length && !loud(x.length - tail - w)) tail += w;
  return { lead: Math.min(lead, x.length), tail: Math.min(tail, x.length) };
}

// The ayah with its quiet edges trimmed to KEEP_LEAD / KEEP_TAIL; an 8 ms fade where something was cut.
function trimmed(buf) {
  if (KEEP_LEAD === null && KEEP_TAIL === null) return buf;
  const n = buf.length / 2, { lead, tail } = edges(buf);
  if (lead + tail >= n) return buf;
  const cutLead = KEEP_LEAD === null ? 0 : Math.max(0, lead - KEEP_LEAD), cutTail = KEEP_TAIL === null ? 0 : Math.max(0, tail - KEEP_TAIL);
  if (!cutLead && !cutTail) return buf;
  const out = Buffer.from(buf.subarray(cutLead * 2, buf.length - cutTail * 2)), x = new Int16Array(out.buffer, out.byteOffset, out.length / 2);
  const f = Math.min(Math.round(RATE * 0.008), x.length >> 1);
  for (let i = 0; i < f; i++) {
    const g = i / f;
    if (cutLead) x[i] = Math.round(x[i] * g);
    if (cutTail) x[x.length - 1 - i] = Math.round(x[x.length - 1 - i] * g);
  }
  trimStats.cut += cutLead + cutTail;
  return out;
}
const trimStats = { cut: 0, gaps: [] };

const index = { v: 1, rate: RATE, kbps: Number(kbps), pages: {} };
async function buildPage(p) {
  const parts = [], starts = [];
  let samples = 0;
  const bufs = [];
  for (const [s, a] of pages[p]) bufs.push(await pcm(s, a));
  const joined = bufs.map(trimmed);
  for (const [i, [s, a]] of pages[p].entries()) {
    const b = joined[i];
    starts.push([s, a, Math.round((samples / RATE) * 1000)]);
    parts.push(b);
    samples += b.length / 2;
    // The pause a listener hears between this ayah and the next one on the page.
    if (i + 1 < joined.length) trimStats.gaps.push(((edges(b).tail + edges(joined[i + 1]).lead) / RATE) * 1000);
  }
  const out = path.join(outDir, `p${String(p).padStart(3, "0")}.mp3`);
  const mp3 = await run(["-v", "error", "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "-",
    "-c:a", "libmp3lame", "-b:a", `${kbps}k`, "-id3v2_version", "0", "-f", "mp3", "-"], Buffer.concat(parts));
  fs.writeFileSync(out, mp3);
  index.pages[p] = { ms: Math.round((samples / RATE) * 1000), bytes: mp3.length, ayat: starts };
}

const t0 = Date.now();
const [first, last] = (process.env.PAGES || "1-604").split("-").map(Number);
let next = first;
const workers = Math.max(1, Math.min(6, os.cpus().length - 2));
await Promise.all(Array.from({ length: workers }, async () => {
  while (next <= last) {
    const p = next++;
    await buildPage(p);
    if (p % 50 === 0) console.log(`page ${p} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}));

// Keys sorted so the file is stable between runs.
const sorted = { ...index, pages: Object.fromEntries(Object.keys(index.pages).map(Number).sort((a, b) => a - b).map((p) => [p, index.pages[p]])) };
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(sorted));
const totalBytes = Object.values(index.pages).reduce((s, x) => s + x.bytes, 0);
const totalMs = Object.values(index.pages).reduce((s, x) => s + x.ms, 0);
const ayat = Object.values(index.pages).reduce((s, x) => s + x.ayat.filter(([, a]) => a > 0).length, 0);
console.log(JSON.stringify({ outDir, rate: RATE, pages: Object.keys(index.pages).length, ayat, hours: +(totalMs / 3600000).toFixed(2),
  mb: Math.round(totalBytes / 1048576), biggestPageKb: Math.round(Math.max(...Object.values(index.pages).map((x) => x.bytes)) / 1024),
  seconds: Math.round((Date.now() - t0) / 1000) }));
const g = trimStats.gaps.sort((x, y) => x - y), at = (q) => Math.round(g[Math.floor(q * (g.length - 1))] || 0);
console.log(JSON.stringify({ trimmedMinutes: +(trimStats.cut / RATE / 60).toFixed(1), pauseBetweenAyatMs: { median: at(0.5), p95: at(0.95), max: at(1) } }));
