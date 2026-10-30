// Downloads one EveryAyah reciter folder ayah by ayah (SSSAAA.mp3, 6,236 files).
// Polite: 4 at a time, retries, skips files already there, so it can be stopped and started again.
// usage: node tools/audio/download.mjs <everyayah folder> [out dir = sources/<folder>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [folder, outArg] = process.argv.slice(2);
if (!folder) throw new Error("usage: node tools/audio/download.mjs <everyayah folder> [out dir]");
const chapters = JSON.parse(fs.readFileSync(path.join(ROOT, "data/mushaf/chapters.json"), "utf8"));
const dest = path.resolve(outArg ?? path.join(ROOT, "sources", folder));
fs.mkdirSync(dest, { recursive: true });

const names = chapters.flatMap((c) =>
  Array.from({ length: c.verses_count }, (_, i) => `${String(c.id).padStart(3, "0")}${String(i + 1).padStart(3, "0")}.mp3`));

let done = 0, skipped = 0, next = 0;
const failed = [];
const t0 = Date.now();

async function get(name) {
  const file = path.join(dest, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) { skipped++; return; }
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`https://everyayah.com/data/${folder}/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error("too small");
      fs.writeFileSync(file + ".part", buf);
      fs.renameSync(file + ".part", file);
      done++;
      return;
    } catch (e) {
      if (attempt === 4) failed.push(`${name}: ${e.message}`);
      else await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < names.length) {
    await get(names[next++]);
    const n = done + skipped + failed.length;
    if (n % 500 === 0) console.log(`${folder}: ${n}/${names.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}));
console.log(JSON.stringify({ folder, dest, expected: names.length, downloaded: done, alreadyThere: skipped, failed: failed.length }));
if (failed.length) {
  console.log(failed.slice(0, 10).join("\n"));
  process.exitCode = 1;
}
