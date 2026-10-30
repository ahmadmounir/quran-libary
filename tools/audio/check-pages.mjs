// Checks a built reciter folder: every page decodes, its decoded length matches index.json, and how often an ayah start
// falls on a quiet moment (informative only: with tight joins there is often no quiet gap). usage: node tools/audio/check-pages.mjs <folder>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dir = process.argv[2];
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const RATE = 8000;
const rms = (pcm, fromMs, toMs) => {
  const a = Math.max(0, Math.floor((fromMs / 1000) * RATE)), b = Math.min(pcm.length, Math.floor((toMs / 1000) * RATE));
  let s = 0;
  for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
  return b > a ? Math.sqrt(s / (b - a)) : 0;
};

let boundaries = 0, quiet = 0, worstDrift = 0, ayat = 0;
const loud = [];
for (const [p, info] of Object.entries(index.pages)) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", path.join(dir, `p${String(p).padStart(3, "0")}.mp3`), "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  const decodedMs = (pcm.length / RATE) * 1000;
  worstDrift = Math.max(worstDrift, Math.abs(decodedMs - info.ms));
  const windows = [];
  for (let t = 0; t + 50 < decodedMs; t += 50) windows.push(rms(pcm, t, t + 50));
  const median = windows.sort((x, y) => x - y)[Math.floor(windows.length / 2)] || 1;
  ayat += info.ayat.filter(([, a]) => a > 0).length;
  for (const [s, a, ms] of info.ayat.slice(1)) {
    boundaries++;
    const before = rms(pcm, ms - 60, ms - 10);
    if (before < 0.2 * median) quiet++; else loud.push(`p${p} ${s}:${a} @${ms}ms ratio=${(before / median).toFixed(2)}`);
  }
}
console.log(JSON.stringify({ dir: path.basename(dir), pages: Object.keys(index.pages).length, ayat, boundaries, quietBeforeStart: quiet,
  pctQuiet: +((100 * quiet) / boundaries).toFixed(2), worstLengthDriftMs: Math.round(worstDrift) }));
if (loud.length) console.log(loud.slice(0, 8).join("\n"));
