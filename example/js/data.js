// The mushaf's data files: the index (page of every ayah), the surahs, and one JSON file per page.
// Each page file is fetched once and kept; the pages next to the one being read are fetched ahead of time.
import { FILES_BASE, TOTAL_PAGES } from "./config.js";

const getJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};

let indexRequest = null;
let chaptersRequest = null;

/** { pageInfo: [[firstSurah, juz, hizb] per page], ayahPages: { "<surah>": [page of each ayah] } } */
export const getMushafIndex = () => (indexRequest ??= getJson(`${FILES_BASE}/mushaf/mushaf_index.json`));

/** [{ id, name_arabic, name_simple, verses_count, bismillah_pre, pages: [first, last] }, …] */
export const getChapters = () => (chaptersRequest ??= getJson(`${FILES_BASE}/mushaf/chapters.json`));

const MAX_PAGES = 16;
const pages = new Map(); // page → Promise<page data>, oldest first

/** One page: { page, script, lines: [{ line, type: "words"|"header"|"basmala", … }] } */
export function getPage(page) {
  let request = pages.get(page);
  if (request) {
    pages.delete(page); // refresh its place: a page in use is never the oldest
  } else {
    request = getJson(`${FILES_BASE}/mushaf/pages/page-${String(page).padStart(3, "0")}.json`);
    request.catch(() => pages.delete(page)); // a failed page is asked for again next time
  }
  pages.set(page, request);
  while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value);
  return request;
}

/** Fetch the page files around the reader (one small JSON each), so turning the page shows it at once. */
export function prefetchPagesAround(page, radius = 2) {
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= TOTAL_PAGES && p !== page) getPage(p).catch(() => {});
  }
}
