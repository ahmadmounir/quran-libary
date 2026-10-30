# AGENTS.md — building a Quran mushaf from this repository

Instructions for AI coding assistants (Claude Code, Codex, Cursor, Copilot …). Follow them to add a mushaf to a
user's app: the 1421H Madinah print drawn with the King Fahd Complex page fonts (as on Quran.com / Tarteel), word by
word, with reciters' audio in sync, offline caching, and free Cloudflare hosting. The human guide is
`docs/en/GUIDE.md` (also `docs/ar`, `docs/tr`); the reference implementation is `example/` (plain JavaScript).

**Scope.** Only the mushaf: pages, fonts, words, audio, hosting, caching. No accounts, backend, or memorization
tracking unless the user asks for them separately.

## 1. Repository map

| Path | Content |
|---|---|
| `data/mushaf/mushaf_index.json` | `{ pageInfo: [[firstSurah, juz, hizb] per page], ayahPages: { "<surah>": [page of each ayah] } }` |
| `data/mushaf/chapters.json` | 114 × `{ id, name_arabic, name_simple, verses_count, bismillah_pre, pages: [first, last], … }` |
| `data/mushaf/pages/page-NNN.json` | 604 pages (NNN = 001…604), format in §2 |
| `data/fonts/pages/p{N}.woff2` | page fonts, N = 1…604 (no padding), ~160 KB each |
| `data/fonts/surah-header.woff2` | surah frames; code points in `example/js/fonts.js` (`SURAH_HEADER_CODES`) |
| `data/audio/reciters.json` | `{ v, reciters: [{ id, name: { ar, en, tr }, style, path: "<id>/" }] }` |
| `data/audio/<id>/index.json` | timing index per reciter, §5; the MP3s are NOT in git (built by `tools/audio`) |
| `example/js/*.js` | reference modules: `config`, `data`, `fonts`, `page`, `audio-queue`, `audio-player`, `app`; `example/sw.js` |
| `tools/audio/build-reciter.mjs <id>` | builds `data/audio/<id>/p001.mp3…p604.mp3` (Node 20+, ffmpeg) |
| `tools/cloudflare/upload-r2.mjs <dir> <prefix>` | uploads to R2 (keys in `.env`, see `.env.example`) |
| `tools/cloudflare/files-worker.js` | Worker serving the bucket (binding `FILES`, folders `v1/`) |

Reciter ids: `husary` (default), `minshawi`, `shuraim`, `muaiqly`, `dosari`, `alafasy`, `abdulbasit`, `alijaber`.

## 2. Page file format (the contract)

```ts
type Word = { id: number; surah: number; ayah: number; pos: number; text: string; end: 0 | 1; g: string };
type Line =
  | { line: number; type: "words"; words: Word[]; centered?: boolean }
  | { line: number; type: "header"; surah: number }
  | { line: number; type: "basmala"; g: string; fontPage: number };
type Page = { page: number; script: "qcf-v2"; lines: Line[] };
```

- Draw `g` (glyph codes in THIS page's font). `text` is the Unicode word: use it for search, copy, `aria-label`.
- `end: 1` = the ayah-number glyph. `pos` counts within the ayah; location key = `${surah}:${ayah}:${pos}`.
- `id` = global word id (Quran.com word ids). Store marks / bookmarks by `id` or location.
- `centered` lines are centered, all other word lines are justified edge to edge.
- `basmala.g` is drawn with page `fontPage`'s font (always 1).
- Invariants: 604 pages; exactly 15 lines on pages 3–604 and 8 on pages 1–2 (header and basmala lines count); every
  page starts on the first word of an ayah; 6,236 ayat; 77,429 words + 6,236 ayah-number glyphs.

## 3. Rendering rules (must follow)

1. One element per line, one element per word; the word element's text is `g`; set `data-location`, keep `text`
   available (dataset or aria).
2. Container: a 3:5 card with `container-type: inline-size`; all inner sizes in `cqw`.
   - `--qcf-room: calc(164.5cqw - 3.5rem)`; `--qcf-size: min(calc(100cqw / 16), calc(var(--qcf-room) / 27))`.
   - Width: `min(100%, 450px, calc((100dvh - <chrome height>) * 3 / 5))` so the whole page fits.
3. Body: flex column, `justify-content: space-between`, `direction: rtl`, vertical padding ~1.75rem.
4. Line: `display: flex; justify-content: space-between; white-space: nowrap; font-size: var(--qcf-size);
   line-height: 1.5; overflow: visible`. Centered line: `justify-content: center; column-gap: 0.25em`.
5. Pages 1–2 (`page <= 2`): body centered with `gap: 0.4em`, lines centered, `font-size: calc(var(--qcf-size) * 1.3)`.
6. Surah header: block of height `12.2cqw`, glyph `surahHeaderGlyph(surah)` in the header font,
   `font-size: calc(100cqw / 3.302)`, `line-height: 1`.
7. After the page is in the DOM, run the line fit: for each line, `ratio = Σ word widths (+ gaps) / line width`; if
   `ratio > 1`, `font-size = currentSize × 0.99 / ratio` on that line only. Re-run on resize.
8. Never show `g` in a fallback font: render a placeholder (15 grey bars) until the page's fonts are loaded.

## 4. Font loading rules (must follow)

- `new FontFace(family, "url(…/pN.woff2) format('woff2')", { display: "block" }).load()` then `document.fonts.add`.
- A page needs: its own font; page 1's font if it has a `basmala` line; the header font if it has a `header` line.
- Queue: nearest page to the reader first, at most **2** concurrent, pages farther than **1** from the reader wait.
- Keep at most **24** fonts registered (LRU); `document.fonts.delete` the evicted ones.
- Copy `example/js/fonts.js` rather than rewriting it.

## 5. Audio (must follow)

Index: `{ v, rate, kbps, pages: { "<page>": { ms, bytes, ayat: [[surah, ayah, startMs], …] } } }`. Ayah 0 = basmala
before ayah 1 (never surahs 1 and 9). An ayah ends at the next entry's `startMs`, the last at `ms`. Files:
`<AUDIO_BASE>/<reciter.path>p001.mp3` (3-digit page).

- Build the play list with `buildQueue(index, { from, to })` (`example/js/audio-queue.js`): the page FILE of an ayah
  comes from the reciter's index, never from the mushaf index.
- Player (`example/js/audio-player.js`, copy it): one `<audio>`; `src` = page file (stream), seek to `startMs`;
  `timeupdate` + a timer at the ayah's end; contiguous next ayah in the same file → only move the highlight; repeat =
  seek; other page → new `src`; 3 s after a page starts, `fetch()` the next needed page into a Blob URL (keep 4);
  retry a failed load once after 1.5 s; `NotAllowedError` → "paused".
- Highlight the current ayah with one CSS rule `.word[data-location^="S:A:"]` (no re-render).
- Turn to `pageOfAyah(mushafIndex, item)` when it differs from the page shown.
- Media Session metadata + play / pause / previoustrack / nexttrack handlers.
- RTL UI: "next ayah" on the LEFT, skip icons mirrored; next PAGE is also on the left, swipe right = next page.
- Start playback inside the user's tap (preload the reciter's `index.json` before), or iPhones refuse to play.

## 6. Hosting (Cloudflare)

- Bucket layout = the repo's `data/` under a version folder: `v1/mushaf/…`, `v1/fonts/…`, `v1/audio/…`.
- Upload with `tools/cloudflare/upload-r2.mjs` (sets `Cache-Control: public, max-age=31536000, immutable`; one hour for
  `reciters.json`). Never overwrite a published file: publish changes under `v2/`.
- Serve through `tools/cloudflare/files-worker.js` (binding `FILES`): GET/HEAD only, `FOLDERS = ["v1/"]`, Range, 304,
  open CORS (required by `FontFace` and `fetch`). On a custom domain it also uses the edge cache.
- Do NOT use the bucket's `*.r2.dev` address in production: blocked by some ISPs (Turkey), rate-limited, uncached.
- The app needs one setting: `FILES_BASE = https://<worker or domain>/v1` (`AUDIO_BASE` defaults to
  `FILES_BASE + "/audio"`). During development the repo's `data/` folder can be served as-is.
- Secrets: R2 keys only in `.env` / CI secrets, never in the client, never committed.

## 7. Caching and budget

- Service worker (`example/sw.js`): cache-first for `/mushaf/` and `/fonts/` (immutable), network-first for the app
  shell, no audio in the service worker (Range; the HTTP cache keeps audio).
- Prefetch only page JSON ±2 and fonts ±1 around the reader; never download the whole mushaf without the user
  asking. Audio: one request per page.
- Free tiers (verify current numbers): R2 10 GB storage, 10 M reads, 1 M writes a month, free egress; Workers 100 k
  requests a day. 8 reciters ≈ 6.3 GB + fonts 93 MB.

## 8. Integration recipes

- **Plain JS / any server-rendered site**: copy `example/` and set `FILES_BASE`.
- **React**: page component loads `getPage(n)` + fonts (placeholder until both ready), `fitLines` in
  `useLayoutEffect`, fonts module stays a plain module; the audio player is a class outside React, read through
  `useSyncExternalStore`; swiping with a virtual RTL carousel (only current ±1 mounted).
- **Vue / Svelte**: same split (data + fonts modules, page component, player class).
- **Native / Flutter**: register the page font file and draw `g`; same line rules; platform audio player with the
  same `index.json` logic.

## 9. Checks to run before saying it works

1. Render pages 1, 2, 3, 50, 187, 342, 443, 552, 591, 604 at a 360 px wide viewport: no line has
   `scrollWidth > clientWidth`, 15 lines (header and basmala included) on pages ≥ 3, surah frames fill the width.
2. Throttle the network: a page never shows letters in a fallback font (placeholder first).
3. Open a page and look at the network: 1 page JSON + ≤ 3 fonts for the current page and its neighbours, not more.
4. Play from a word in the middle of a page: the right ayah is highlighted, the page turns at the last ayah, one audio
   request per page (the next page comes from the Blob prefetch).
5. Repeat ×2 on an ayah: it is read twice, then the next ayah.
6. Reload offline after reading a page: it draws from the service worker cache.
7. Arabic UI: next page / next ayah on the left.

## 10. Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Random Arabic letters | drawn before the font loaded | `display: "block"`, placeholder until `load()` |
| A line overflows | glyphs wider at this size | line fit (§3.7) |
| Fonts blocked | no CORS | serve through the Worker |
| Works for you, not for users in Turkey | `*.r2.dev` blocked | Worker / custom domain |
| No sound on iPhone | play not started inside a tap | preload the index, call play in the handler |
| Stale data after an update | overwritten immutable files | new version folder |
| Wrong audio near page breaks | audio file located via the mushaf index | locate via the reciter index (`buildQueue`) |
| Rebuilding page data from QUL fails at 2:181, 8:6, 13:37 | QUL splits «بَعْدَ مَا» into two words | one word, both glyphs |

Do not modify the font files. Do not re-host the recordings publicly without reading the sources' terms.

## Thanks

This work stands on the shoulders of others, and we thank them sincerely: the **King Fahd Glorious Qur'an Printing
Complex** (the Madinah mushaf and its page fonts, used unmodified); **Tarteel — Quranic Universal Library (QUL)** (the
page layout and word-by-word glyph data, the surah header font); **Quran.com / Quran Foundation** (word ids);
**EveryAyah.com** (the ayah recordings); and the reciters Mahmoud Khalil Al-Husary, Mohamed Siddiq El-Minshawi, Saud
Al-Shuraim, Maher Al-Muaiqly, Yasser Al-Dosari, Mishary Rashid Alafasy, Abdul Basit Abdul Samad and Ali Jaber. All
rights to the fonts, page data and recordings belong to their owners; they are shared here freely as a non-commercial
service. Commercial users: read each source's terms first. The MIT licence covers this repository's code and guides.
