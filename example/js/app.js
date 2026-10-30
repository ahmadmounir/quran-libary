// The example app: one page at a time, word by word, with the reciters.
// Read it next to the guide (docs/*/GUIDE.md): every part is explained there.
import { AUDIO_BASE, TOTAL_PAGES } from "./config.js";
import { getChapters, getMushafIndex, prefetchPagesAround } from "./data.js";
import { prefetchFontsAround, setFontFocus } from "./fonts.js";
import { drawPage, fitLines, placeholderPage } from "./page.js";
import { buildQueue, pageBounds, pageOfAyah } from "./audio-queue.js";
import { MushafAudioPlayer } from "./audio-player.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const LAST_PAGE_KEY = "mushaf-example-page";
const SETTINGS_KEY = "mushaf-example-audio";

const index = await getMushafIndex();
const chapters = await getChapters();

// ---------------------------------------------------------------- pages
let current = 0;
let drawing = 0;

async function showPage(page) {
  page = Math.min(Math.max(page, 1), TOTAL_PAGES);
  if (page === current) return;
  current = page;
  const ticket = ++drawing;
  try { localStorage.setItem(LAST_PAGE_KEY, String(page)); } catch { /* private mode */ }
  $("page-number").value = String(page);
  const surahHere = index.pageInfo[page - 1]?.[0];
  if (surahHere) $("surah").value = String(surahHere);

  setFontFocus(page);
  view.replaceChildren(placeholderPage(page));
  try {
    const card = await drawPage(page);
    if (ticket !== drawing) return; // the reader has already moved on
    view.replaceChildren(card);
    fitLines(card);
  } catch {
    if (ticket !== drawing) return;
    const retry = Object.assign(document.createElement("button"), { className: "retry", textContent: "↻" });
    retry.onclick = () => { current = 0; showPage(page); };
    view.replaceChildren(retry);
  }
  // Ahead of time: the page files ±2 (small JSON) and the fonts ±1 (≈160 KB each).
  prefetchPagesAround(page);
  prefetchFontsAround(page);
}

// Keep the lines fitted when the window changes size.
new ResizeObserver(() => { const card = view.querySelector(".page-card:not(.skeleton)"); if (card) fitLines(card); }).observe(view);

// The mushaf reads right to left: the next page is on the LEFT.
$("next").onclick = () => showPage(current + 1);
$("prev").onclick = () => showPage(current - 1);
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === "ArrowLeft") showPage(current + 1);
  if (e.key === "ArrowRight") showPage(current - 1);
});

// Swipe: pulling the page to the right shows the next one, like turning a page of a printed mushaf.
// A swipe also ends in a click; that click must not pick a word.
let swipe = null;
let suppressClick = false;
view.addEventListener("pointerdown", (e) => { swipe = { x: e.clientX, y: e.clientY }; });
view.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    suppressClick = true;
    showPage(dx > 0 ? current + 1 : current - 1);
  }
});

for (const c of chapters) $("surah").append(new Option(`${c.id}. ${c.name_arabic}`, String(c.id)));
$("surah").onchange = (e) => showPage(chapters.find((c) => c.id === Number(e.target.value)).pages[0]);
$("page-number").onchange = (e) => showPage(Number(e.target.value) || 1);

// ---------------------------------------------------------------- word by word
// Every word carries data-location="surah:ayah:pos" and its Unicode text: one tap gives everything about it.
let picked = null;
view.addEventListener("click", (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const word = e.target.closest(".word");
  picked?.classList.remove("picked");
  if (!word) { $("word-panel").hidden = true; picked = null; return; }
  picked = word;
  word.classList.add("picked");
  const [surah, ayah, pos] = word.dataset.location.split(":").map(Number);
  const chapter = chapters.find((c) => c.id === surah);
  $("word-text").textContent = word.dataset.text;
  $("word-where").textContent = `${chapter.name_arabic} ${surah}:${ayah} — ${word.classList.contains("ayah-end") ? "رقم الآية" : `الكلمة ${pos}`}`;
  $("word-panel").hidden = false;
  $("word-play").onclick = () => { $("word-panel").hidden = true; startListening({ surah, ayah }); };
});

// ---------------------------------------------------------------- audio
const settings = (() => {
  try { return { reciter: "husary", rate: 1, repeatAyah: 1, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; }
  catch { return { reciter: "husary", rate: 1, repeatAyah: 1 }; }
})();
const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } };
const player = new MushafAudioPlayer({ rate: settings.rate, repeatAyah: settings.repeatAyah, repeatRange: 1 });

let reciters = [];
const reciterIndexes = new Map(); // id → Promise<index.json>
const reciterOf = (id) => reciters.find((r) => r.id === id) ?? reciters[0];
const indexOf = (r) => {
  if (!reciterIndexes.has(r.id)) {
    const request = fetch(`${AUDIO_BASE}/${r.path}index.json`).then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); });
    request.catch(() => reciterIndexes.delete(r.id));
    reciterIndexes.set(r.id, request);
  }
  return reciterIndexes.get(r.id);
};

try {
  const list = await (await fetch(`${AUDIO_BASE}/reciters.json`)).json();
  reciters = list.reciters;
  for (const r of reciters) $("reciter").append(new Option(r.name.ar, r.id));
  $("reciter").value = reciterOf(settings.reciter).id;
  indexOf(reciterOf(settings.reciter)).catch(() => {}); // ready before the first tap
} catch {
  $("player").classList.add("unavailable");
}

$("speed").value = String(settings.rate);
$("repeat").value = String(settings.repeatAyah);
const applyOptions = () => player.setOptions({ rate: settings.rate, repeatAyah: settings.repeatAyah, repeatRange: 1 });
$("speed").onchange = (e) => { settings.rate = Number(e.target.value); save(); applyOptions(); };
$("repeat").onchange = (e) => { settings.repeatAyah = Number(e.target.value); save(); applyOptions(); };

/** From an ayah (default: the first ayah of the page in view) to the end of the Quran. */
async function startListening(from) {
  const reciter = reciterOf(settings.reciter);
  if (!reciter) return;
  const start = from ?? pageBounds(index, current)?.from;
  const reciterIndex = await indexOf(reciter);
  const queue = buildQueue(reciterIndex, { from: start, to: { surah: 114, ayah: 6 } });
  player.play(`${AUDIO_BASE}/${reciter.path}`, queue);
}

$("reciter").onchange = async (e) => {
  settings.reciter = e.target.value;
  save();
  // Another voice while listening: the same place, the new reciter (his own files, his own timings).
  const { item, status } = player.snapshot;
  if (item && status !== "idle") startListening({ surah: item.surah, ayah: Math.max(item.ayah, 1) });
};
$("play").onclick = () => (player.snapshot.status === "idle" ? startListening() : player.toggle());
$("ayah-prev").onclick = () => player.previous();
$("ayah-next").onclick = () => player.next();
$("stop").onclick = () => player.stop();

// The ayah being read: one CSS rule on the words' data-location, nothing re-drawn.
const reading = document.createElement("style");
document.head.append(reading);

player.subscribe(({ status, item }) => {
  $("play").textContent = status === "playing" || status === "loading" ? "⏸" : "▶";
  $("player").dataset.status = status;
  reading.textContent = item && item.ayah > 0
    ? `.word[data-location^="${item.surah}:${item.ayah}:"]{background:var(--reading);box-shadow:inset 0 -2px 0 var(--reading-line)}`
    : "";
  if (!item) { $("now").textContent = ""; return; }
  const chapter = chapters.find((c) => c.id === item.surah);
  $("now").textContent = status === "error" ? "تعذّر التشغيل ↻" : `${chapter.name_arabic} · ${item.ayah === 0 ? "البسملة" : item.ayah}`;
  // Follow the recitation: turn to the page this ayah is printed on (in the print on screen).
  const page = pageOfAyah(index, item);
  if (page && page !== current && status !== "idle") showPage(page);
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: $("now").textContent, artist: reciterOf(settings.reciter)?.name.ar ?? "" });
  }
});
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => player.toggle());
  navigator.mediaSession.setActionHandler("pause", () => player.toggle());
  navigator.mediaSession.setActionHandler("previoustrack", () => player.previous());
  navigator.mediaSession.setActionHandler("nexttrack", () => player.next());
}

// ---------------------------------------------------------------- start
const saved = (() => { try { return Number(localStorage.getItem(LAST_PAGE_KEY)); } catch { return 0; } })();
showPage(Number(new URLSearchParams(location.search).get("page")) || saved || 1);

// Keep the page files and fonts on the phone (they never change): see sw.js.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
