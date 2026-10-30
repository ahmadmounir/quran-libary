---
name: quran-mushaf
description: Add a Quran mushaf to an app the way Quran.com / Tarteel show it — the 1421H Madinah print drawn with the King Fahd Complex page fonts (QCF V2), word by word, with eight reciters in sync, offline caching and free Cloudflare R2 + Worker hosting — using the data and reference code of github.com/ahmadmounir/quran-libary. Use when the user asks for a mushaf, Quran pages, word-by-word Quran, a Quran audio player synced with the text, or hosting Quran fonts / audio.
---

# Quran mushaf

Build the mushaf from the quran-libary repository. Its `AGENTS.md` is the full specification; this skill is the
order of work.

## 1. Get the repository

If it is not in the workspace yet:

```bash
git clone https://github.com/ahmadmounir/quran-libary.git
```

Read `quran-libary/AGENTS.md` completely before writing code, then look at `example/js/` (the reference modules).

## 2. Ask only what you cannot decide

- Where the files will be served from: the app's own static folder (copy `data/`), or Cloudflare (R2 + the Worker,
  `AGENTS.md` §6). Default for production: Cloudflare.
- Which reciters (default: all eight; Al-Husary first).
- The app's stack, if it is not obvious from the project.

## 3. Build in this order

1. **Data access** — port `example/js/data.js` (`getMushafIndex`, `getChapters`, `getPage`, `prefetchPagesAround`) with
   one `FILES_BASE` setting.
2. **Fonts** — copy `example/js/fonts.js` unchanged in behaviour (queue: nearest first, 2 at a time, radius 1, LRU 24,
   `display: "block"`).
3. **Page** — port `example/js/page.js` + the page CSS from `example/style.css` (AGENTS.md §3: 3:5 container, `cqw`,
   `--qcf-size`, justified lines, centered lines, pages 1–2, surah frame, basmala, line fit, placeholder).
4. **Navigation** — RTL: next page on the left, swipe right = next; prefetch page JSON ±2 and fonts ±1.
5. **Words** — `data-location` on every word; tap → word info; ayah highlight with one CSS rule.
6. **Audio** — copy `example/js/audio-queue.js` and `audio-player.js`; reciter list from `audio/reciters.json`; play
   list from the reciter's `index.json`; follow the page with `pageOfAyah`; Media Session; RTL controls.
7. **Offline** — the service worker from `example/sw.js` (cache-first data and fonts, network-first app shell).
8. **Audio files** — they are not in git. Follow `AGENTS.md` §5.1: check Node 20+ and ffmpeg, ask which reciters,
   then run `node tools/audio/build-reciter.mjs <id …|all>` in the background. It downloads the recordings from
   EveryAyah and rebuilds the published files byte for byte (~1 hour per reciter).
9. **Hosting** (when the user wants it) — walk them through `docs/<lang>/GUIDE.md` §8, or run
   `tools/cloudflare/upload-r2.mjs` with their `.env` (never print or commit the keys).

## 4. Verify (AGENTS.md §9)

Run every check in `AGENTS.md` §9 in a real browser at 360 px wide before reporting that it works: no overflowing
line on the listed pages, no glyph codes in a fallback font, request counts, audio highlight / page turn / repeat,
offline reload, RTL controls. Report what you could not check (e.g. a real iPhone).

## Thanks

This work stands on the shoulders of others, and we thank them sincerely: the King Fahd Glorious Qur'an Printing
Complex (the Madinah mushaf and its page fonts), Tarteel — Quranic Universal Library (QUL) (page layout and
word-by-word glyph data, surah header font), Quran.com / Quran Foundation (word ids), EveryAyah.com (the ayah
recordings) and the reciters. All rights to the fonts, page data and recordings belong to their owners; they are
shared freely as a non-commercial service — commercial users must read each source's terms first.
