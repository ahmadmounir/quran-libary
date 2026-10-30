// Uploads a local folder to a Cloudflare R2 bucket with the S3 API (SigV4, no dependencies). The key of each file is
// <prefix>/<path inside the folder>. A file already in the bucket with the same MD5 and Cache-Control is skipped (one
// HEAD request each), so running it again only sends what changed.
//
// Credentials: environment variables, or a .env file at the repository root (never commit it):
//   R2_ACCESS_KEY_ID=…  R2_SECRET_ACCESS_KEY=…
//   R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com   R2_BUCKET=<bucket name>
//
// usage: node tools/cloudflare/upload-r2.mjs <local folder> <key prefix>
//   node tools/cloudflare/upload-r2.mjs data/mushaf v1/mushaf
//   node tools/cloudflare/upload-r2.mjs data/fonts  v1/fonts
//   node tools/cloudflare/upload-r2.mjs data/audio  v1/audio
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [folder, prefixArg] = process.argv.slice(2);
if (!folder || !prefixArg) throw new Error("usage: node tools/cloudflare/upload-r2.mjs <local folder> <key prefix>");
const prefix = prefixArg.replace(/^\/+|\/+$/g, "");

const dotenv = fs.existsSync(path.join(ROOT, ".env"))
  ? Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]))
  : {};
const env = { ...dotenv, ...process.env };
for (const k of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET"]) if (!env[k]) throw new Error(`${k} is not set (environment or .env)`);
const endpoint = new URL(env.R2_ENDPOINT);
const bucket = env.R2_BUCKET;

const sha256 = (d) => crypto.createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function signed(method, key, payloadHash, extra = {}) {
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const uri = "/" + [bucket, ...key.split("/")].map(enc).join("/");
  const headers = { host: endpoint.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonical = [method, uri, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const kSign = hmac(hmac(hmac(hmac("AWS4" + env.R2_SECRET_ACCESS_KEY, day), "auto"), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSign).update(["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n")).digest("hex");
  return {
    url: `${endpoint.origin}${uri}`,
    headers: { ...headers, ...extra, Authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
  };
}

const TYPES = { ".mp3": "audio/mpeg", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2" };
// A published file never changes (a new version goes into a new folder), so phones and Cloudflare may keep it a
// year. Only the reciter list may change: an hour.
const cacheOf = (key) => key.endsWith("/reciters.json") ? "public, max-age=3600" : "public, max-age=31536000, immutable";

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const base = path.resolve(folder);
const files = walk(base).filter((f) => TYPES[path.extname(f)]);
let sent = 0, same = 0, bytes = 0, next = 0;
const failed = [];
const t0 = Date.now();

async function upload(file) {
  const key = `${prefix}/${path.relative(base, file).split(path.sep).join("/")}`;
  const body = fs.readFileSync(file);
  const md5 = crypto.createHash("md5").update(body).digest("hex");
  const cache = cacheOf(key);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const head = signed("HEAD", key, sha256(""));
      const h = await fetch(head.url, { method: "HEAD", headers: head.headers });
      // JSON comes back compressed with a weak ETag (W/"md5"); it is the same MD5.
      if (h.ok && h.headers.get("etag")?.replace(/^W\//, "").replace(/"/g, "") === md5 && h.headers.get("cache-control") === cache) { same++; return; }
      if (!h.ok && h.status !== 404) throw new Error(`HEAD ${h.status}`);
      const put = signed("PUT", key, sha256(body), { "Content-Type": TYPES[path.extname(file)], "Cache-Control": cache, "Content-MD5": Buffer.from(md5, "hex").toString("base64") });
      const r = await fetch(put.url, { method: "PUT", headers: put.headers, body });
      if (!r.ok) throw new Error(`PUT ${r.status} ${(await r.text()).slice(0, 200)}`);
      sent++; bytes += body.length;
      return;
    } catch (e) {
      if (attempt === 4) failed.push(`${key}: ${e.message}`);
      else await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < files.length) {
    await upload(files[next++]);
    const n = sent + same + failed.length;
    if (n % 100 === 0) console.log(`${n}/${files.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}));
console.log(JSON.stringify({ prefix, files: files.length, uploaded: sent, alreadyThere: same, failed: failed.length, mb: Math.round(bytes / 1048576) }));
if (failed.length) { console.log(failed.slice(0, 10).join("\n")); process.exitCode = 1; }
