// Builds one reciter end to end, the way the published files were made:
//   1. download the 6,236 ayah files from EveryAyah (skips what is already there)
//   2. measure how loud the reciter's basmala is against their usual ayah (basmala-gain.mjs)
//   3. join the ayat into one MP3 per mushaf page + index.json (build-pages.mjs), quiet edges trimmed
//   4. check the result: 604 pages, 6,236 ayat, each page's decoded length = its index (check-pages.mjs)
// Output: data/audio/<id>/p001.mp3 … p604.mp3 + index.json (the MP3s are ignored by git). Needs Node 20+ and ffmpeg.
// usage: node tools/audio/build-reciter.mjs <id>          (ids: tools/audio/reciters.config.json)
//        PAGES=1-3 node tools/audio/build-reciter.mjs husary   (a quick test on three pages)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const config = JSON.parse(fs.readFileSync(path.join(HERE, "reciters.config.json"), "utf8"));
const id = process.argv[2];
const reciter = config.reciters.find((r) => r.id === id);
if (!reciter) throw new Error(`unknown reciter "${id}"; one of: ${config.reciters.map((r) => r.id).join(", ")}`);

const source = path.join(ROOT, "sources", reciter.everyayah);
const out = path.join(ROOT, "data", "audio", reciter.id);
const node = (script, args, env = {}) => {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (r.status !== 0) throw new Error(`${script} failed:\n${r.stdout}`);
  return r.stdout;
};
const step = (text) => console.log(`[${reciter.id}] ${text} (${new Date().toLocaleTimeString()})`);

step(`1/4 download ${reciter.everyayah}`);
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
const partial = Boolean(process.env.PAGES);
const ok = check.worstLengthDriftMs < 150 && (partial || (check.pages === 604 && check.ayat === 6236));
console.log(JSON.stringify(check));
if (!ok) throw new Error("check failed: expected 604 pages, 6,236 ayat and decoded lengths within 150 ms of the index");
step(`done → ${path.relative(ROOT, out)}`);
