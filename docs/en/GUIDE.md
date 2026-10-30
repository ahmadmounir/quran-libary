# Build a Quran mushaf app — from A to Z

[العربية](../ar/GUIDE.md) · **English** · [Türkçe](../tr/GUIDE.md)

This guide shows how to build a mushaf that looks exactly like the printed Madinah mushaf (the one Quran.com and
Tarteel show), with every word on its own, eight reciters in sync with the text, offline reading on phones, and free
hosting on Cloudflare. Everything here is what we built and run in production. The data is in this repository, and
the example in [`example/`](../../example) is a working app in plain JavaScript that you can read in an hour.

If you work with an AI coding assistant, give it [`AGENTS.md`](../../AGENTS.md) (or the skill in
[`skills/quran-mushaf/`](../../skills/quran-mushaf/SKILL.md)): it describes the whole system for it.

## Contents

1. [What is in this repository](#1-what-is-in-this-repository)
2. [The ideas in two minutes](#2-the-ideas-in-two-minutes)
3. [Run the example](#3-run-the-example)
4. [The data files](#4-the-data-files)
5. [Drawing a page, word by word](#5-drawing-a-page-word-by-word)
6. [Working with words](#6-working-with-words)
7. [The reciters' audio](#7-the-reciters-audio)
8. [Hosting on Cloudflare, step by step](#8-hosting-on-cloudflare-step-by-step)
9. [Caching on phones and staying free](#9-caching-on-phones-and-staying-free)
10. [Putting it into your own app](#10-putting-it-into-your-own-app)
11. [Things that go wrong](#11-things-that-go-wrong)
12. [Thanks](#12-thanks)

---

## 1. What is in this repository

```
data/
  mushaf/
    mushaf_index.json      the page of every ayah, and the juz / hizb of every page
    chapters.json          the 114 surahs (names, number of ayat, first and last page)
    pages/page-001.json …  604 pages: lines, and the words of each line
  fonts/
    pages/p1.woff2 …       604 page fonts (one per page, ~160 KB each, 93 MB in all)
    surah-header.woff2     the ornamental surah frame, one glyph per surah
  audio/
    reciters.json          the reciters (id, name in ar / en / tr, folder)
    <id>/index.json        for each reciter: where every ayah starts inside each page file
tools/
  audio/                   build the reciters' page files (MP3) from the ayah recordings
  cloudflare/              upload to R2, and the Worker that serves the files
example/                   a complete app: pages, word by word, audio, offline
docs/                      this guide in Arabic, English and Turkish
AGENTS.md                  everything an AI assistant needs to build it for you
skills/quran-mushaf/       the same, as a Claude Code skill
```

The audio files themselves (6.2 GB for eight reciters) are not in the repository: the tools rebuild them, byte for
byte, from the original ayah recordings (see [7.2](#72-building-the-audio-files)).

## 2. The ideas in two minutes

**The page is the print.** The mushaf is the 1421H Madinah print of the King Fahd Complex: 604 pages, 15 lines each.
Every line in our data is a line of that print, with the same words in the same order.

**One font per page.** The Complex made one font for every page (called QCF V2). Inside a page's font, every word of
that page is one glyph (sometimes two). So you do not "typeset" Arabic text: you place the glyph of each word, and
the page looks exactly like the print, with the right ligatures, marks and spacing. As a bonus, every word is its own
element on screen — tapping, highlighting and audio sync all come for free.

**One audio file per page.** For each reciter, the ayat of a page are joined into one MP3, with a small index that says
where each ayah starts inside it. Listening to a page costs one request; moving to the next ayah or repeating one is a
jump inside the file, not a new request.

**Static files on Cloudflare.** Everything — page data, fonts, audio — is a static file. They live in Cloudflare R2
(free storage, free download traffic) behind a tiny Worker (a free, read-only address). Files never change once
published, so phones and Cloudflare keep them for a year.

## 3. Run the example

You need any static web server. From the repository's folder:

```bash
npx serve .
```

or `python -m http.server 8000`. Open `http://localhost:3000/example/` (or `:8000/example/`). The mushaf works at once,
from the repository's own `data/` folder. Swipe (or use the arrows) to turn pages; tap a word to see it.

**Audio** needs the MP3 files, which are not in git. Either build one reciter (about an hour, see
[7.2](#72-building-the-audio-files)):

```bash
node tools/audio/build-reciter.mjs husary
```

or point the example at audio you already host: `example/index.html?audio=https://your-worker.workers.dev/v1/audio`.

## 4. The data files

### 4.1 `mushaf/mushaf_index.json`

```json
{
  "pageInfo":  [[1, 1, 1], [2, 1, 1], …],          // per page (index = page − 1): [first surah, juz, hizb]
  "ayahPages": { "1": [1, 1, 1, 1, 1, 1, 1], "2": [2, 2, 2, 2, 2, 3, …], … }   // surah → page of each ayah
}
```

`ayahPages["2"][4]` is the page of 2:5. Every page starts at the first word of an ayah: no ayah is split across two
pages in this print.

### 4.2 `mushaf/chapters.json`

114 entries: `id`, `name_arabic`, `name_simple`, `verses_count`, `bismillah_pre` (true when the surah is preceded by
the basmala: all but 1 and 9), `pages: [first, last]`, `revelation_place`.

### 4.3 `mushaf/pages/page-NNN.json`

```json
{
  "page": 3,
  "script": "qcf-v2",
  "lines": [
    { "line": 1, "type": "words", "words": [
      { "id": 6905, "surah": 2, "ayah": 6, "pos": 1, "text": "إِنَّ", "end": 0, "g": "ﱁ" }, …
    ]},
    …
  ]
}
```

Other kinds of line (page 604, for example):

```json
{ "line": 1, "type": "header", "surah": 112 }
{ "line": 2, "type": "basmala", "g": "ﱁﱂﱃﱄ", "fontPage": 1 }
{ "line": 4, "type": "words", "centered": true, "words": [ … ] }
```

- `type: "words"` — a printed line. Each word has:
  - `id`: the word's global id (the same ids Quran.com uses);
  - `surah`, `ayah`, `pos`: where it is (pos = the word's position in its ayah);
  - `text`: the word in Unicode (Uthmani script) — for search, copy, screen readers;
  - `g`: the glyph code(s) to draw, in **this page's** font;
  - `end: 1` marks the ayah-number glyph at the end of an ayah.
- `centered: true` — a short line the print centers (end of a surah, the last pages) instead of filling it.
- `type: "header"` — a surah's ornamental frame (drawn from `fonts/surah-header.woff2`).
- `type: "basmala"` — the basmala before a surah, drawn with the glyphs of **page `fontPage`'s** font (Al-Fatihah's).

Pages 1 and 2 have fewer, shorter lines; draw them centered and a little larger, as printed.

### 4.4 Fonts

- `fonts/pages/p{N}.woff2` — the font of page N. Register it under a family name of your choice (we use `qcf-v2-pN`)
  and draw the page's `g` codes with it. **Never modify these files.**
- `fonts/surah-header.woff2` — one glyph per surah: the frame with «سورة …» inside. The code point of each surah's
  glyph is the table `SURAH_HEADER_CODES` in [`example/js/fonts.js`](../../example/js/fonts.js) (surah 1 = U+FC45).

### 4.5 Audio

`audio/reciters.json`:

```json
{ "v": 1, "reciters": [
  { "id": "husary", "name": { "ar": "محمود خليل الحصري", "en": "Mahmoud Khalil Al-Husary", "tr": "Mahmud Halil el-Husari" },
    "style": "murattal", "path": "husary/" }, …
]}
```

`audio/<id>/index.json` (and next to it, once built or hosted, `p001.mp3 … p604.mp3`):

```json
{ "v": 1, "rate": 22050, "kbps": 64,
  "pages": { "1": { "ms": 42516, "bytes": 340636, "ayat": [[1, 1, 0], [1, 2, 4739], [1, 3, 9989], …] }, … } }
```

For every page file: its length in ms, its size, and `[surah, ayah, startMs]` for every ayah in it. **Ayah 0 is the
basmala** the reciter reads before ayah 1 of a surah (never before surahs 1 and 9). An ayah ends where the next one
starts (the last one ends at `ms`).

The eight reciters: Mahmoud Khalil Al-Husary, Mohamed Siddiq El-Minshawi, Saud Al-Shuraim, Maher Al-Muaiqly, Yasser
Al-Dosari, Mishary Rashid Alafasy, Abdul Basit Abdul Samad, Ali Jaber — all murattal.

## 5. Drawing a page, word by word

The code is [`example/js/page.js`](../../example/js/page.js) and [`example/style.css`](../../example/style.css).

### 5.1 The structure

```html
<div class="page-card" dir="rtl">
  <div class="page-head"><span>سورة البقرة</span><span>الجزء الأول</span></div>
  <div class="page-body" style="font-family: qcf-v2-p3">
    <div class="line">
      <span class="word" data-location="2:6:1" data-word-id="6905">ﱁ</span> …
    </div>
    …
  </div>
  <div class="folio">3</div>
</div>
```

One `div` per line, one `span` per word, the span's text is the word's `g`.

### 5.2 The sizes: everything follows the page's width

The page is a card with the proportions of a printed page (3:5). It is a CSS **size container**, so every size inside
it is in `cqw` (1 % of the card's width) and the page looks identical on a phone, a tablet or a laptop:

```css
.page-card {
  aspect-ratio: 3 / 5;
  width: min(100%, 450px, calc((100dvh - 9.5rem) * 3 / 5));  /* fits the screen's width AND height */
  container-type: inline-size;
  --qcf-room: calc(164.5cqw - 3.5rem);                        /* the height the 15 lines share */
  --qcf-size: min(calc(100cqw / 16), calc(var(--qcf-room) / 27));
}
```

A full printed line of these fonts is about 15.6 em wide, so `100cqw / 16` makes a line exactly as wide as the page.
The second limit keeps 15 lines from touching each other on short, wide screens (each line gets at least 1.8 em).

```css
.page-body { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
.line      { display: flex; justify-content: space-between; white-space: nowrap; font-size: var(--qcf-size); line-height: 1.5; }
.line.centered { justify-content: center; column-gap: 0.25em; }
```

`space-between` spreads the words edge to edge, exactly like the print. Keep `overflow: visible`: the marks above and
below the letters go beyond the line box.

- Surah header: `font-size: calc(100cqw / 3.302)` — the frame glyph is 3.302 em wide, so it fills the page's width.
- Basmala line: centered, `font-size: var(--qcf-size)`, drawn with page `fontPage`'s font.
- Pages 1–2: lines centered and 1.3× larger.

### 5.3 Loading the fonts the right way

Each page needs its own font (~160 KB). Load them with the `FontFace` API and register them yourself:

```js
const face = await new FontFace("qcf-v2-p3", "url(…/fonts/pages/p3.woff2)", { display: "block" }).load();
document.fonts.add(face);
```

Rules that keep it fast and cheap (all in [`example/js/fonts.js`](../../example/js/fonts.js)):

1. **Draw a page only once its fonts are loaded.** The glyph codes mean nothing in another font — show an empty page
   (placeholder lines) meanwhile, never the codes. `display: "block"` guarantees that.
2. **Nearest first, two at a time.** A queue loads the font of the page being read first, then its neighbours; pages
   farther than one page away wait until the reader comes near.
3. **Keep the last 24 fonts**, remove older ones from `document.fonts` (decoded fonts take memory).
4. A page with a basmala also needs page 1's font; a page with a surah header needs the header font.

### 5.4 The rare line that is too wide

On a few pages, at some sizes, one line is a hair wider than the page. After drawing, measure each line once and
shrink only that line ([`fitLines`](../../example/js/page.js)):

```js
const ratio = sumOfWordWidths / line.width;
if (ratio > 1) line.style.fontSize = `calc(${currentSize} * ${0.99 / ratio})`;
```

The ratio does not depend on the size, so it stays right when the page is resized (measure again on resize).

### 5.5 Turning pages: right to left

The next page is on the **left**. Swiping the page to the right (pulling it like a paper page) shows the next page;
`←` is the next page, `→` the previous one. Show the "previous" button on the right and "next" on the left.

### 5.6 Ahead of time

When a page is shown, fetch the page files of the two pages before and after it (a few KB each) and queue the fonts
of the one before and after it. Turning a page then shows it at once.

## 6. Working with words

Every word on screen carries everything about itself:

```html
<span class="word" data-location="2:255:3" data-word-id="…" data-text="ٱللَّهُ">ﱆ</span>
```

- **Tap a word**: read `data-location` and `data-text` (see the click handler in [`example/js/app.js`](../../example/js/app.js)).
- **Highlight a whole ayah** without re-drawing anything — one CSS rule:

  ```js
  style.textContent = `.word[data-location^="2:255:"] { background: … }`;
  ```

  (`^=` "starts with": `2:255:` matches every word of 2:255, never 2:25.)
- **Mark a word** (memorization mistakes, notes, bookmarks): store the word `id` or its location.
- **Search**: search the `text` of the words (remove the harakat first for a forgiving search).

## 7. The reciters' audio

### 7.1 Why one file per page

The usual sources give one MP3 per ayah: 6,236 files per reciter. Playing a page that way means a request for every
ayah — a burst of requests on every page. Joining a page's ayat into one file means **one request per page**, and
going to the next ayah, back, or repeating an ayah is a seek inside the file you already have.

### 7.2 Building the audio files

Requirements: Node 20 or newer and [ffmpeg](https://ffmpeg.org/) on your PATH.

```bash
node tools/audio/build-reciter.mjs husary      # or minshawi, shuraim, muaiqly, dosari, alafasy, abdulbasit, alijaber
```

It runs four steps ([`tools/audio/`](../../tools/audio)) and writes `data/audio/husary/p001.mp3 … p604.mp3` and
`index.json`:

1. **Download** the reciter's 6,236 ayah files from EveryAyah into `sources/` (polite: 4 at a time, resumes where it
   stopped).
2. **Measure the basmala.** Some reciters' basmala was recorded much quieter than their other ayat; the tool measures
   the loudness (EBU R128) and computes a gain so it sounds the same.
3. **Build the pages.** For each page, its ayat are decoded, the silence at each ayah's edges is trimmed (to ~0.1 s
   before and 0.15 s after, with an 8 ms fade, so one ayah follows the next without a gap), the basmala is put before
   ayah 1 of every surah except 1 and 9, and the page is encoded **once** as mono **CBR** 64 kbps MP3.
   - The start of each ayah is counted in samples, so the index is exact.
   - CBR matters: browsers seek precisely in constant-bitrate MP3.
4. **Check**: 604 pages, 6,236 ayat, and each file's decoded length equals its index.

The result is the same, byte for byte, as the files we publish: you can check it against `data/audio/<id>/index.json`.
One reciter takes about an hour (mostly the download) and 0.5–1.2 GB. Options per reciter are in
[`tools/audio/reciters.config.json`](../../tools/audio/reciters.config.json) (Ali Jaber's first file begins with the
isti'adha, so his basmala starts 7 s into it).

### 7.3 Playing in sync with the page

The code is [`example/js/audio-queue.js`](../../example/js/audio-queue.js) and
[`example/js/audio-player.js`](../../example/js/audio-player.js). The idea:

1. **The play list.** "From 2:5 to the end of the surah" becomes a list of items
   `{ page file, surah, ayah, startMs, endMs }`, read from the reciter's `index.json` (with the basmala item before
   ayah 1 where there is one).
2. **One `<audio>` element.** For an item, set `audio.src` to its page file (once per page) and
   `audio.currentTime = startMs`. The current page **streams**: the sound starts after a few KB.
3. **Know where you are.** On `timeupdate` (about 4 times a second) — plus a timer aimed exactly at the end of the
   current ayah, so the end of a repeat is precise even with the screen off — compare `currentTime` with `endMs`:
   - same page, next ayah right after → just move the highlight (the sound plays on);
   - repeat → seek back to `startMs` (no request);
   - another page → switch `src`.
4. **The next page, ahead of time.** Three seconds after a page starts playing, `fetch()` the next page file the list
   needs (one request) and keep it as a `Blob` URL. When the recitation reaches it, it plays from memory, instantly.
   Keep about 4 such pages, release older ones with `URL.revokeObjectURL`.
5. **Follow the text.** On every new item: highlight its ayah (the CSS rule from [6](#6-working-with-words)) and, if
   the ayah is on another page, turn to that page.
6. **Be kind to phones.** A page that fails to load is retried once after 1.5 s; the play button retries after an
   error; `NotAllowedError` means the browser wants a tap first (iPhone) — show "paused", not an error.
7. **Lock screen.** Set `navigator.mediaSession.metadata` (surah and ayah, reciter) and the play / pause / previous /
   next handlers.

In right-to-left languages put "next ayah" on the left and mirror the skip icons.

### 7.4 Two prints, one audio

Which page **file** an ayah is in comes from the reciter's `index.json`, never from the mushaf's pages; turning the
page uses the mushaf's own index. So audio cut for one print plays correctly with another print on screen (the 1405H
and 1421H prints put 56 ayat on a neighbouring page). Our files are cut on the 1421H pages, the same as `data/mushaf`.

## 8. Hosting on Cloudflare, step by step

Everything is free within Cloudflare's free tiers (see [9.4](#94-what-it-costs)).

### 8.1 Account

Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com). R2 asks for a payment method once to
switch it on, even for the free tier; nothing is charged within the free limits.

### 8.2 A bucket

**R2 Object Storage → Create bucket** → name it (e.g. `quran-files`) → location: automatic → **Create**.

### 8.3 Upload the files

The layout we recommend mirrors the repository's `data/` folder under a version folder:

```
v1/mushaf/…   v1/fonts/…   v1/audio/…
```

- **A few files**: in the bucket, **Upload** and drag the folders in.
- **Thousands of files** (fonts, audio): use the tool.
  1. **R2 → Manage API tokens → Create API token** → permission **Object Read & Write**, only on your bucket →
     create. Copy the Access Key ID and the Secret Access Key (shown once).
  2. Copy `.env.example` to `.env` (never commit `.env`) and fill in the keys, the S3 endpoint (bucket →
     Settings → S3 API, without the bucket name) and the bucket name.
  3. Upload:

     ```bash
     node tools/cloudflare/upload-r2.mjs data/mushaf v1/mushaf
     node tools/cloudflare/upload-r2.mjs data/fonts  v1/fonts
     node tools/cloudflare/upload-r2.mjs data/audio  v1/audio
     ```

     Every file gets `Cache-Control: public, max-age=31536000, immutable` (a year) — except `reciters.json`, which
     gets an hour. Running it again only sends what changed.

### 8.4 The Worker: your public address

1. **Workers & Pages → Create → Start with Hello World** → name it (e.g. `quran-files`) → **Deploy**.
2. **Edit code** → replace everything with [`tools/cloudflare/files-worker.js`](../../tools/cloudflare/files-worker.js)
   → **Deploy**.
3. The Worker's **Settings → Bindings → Add → R2 bucket** → variable name **`FILES`** → your bucket → **Deploy**.
4. Your files are now at `https://quran-files.<your-subdomain>.workers.dev/v1/…`. Check one:
   `…/v1/mushaf/chapters.json`.

The Worker only answers `GET` / `HEAD` for keys inside `FOLDERS` (`v1/` by default), answers Range requests (audio
seeking) and sends open CORS headers (the fonts and the next audio page are read with `FontFace` / `fetch`, which need
them).

### 8.5 Why not the bucket's r2.dev address?

R2 can give a bucket a public `pub-….r2.dev` address, but: some internet providers block every `*.r2.dev` address
(we measured it in Turkey: the connection fails); it is rate-limited; and Cloudflare never caches it. Use the Worker
(or your own domain).

### 8.6 Your own domain (later, recommended)

Add your domain to Cloudflare (**Websites → Add a site**, then change its name servers at your registrar), then in the
Worker: **Settings → Domains & Routes → Add → Custom domain** → e.g. `files.example.com`. Two gains: no provider blocks
it, and the Worker keeps whole files in Cloudflare's edge cache (the Cache API does nothing on `workers.dev`), so most
requests never reach R2.

### 8.7 Point the app at it

In the example, `FILES_BASE` in [`example/js/config.js`](../../example/js/config.js) is the address of `v1`
(e.g. `https://quran-files.you.workers.dev/v1`); the audio is `FILES_BASE + "/audio"` unless `AUDIO_BASE` says
otherwise. For a quick test: `example/index.html?files=https://…/v1`.

## 9. Caching on phones and staying free

### 9.1 Files that never change

Every published file is **immutable**: if something changes, publish it in a new folder (`v2/…`) and point the app at
it; never overwrite. That allows `Cache-Control: immutable, max-age=31536000`: the phone keeps the file for a year and
does not even ask the server again.

### 9.2 A service worker: the mushaf offline

[`example/sw.js`](../../example/sw.js):

- page files, the index and the fonts: **cache first** — after the first visit, a page is drawn with no network at all;
- the app's own files (HTML, CSS, JS): **network first**, the stored copy when offline;
- audio: not stored by the service worker (big files, Range requests); the browser's own HTTP cache keeps them, and the
  player downloads the next page in the background.

Want a page available offline before it is read? Fetch its page file and font once (e.g. a "download the mushaf"
button that walks through the 604 pages slowly) — the service worker keeps what passes through it.

### 9.3 Cloudflare's own cache

With your own domain (8.6), the Worker keeps whole files at Cloudflare's edge: the first student in a city fetches a
page from R2, the next ones get it from the edge.

### 9.4 What it costs

Free tiers at the time of writing (check Cloudflare's pricing pages):

| Service | Free every month | What uses it |
|---|---|---|
| R2 storage | 10 GB | fonts 93 MB + page data 9 MB + audio 0.5–1.2 GB per reciter (8 reciters ≈ 6.3 GB) |
| R2 reads (class B) | 10 million | each file served from R2 |
| R2 writes (class A) | 1 million | uploads only |
| R2 download traffic | free, no limit | — |
| Workers | 100,000 requests **a day** | each file request |

Example: 300 students, each reading 5 new pages and listening to 3 pages a day → about 300 × (5 page files + 5 fonts
+ 3 audio pages) ≈ 4,000 requests a day — 4 % of the Worker's daily allowance. Files already on the phone cost nothing.

The rules that keep it this low: one audio file per page; fonts loaded only near the reader; prefetch ±2 page files
and ±1 font, never the whole book at once; immutable files; a service worker.

## 10. Putting it into your own app

The example is plain JavaScript on purpose: the same pieces work in React, Vue, Svelte, Flutter (WebView), or a
native app.

- **React**: a `<QuranPage page={n} />` component that loads the page file and its fonts (render the placeholder
  until both are ready), the fonts module as a plain module (it keeps its own queue), and `fitLines` in a
  `useLayoutEffect` after the page is drawn. Keep the audio player as a class outside React; subscribe to it with
  `useSyncExternalStore`.
- **Swiping**: any carousel works (we use Swiper with `dir="rtl"` and virtual slides: only the current page and one
  on each side are mounted).
- **Native apps**: the page file + font approach works the same (register the font file, draw the `g` codes with
  it); for audio use the platform's player and the same `index.json`.

**With an AI assistant**: open your project in Claude Code (or another agent), copy this repository's `AGENTS.md`
next to it or install the skill (`skills/quran-mushaf/` into your `.claude/skills/`), and ask: "Add the mushaf to my
app following AGENTS.md". It knows the data, the rules above and the checks to run.

## 11. Things that go wrong

| What you see | Why | Fix |
|---|---|---|
| Random letters instead of the Quran | the page was drawn before its font loaded | `FontFace` with `display: "block"`, draw only after `load()` |
| A line goes beyond the page | that line is a hair wider at this size | measure and shrink that line (5.4) |
| Fonts do not load from your server | no CORS header | serve them through the Worker (it sends CORS) |
| Nothing loads for some users | `*.r2.dev` is blocked by their provider | use the Worker or your own domain |
| Audio does not start on iPhone | the browser wants a tap | start playing inside the tap; show "paused" on `NotAllowedError` |
| Old data after an update | files were overwritten while phones keep them a year | never overwrite: publish into a new folder |
| A burst of requests per page | one file per ayah, or prefetching too much | one file per page; prefetch ±2 / ±1 |
| Rebuilding the page data from QUL | QUL splits «بَعْدَ مَا» into two words in 2:181, 8:6 and 13:37 | keep one word with both glyphs (our data does) |

## 12. Thanks

This work stands on the shoulders of others, and we thank them sincerely:

- **King Fahd Glorious Qur'an Printing Complex** (Madinah) — the Madinah mushaf and its page fonts (QCF V2), which we
  use unmodified.
- **Tarteel — Quranic Universal Library (QUL)** — the page layout data and the word-by-word glyph codes our page files
  are built from, and the surah header font.
- **Quran.com / Quran Foundation** — the word ids and the open work that showed the way.
- **EveryAyah.com** — the ayah-by-ayah recordings our audio files are built from.
- **The reciters** — Sheikh Mahmoud Khalil Al-Husary, Sheikh Mohamed Siddiq El-Minshawi, Sheikh Saud Al-Shuraim,
  Sheikh Maher Al-Muaiqly, Sheikh Yasser Al-Dosari, Sheikh Mishary Rashid Alafasy, Sheikh Abdul Basit Abdul Samad and
  Sheikh Ali Jaber — may Allah reward them.

All rights to the fonts, the page data and the recordings belong to their owners. We share them here freely, as a
non-commercial service to everyone who serves the Book of Allah. If you build something commercial, read each
source's terms first. The [MIT licence](../../LICENSE) covers the code and guides written for this repository.
