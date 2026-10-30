// Draws one mushaf page, word by word, exactly as printed.
//
// A page file has 15 lines (fewer on pages 1–2). A line is one of:
//   { type: "words", words: [{ id, surah, ayah, pos, text, end, g }], centered? }  → one <span> per word
//   { type: "header", surah }                                                      → the surah's ornamental frame
//   { type: "basmala", g, fontPage }                                               → drawn with page 1's font
// Each word is drawn from its glyph code `g` in its page's font; `text` is the same word in Unicode (for search,
// copying, screen readers). An entry with end: 1 is the ayah-number glyph.
import { getChapters, getMushafIndex, getPage } from "./data.js";
import {
  loadPageFont,
  loadSurahHeaderFont,
  pageFontFamily,
  SURAH_HEADER_FAMILY,
  surahHeaderGlyph,
} from "./fonts.js";

const JUZ = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر",
  "التاسع عشر", "العشرون", "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون", "الرابع والعشرون",
  "الخامس والعشرون", "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون", "التاسع والعشرون", "الثلاثون"];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** An empty page of the same size, shown while the page's file and font arrive. */
export function placeholderPage(page) {
  const card = el("div", "page-card skeleton");
  card.dir = "rtl";
  card.dataset.page = String(page);
  const body = el("div", "page-body");
  for (let i = 0; i < 15; i++) body.append(el("div", "line-ph"));
  card.append(body, el("div", "folio", String(page)));
  return card;
}

/** Builds the page (after its fonts are loaded, so glyph codes never show in a fallback font). */
export async function drawPage(page) {
  const [data, chapters, index] = await Promise.all([getPage(page), getChapters(), getMushafIndex()]);

  const needed = [loadPageFont(page)];
  for (const line of data.lines) {
    if (line.type === "basmala") needed.push(loadPageFont(line.fontPage, page));
    if (line.type === "header") needed.push(loadSurahHeaderFont(page));
  }
  await Promise.all(needed);

  const card = el("div", "page-card");
  card.dir = "rtl";
  card.dataset.page = String(page);

  // Running head, like a printed mushaf: the surah on one side, the juz on the other.
  const firstWords = data.lines.find((l) => l.type === "words")?.words[0];
  const firstHeader = data.lines.find((l) => l.type === "header");
  const surah = chapters.find((c) => c.id === (firstHeader?.surah ?? firstWords?.surah));
  const head = el("div", "page-head");
  head.append(el("span", "", surah ? `سورة ${surah.name_arabic}` : ""), el("span", "", `الجزء ${JUZ[(index.pageInfo[page - 1]?.[1] ?? 1) - 1]}`));

  const body = el("div", page <= 2 ? "page-body opening" : "page-body");
  body.style.fontFamily = pageFontFamily(page);

  for (const line of data.lines) {
    if (line.type === "header") {
      const box = el("div", "surah-header");
      const frame = el("span", "surah-frame", surahHeaderGlyph(line.surah));
      frame.style.fontFamily = SURAH_HEADER_FAMILY;
      const chapter = chapters.find((c) => c.id === line.surah);
      if (chapter) frame.setAttribute("aria-label", `سورة ${chapter.name_arabic}`);
      box.append(frame);
      body.append(box);
    } else if (line.type === "basmala") {
      const box = el("div", "basmala");
      box.style.fontFamily = pageFontFamily(line.fontPage);
      box.setAttribute("aria-label", "بسم الله الرحمن الرحيم");
      for (const glyph of line.g) box.append(el("span", "", glyph));
      body.append(box);
    } else {
      const row = el("div", line.centered ? "line centered" : "line");
      for (const word of line.words) {
        const span = el("span", word.end ? "word ayah-end" : "word", word.g);
        // Everything about the word is on the element: tapping, highlighting an ayah, audio sync all use it.
        span.dataset.location = `${word.surah}:${word.ayah}:${word.pos}`;
        span.dataset.wordId = String(word.id);
        span.dataset.text = word.text;
        row.append(span);
      }
      body.append(row);
    }
  }

  card.append(head, body, el("div", "folio", String(page)));
  return card;
}

/**
 * Lines are drawn edge to edge (space-between), the way the print fills them. The rare line whose glyphs are wider
 * than the page at this size is drawn a little smaller. Call it after the page is in the document (it measures).
 */
export function fitLines(card) {
  for (const line of card.querySelectorAll(".line")) {
    line.style.removeProperty("font-size");
    const available = line.getBoundingClientRect().width;
    if (!available) continue;
    const gap = parseFloat(getComputedStyle(line).columnGap) || 0; // centered lines keep a gap between words
    let natural = gap * Math.max(line.children.length - 1, 0);
    for (const word of line.children) natural += word.getBoundingClientRect().width;
    const ratio = natural / available;
    if (ratio > 1) line.style.fontSize = `calc(${getComputedStyle(line).fontSize} * ${(0.99 / ratio).toFixed(3)})`;
  }
}
