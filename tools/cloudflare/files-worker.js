// Cloudflare Worker: a read-only front for an R2 bucket (binding name FILES). Paste it into a Worker in the dashboard.
//
// Why a Worker and not the bucket's r2.dev address: some providers (e.g. in Turkey) block every *.r2.dev address,
// and r2.dev is rate-limited and never cached. A Worker on workers.dev — or, better, on your own domain — avoids both.
//
// - GET / HEAD only, and only keys inside FOLDERS.
// - Range requests (audio seeking) and If-None-Match (304) are answered.
// - CORS is open: the page fonts are loaded with FontFace and the next audio page with fetch(), both need it.
// - On your own domain (not workers.dev) whole files are also kept in Cloudflare's edge cache, so most requests never
//   reach R2. The Cache API does nothing on *.workers.dev.
const FOLDERS = ["v1/"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: CORS });

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!FOLDERS.some((folder) => key.startsWith(folder)) || key.includes("..")) return new Response("Not found", { status: 404, headers: CORS });

    // Whole-file GETs: try the edge cache first (works on a custom domain only).
    const whole = request.method === "GET" && !request.headers.has("range");
    const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
    if (whole) {
      const hit = await caches.default.match(cacheKey);
      if (hit) return hit;
    }

    const object = await env.FILES.get(key, { range: request.headers, onlyIf: request.headers });
    if (object === null) return new Response("Not found", { status: 404, headers: CORS });

    const headers = new Headers(CORS);
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    if (!("body" in object)) return new Response(null, { status: 304, headers });

    let status = 200;
    if (object.range && request.headers.has("range")) {
      const { offset = 0, length = object.size - offset } = object.range;
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set("Content-Length", String(length));
      status = 206;
    } else {
      headers.set("Content-Length", String(object.size));
    }
    const response = new Response(request.method === "HEAD" ? null : object.body, { status, headers });
    if (whole && status === 200) ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  },
};
