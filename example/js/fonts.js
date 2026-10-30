// The page fonts: the King Fahd Complex fonts of the 1421H Madinah print (QCF V2), one font per page.
// Every word of a page file carries its glyph code(s) `g` in its page's font, so a page is drawn exactly as printed.
//
// Loading rules (keep them — they are what keeps a phone fast and the server quiet):
// - a font is loaded only when a page needs it, nearest to the reader first, at most two at a time;
// - pages farther than one page from the reader wait until the reader comes near;
// - only the most recent fonts stay registered (a page font is ~160 KB to download, more once decoded).
import { FILES_BASE, TOTAL_PAGES } from "./config.js";

export const pageFontFamily = (page) => `qcf-v2-p${page}`;
export const pageFontUrl = (page) => `${FILES_BASE}/fonts/pages/p${page}.woff2`;
export const SURAH_HEADER_FAMILY = "qcf-surah-header";
export const SURAH_HEADER_FONT_URL = `${FILES_BASE}/fonts/surah-header.woff2`;

const MAX_FONTS = 24;
const FONT_CONCURRENCY = 2;
const FONT_RADIUS = 1;
const fonts = new Map(); // family → Promise<family>, oldest first
const faces = new Map(); // family → FontFace (registered)
const queue = []; // { family, pages: [pages that need it], start }
let running = 0;
let focusPage = 1;

const distance = (item) => Math.min(...item.pages.map((page) => Math.abs(page - focusPage)));

function pump() {
  queue.sort((a, b) => distance(a) - distance(b));
  while (running < FONT_CONCURRENCY && queue.length > 0 && distance(queue[0]) <= FONT_RADIUS) {
    const next = queue.shift();
    running++;
    next.start();
  }
}

/** The page the reader is on: fonts closest to it load first, far ones wait. */
export function setFontFocus(page) {
  focusPage = page;
  pump();
}

function evictOldFonts() {
  while (fonts.size > MAX_FONTS) {
    const oldest = fonts.keys().next().value;
    fonts.delete(oldest);
    const waiting = queue.findIndex((item) => item.family === oldest);
    if (waiting >= 0) queue.splice(waiting, 1);
    const face = faces.get(oldest);
    if (face) {
      document.fonts.delete(face);
      faces.delete(oldest);
    }
  }
}

function loadFont(family, url, forPage) {
  const cached = fonts.get(family);
  if (cached) {
    fonts.delete(family); // refresh its place
    fonts.set(family, cached);
    const waiting = queue.find((item) => item.family === family);
    if (waiting && !waiting.pages.includes(forPage)) {
      waiting.pages.push(forPage);
      pump();
    }
    return cached;
  }
  const promise = new Promise((resolve, reject) => {
    queue.push({
      family,
      pages: [forPage],
      start: () => {
        // display "block": never show the glyph codes in a fallback font while the real one loads
        new FontFace(family, `url(${url}) format("woff2")`, { display: "block" })
          .load()
          .then((face) => {
            document.fonts.add(face);
            faces.set(family, face);
            resolve(family);
          })
          .catch((error) => {
            fonts.delete(family); // asked for again next time
            reject(error);
          })
          .finally(() => {
            running--;
            pump();
          });
      },
    });
    pump();
  });
  fonts.set(family, promise);
  evictOldFonts();
  return promise;
}

/** The font a page's glyphs are drawn with. `forPage` = the page that needs it (page 1's font draws every basmala). */
export const loadPageFont = (page, forPage = page) => loadFont(pageFontFamily(page), pageFontUrl(page), forPage);

/** The surah headers: the print's ornamental frame with «سورة …» inside, one glyph per surah. */
export const loadSurahHeaderFont = (forPage) => loadFont(SURAH_HEADER_FAMILY, SURAH_HEADER_FONT_URL, forPage);

/** Warm up the fonts of the pages next to the one being read. */
export function prefetchFontsAround(page, radius = 1) {
  setFontFocus(page);
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= TOTAL_PAGES) loadPageFont(p).catch(() => {});
  }
}

// Code point of each surah's header glyph in surah-header.woff2 (surah 1 first).
const SURAH_HEADER_CODES = [
  0xfc45, 0xfc46, 0xfc47, 0xfc4a, 0xfc4b, 0xfc4e, 0xfc4f, 0xfc51, 0xfc52, 0xfc53, 0xfc55, 0xfc56, 0xfc58, 0xfc5a,
  0xfc5b, 0xfc5c, 0xfc5d, 0xfc5e, 0xfc61, 0xfc62, 0xfc64, 0xfb51, 0xfb52, 0xfb54, 0xfb55, 0xfb57, 0xfb58, 0xfb5a,
  0xfb5b, 0xfb5d, 0xfb5e, 0xfb60, 0xfb61, 0xfb63, 0xfb64, 0xfb66, 0xfb67, 0xfb69, 0xfb6a, 0xfb6c, 0xfb6d, 0xfb6f,
  0xfb70, 0xfb72, 0xfb73, 0xfb75, 0xfb76, 0xfb78, 0xfb79, 0xfb7b, 0xfb7c, 0xfb7e, 0xfb7f, 0xfb81, 0xfb82, 0xfb84,
  0xfb85, 0xfb87, 0xfb88, 0xfb8a, 0xfb8b, 0xfb8d, 0xfb8e, 0xfb90, 0xfb91, 0xfb93, 0xfb94, 0xfb96, 0xfb97, 0xfb99,
  0xfb9a, 0xfb9c, 0xfb9d, 0xfb9f, 0xfba0, 0xfba2, 0xfba3, 0xfba5, 0xfba6, 0xfba8, 0xfba9, 0xfbab, 0xfbac, 0xfbae,
  0xfbaf, 0xfbb1, 0xfbb2, 0xfbb4, 0xfbb5, 0xfbb7, 0xfbb8, 0xfbba, 0xfbbb, 0xfbbd, 0xfbbe, 0xfbc0, 0xfbc1, 0xfbd3,
  0xfbd4, 0xfbd6, 0xfbd7, 0xfbd9, 0xfbda, 0xfbdc, 0xfbdd, 0xfbdf, 0xfbe0, 0xfbe2, 0xfbe3, 0xfbe5, 0xfbe6, 0xfbe8,
  0xfbe9, 0xfbeb,
];

/** The header glyph of a surah (1–114). */
export const surahHeaderGlyph = (surah) => String.fromCodePoint(SURAH_HEADER_CODES[surah - 1] ?? SURAH_HEADER_CODES[0]);
