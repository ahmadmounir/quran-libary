// How loud the reciter's basmala (001001) is against the reciter's usual ayah (EBU R128 integrated loudness of 24 ayat
// across the Quran). Prints the gain to give BASMALA_GAIN_DB when they differ by more than 3 dB, capped so the basmala
// never peaks above -1 dBFS; and the same for 1:1 against the rest of that reciter's Fatiha. usage: node basmala-gain.mjs <source folder> [basmala starts at s]
import path from "node:path";
import { spawnSync } from "node:child_process";
const [dir, from = "0"] = process.argv.slice(2);
const measure = (file, ss) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...(ss ? ["-ss", ss] : []), "-i", file, "-af", "ebur128=peak=sample", "-f", "null", "-"]);
  const log = r.stderr.toString();
  const i = [...log.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)], pk = [...log.matchAll(/^\s+Peak:\s+(-?[\d.]+) dBFS/gm)];
  return { lufs: i.length ? Number(i[i.length - 1][1]) : NaN, peak: pk.length ? Number(pk[pk.length - 1][1]) : 0 };
};
const sample = [2, 3, 4, 7, 10, 12, 18, 19, 20, 25, 36, 40, 50, 55, 56, 67, 75, 78, 87, 93, 97, 103, 110, 114]
  .map((s) => measure(path.join(dir, `${String(s).padStart(3, "0")}001.mp3`)).lufs).filter(Number.isFinite).sort((a, b) => a - b);
const median = sample[Math.floor(sample.length / 2)];
const { lufs: basmala, peak } = measure(path.join(dir, "001001.mp3"), from !== "0" ? from : null);
const gainFor = (target) => Math.abs(target - basmala) > 3 ? Math.round(Math.min(target - basmala, -1 - peak) * 2) / 2 : 0;
const fatiha = [2, 3, 4, 5, 6, 7].map((a) => measure(path.join(dir, `00100${a}.mp3`)).lufs).sort((a, b) => a - b);
const fatihaMedian = (fatiha[2] + fatiha[3]) / 2;
console.log(JSON.stringify({ dir: path.basename(dir), basmalaLufs: basmala, basmalaPeakDb: peak, medianAyahLufs: median,
  spread: [sample[0], sample[sample.length - 1]], ayatMeasured: sample.length, fatihaMedianLufs: fatihaMedian,
  gainDb: gainFor(median), fatiha1GainDb: gainFor(fatihaMedian) }));
