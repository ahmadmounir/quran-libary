// Downloads and builds the reciters' audio end to end, the way the published files were made:
//   1. download the reciter's 6,236 ayah files from EveryAyah (https://everyayah.com/data/<folder>/SSSAAA.mp3) into
//      sources/<folder>/ — skips what is already there, so it can be stopped and run again
//   2. measure how loud the reciter's basmala is against their usual ayah (basmala-gain.mjs)
//   3. join the ayat into one MP3 per mushaf page + index.json (build-pages.mjs), quiet edges trimmed
//   4. check the result: 604 pages, 6,236 ayat, each page's decoded length = its index (check-pages.mjs), and compare
//      index.json with the one published in this repository
// Output: data/audio/<id>/p001.mp3 … p604.mp3 + index.json (the MP3s are ignored by git). Needs Node 20+ and ffmpeg.
// usage: node tools/audio/build-reciter.mjs <id> [<id> …]     ids: husary minshawi shuraim muaiqly dosari alafasy abdulbasit alijaber
//        node tools/audio/build-reciter.mjs all               all eight, one after the other (~1 hour each, ~6.2 GB)
//        PAGES=1-3 node tools/audio/build-reciter.mjs husary  a quick test: three pages, written to sources/test/husary/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const config = JSON.parse(fs.readFileSync(path.join(HERE, "reciters.config.json"), "utf8"));
const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error(`usage: node tools/audio/build-reciter.mjs <id …|all>; ids: ${config.reciters.map((r) => r.id).join(", ")}`);
const reciters = ids.includes("all") ? config.reciters : ids.map((id) => {
  const reciter = config.reciters.find((r) => r.id === id);
  if (!reciter) throw new Error(`unknown reciter "${id}"; one of: ${config.reciters.map((r) => r.id).join(", ")}, all`);
  return reciter;
});
const partial = Boolean(process.env.PAGES);

const node = (script, args, env = {}) => {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (r.status !== 0) throw new Error(`${script} failed:\n${r.stdout}`);
  return r.stdout;
};

function build(reciter) {
  const source = path.join(ROOT, "sources", reciter.everyayah);
  // A test build never overwrites the published index.json
  const out = partial ? path.join(ROOT, "sources", "test", reciter.id) : path.join(ROOT, "data", "audio", reciter.id);
  const publishedFile = path.join(ROOT, "data", "audio", reciter.id, "index.json");
  const published = fs.existsSync(publishedFile) ? JSON.parse(fs.readFileSync(publishedFile, "utf8")) : null;
  const step = (text) => console.log(`[${reciter.id}] ${text} (${new Date().toLocaleTimeString()})`);

  step(`1/4 download ${reciter.everyayah} from EveryAyah`);
  console.log(node("download.mjs", [reciter.everyayah, source]).trim().split("\n").pop());

  step("2/4 basmala loudness");
  const gains = JSON.parse(node("basmala-gain.mjs", [source, String(reciter.basmalaFromS ?? 0)]).trim());
  console.log(`basmala gain ${gains.gainDb} dB, 1:1 gain ${gains.fatiha1GainDb} dB`);

  step("3/4 build the page files");
  const built = node("build-pages.mjs", [source, out, String(config.kbps)], {
    QUIET_DB: String(config.trim.quietDb),
    KEEP_LEAD_MS: String(config.trim.keepLeadMs),
    KEEP_TAIL_MS: String(config.trim.keepTailMs),
    BASMALA_GAIN_DB: String(gains.gainDb),
    FATIHA1_GAIN_DB: String(gains.fatiha1GainDb),
    BASMALA_FROM_S: String(reciter.basmalaFromS ?? 0),
  });
  console.log(built.trim().split("\n").slice(-2).join("\n"));

  step("4/4 check");
  const check = JSON.parse(node("check-pages.mjs", [out]).trim().split("\n")[0]);
  console.log(JSON.stringify(check));
  if (check.worstLengthDriftMs >= 150 || (!partial && (check.pages !== 604 || check.ayat !== 6236))) {
    throw new Error("check failed: expected 604 pages, 6,236 ayat and decoded lengths within 150 ms of the index");
  }
  if (published) {
    const mine = JSON.parse(fs.readFileSync(path.join(out, "index.json"), "utf8"));
    const differ = Object.keys(mine.pages).filter((p) => JSON.stringify(mine.pages[p]) !== JSON.stringify(published.pages[p]));
    console.log(differ.length === 0
      ? `identical to the published files (${Object.keys(mine.pages).length} pages compared)`
      : `NOTE: ${differ.length} page(s) differ from the published index (e.g. ${differ.slice(0, 5).join(", ")}): the source recordings may have changed. Your index.json matches YOUR MP3s — always publish them together.`);
  }
  step(`done → ${path.relative(ROOT, out)}`);
}

for (const reciter of reciters) build(reciter);
