// Turns "what to listen to" (a range of ayat) into a play list for the one-file-per-page recordings.
//
// A reciter's index.json says, for every page file, where each ayah starts inside it:
//   { v, rate, kbps, pages: { "1": { ms, bytes, ayat: [[surah, ayah, startMs], …] }, … } }
// Ayah 0 is the basmala read before ayah 1 of a surah (never before surahs 1 and 9).

/** @typedef {{ surah: number, ayah: number }} AyahRef */
/** @typedef {{ from: AyahRef, to: AyahRef }} AudioRange  inclusive, in reading order */
/** @typedef {{ page: number, surah: number, ayah: number, startMs: number, endMs: number }} AudioItem
 *  page = the recording's page FILE; startMs / endMs = where this ayah is inside that file */

const compare = (a, b) => a.surah - b.surah || a.ayah - b.ayah;

/** The mushaf page an ayah is printed on (the basmala, ayah 0, goes with ayah 1). */
export const pageOfAyah = (mushafIndex, ref) => {
  const pages = mushafIndex.ayahPages[String(ref.surah)];
  return pages?.[Math.max(ref.ayah, 1) - 1] ?? null;
};

const fileOfAyah = new WeakMap();

/**
 * The page FILE that holds an ayah, taken from the reciter's own index — never from the mushaf's pages. Files cut for
 * one print still play right while another print is on screen (prints place some ayat on a neighbouring page).
 */
const audioFileOf = (index, ref) => {
  let files = fileOfAyah.get(index);
  if (!files) {
    files = new Map();
    for (const [page, info] of Object.entries(index.pages)) {
      for (const [surah, ayah] of info.ayat) files.set(`${surah}:${ayah}`, Number(page));
    }
    fileOfAyah.set(index, files);
  }
  return files.get(`${ref.surah}:${ref.ayah}`) ?? null;
};

/** The ayat of a range as a play list, file by file, with the basmala before ayah 1 where the reciter reads one. */
export const buildQueue = (index, range) => {
  const firstPage = audioFileOf(index, range.from);
  const lastPage = audioFileOf(index, range.to);
  if (firstPage === null || lastPage === null || compare(range.from, range.to) > 0) return [];

  const items = [];
  for (let page = firstPage; page <= lastPage; page++) {
    const info = index.pages[String(page)];
    if (!info) continue;
    info.ayat.forEach(([surah, ayah, startMs], i) => {
      const ref = { surah, ayah: Math.max(ayah, 1) };
      if (compare(ref, range.from) < 0 || compare(ref, range.to) > 0) return;
      const endMs = info.ayat[i + 1]?.[2] ?? info.ms;
      items.push({ page, surah, ayah, startMs, endMs });
    });
  }
  return items;
};

/** First and last ayah printed on a page. */
export const pageBounds = (mushafIndex, page) => {
  let from = null, to = null;
  for (let surah = 1; surah <= 114; surah++) {
    (mushafIndex.ayahPages[String(surah)] ?? []).forEach((p, i) => {
      if (p !== page) return;
      const ref = { surah, ayah: i + 1 };
      if (!from) from = ref;
      to = ref;
    });
  }
  return from && to ? { from, to } : null;
};
