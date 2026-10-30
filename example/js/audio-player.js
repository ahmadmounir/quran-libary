// Plays a play list (audio-queue.js) from the one-file-per-page recordings with a single <audio> element.
//
// Why it stays cheap: an ayah is a stretch of its page's file, so moving inside a page or repeating an ayah is a seek
// (no request). Each page file is requested once; the next page is fetched in the background a few seconds after the
// current one starts, so turning the page starts at once and never slows the first sound.

const KEPT_PAGES = 4; // page files kept in memory (about 1–2 MB each)
const PREFETCH_AFTER_MS = 3000;
const RETRY_AFTER_MS = 1500;
const times = (n) => (n <= 0 ? Infinity : n); // 0 = until stopped

/** @typedef {"idle"|"loading"|"playing"|"paused"|"ended"|"error"} PlayerStatus */

export class MushafAudioPlayer {
  /** @param {{ rate: number, repeatAyah: number, repeatRange: number }} options  repeat 0 = until stopped */
  constructor(options) {
    this.options = options;
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.queue = [];
    this.position = 0;
    this.ayahRound = 0;
    this.rangeRound = 0;
    this.baseUrl = "";
    this.loadedUrl = null;
    this.pageStartMs = 0;
    this.prefetchedFrom = null;
    this.retriedUrl = null;
    /** @type {PlayerStatus} */
    this.status = "idle";
    this.timer = 0;
    this.listeners = new Set();
    this.pages = new Map(); // page URL → object URL of the downloaded file, oldest first
    this.fetching = new Set();

    this.audio.addEventListener("timeupdate", this.tick);
    this.audio.addEventListener("playing", () => {
      this.retriedUrl = null;
      this.setStatus("playing");
    });
    this.audio.addEventListener("waiting", () => this.setStatus("loading"));
    this.audio.addEventListener("pause", () => {
      if (this.status === "playing" || this.status === "loading") this.setStatus("paused");
    });
    this.audio.addEventListener("ended", () => this.advance(true));
    this.audio.addEventListener("error", this.onLoadError);
  }

  /** Called with { status, item, position, total } whenever something changes. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get snapshot() {
    return { status: this.status, item: this.queue[this.position] ?? null, position: this.position, total: this.queue.length };
  }

  setOptions(options) {
    this.options = options;
    this.audio.playbackRate = options.rate;
  }

  /** @param {string} baseUrl  where this reciter's page files are, ending in "/" (…/audio/husary/) */
  play(baseUrl, queue, startAt = 0) {
    this.baseUrl = baseUrl;
    this.queue = queue;
    this.rangeRound = 0;
    this.playItem(Math.min(Math.max(startAt, 0), queue.length - 1));
  }

  toggle() {
    if (this.status === "error") this.retry();
    else if (this.status === "ended") this.playItem(0);
    else if (this.audio.paused) this.resume();
    else this.audio.pause();
  }

  next() {
    if (this.position + 1 < this.queue.length) this.playItem(this.position + 1);
  }

  /** Back to the start of this ayah, or to the previous one when this one has only just begun. */
  previous() {
    const item = this.queue[this.position];
    if (!item) return;
    const playedMs = this.audio.currentTime * 1000 - item.startMs;
    this.playItem(playedMs > 1500 || this.position === 0 ? this.position : this.position - 1);
  }

  retry() {
    this.loadedUrl = null;
    this.playItem(this.position);
  }

  stop() {
    clearTimeout(this.timer);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.loadedUrl = null;
    this.queue = [];
    this.position = 0;
    this.setStatus("idle");
  }

  pageUrl(page) {
    return `${this.baseUrl}p${String(page).padStart(3, "0")}.mp3`;
  }

  // A page file that fails to load is asked for once more (phones drop connections) before the error shows.
  onLoadError = () => {
    if (!this.audio.getAttribute("src")) return; // stop() emptied it
    if (this.retriedUrl !== this.loadedUrl) {
      this.retriedUrl = this.loadedUrl;
      this.setStatus("loading");
      setTimeout(() => {
        if (this.status === "loading") this.retry();
      }, RETRY_AFTER_MS);
      return;
    }
    this.setStatus("error");
  };

  resume() {
    this.audio.play().catch((error) => {
      if (error?.name === "AbortError") return; // a newer play() or a new source replaced this one
      // NotAllowedError: the browser wants a tap first.
      this.setStatus(error?.name === "NotAllowedError" ? "paused" : "error");
    });
  }

  playItem(index) {
    const item = this.queue[index];
    if (!item) return;
    this.position = index;
    this.ayahRound = 0;
    const url = this.pageUrl(item.page);
    if (this.loadedUrl !== url) {
      this.loadedUrl = url;
      this.prefetchedFrom = null;
      // Already downloaded in the background → play it from memory; otherwise stream it from its address.
      this.audio.src = this.pages.get(url) ?? url;
      this.audio.playbackRate = this.options.rate;
      this.setStatus("loading");
    }
    this.pageStartMs = item.startMs;
    this.seek(item.startMs);
    this.resume();
    this.publish();
  }

  seek(ms) {
    const go = () => {
      this.audio.currentTime = ms / 1000;
    };
    if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) go();
    else this.audio.addEventListener("loadedmetadata", go, { once: true });
  }

  // Runs on every timeupdate and, between them, on a timer aimed at the end of the current ayah, so a repeat or the
  // end of the selection is exact even with the screen off (where animation frames stop).
  tick = () => {
    clearTimeout(this.timer);
    const item = this.queue[this.position];
    if (!item || this.audio.paused) return;
    const ms = this.audio.currentTime * 1000;
    if (ms >= item.endMs) {
      this.advance(false);
      return;
    }
    if (ms - this.pageStartMs >= PREFETCH_AFTER_MS) this.prefetchNextPage();
    const untilEnd = (item.endMs - ms) / (this.audio.playbackRate || 1);
    this.timer = setTimeout(this.tick, Math.min(Math.max(untilEnd, 0), 250));
  };

  advance(ended) {
    const item = this.queue[this.position];
    if (!item) return;
    if (item.ayah > 0 && this.ayahRound + 1 < times(this.options.repeatAyah)) {
      this.ayahRound += 1;
      this.seek(item.startMs);
      if (ended) this.resume();
      return;
    }
    const next = this.queue[this.position + 1];
    if (next) {
      // The next ayah follows on in the same file: let it play on, only the highlight moves.
      if (!ended && next.page === item.page && next.startMs === item.endMs) {
        this.position += 1;
        this.ayahRound = 0;
        this.publish();
        this.tick();
      } else {
        this.playItem(this.position + 1);
      }
      return;
    }
    if (this.rangeRound + 1 < times(this.options.repeatRange)) {
      this.rangeRound += 1;
      this.playItem(0);
      return;
    }
    clearTimeout(this.timer);
    this.audio.pause();
    this.setStatus("ended");
  }

  // Fetches the next page this list needs (one request), so turning the page starts at once.
  prefetchNextPage() {
    const current = this.queue[this.position];
    if (!current || this.prefetchedFrom === this.loadedUrl) return;
    this.prefetchedFrom = this.loadedUrl;
    const next = this.queue.slice(this.position + 1).find((x) => x.page !== current.page);
    if (!next) return;
    const url = this.pageUrl(next.page);
    if (this.pages.has(url) || this.fetching.has(url)) return;
    this.fetching.add(url);
    fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob) return;
        this.pages.set(url, URL.createObjectURL(blob));
        for (const [oldUrl, objectUrl] of this.pages) {
          if (this.pages.size <= KEPT_PAGES) break;
          if (oldUrl === this.loadedUrl) continue;
          URL.revokeObjectURL(objectUrl);
          this.pages.delete(oldUrl);
        }
      })
      .catch(() => {}) // not fatal: the page then streams from its address when it is reached
      .finally(() => this.fetching.delete(url));
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.publish();
  }

  publish() {
    const snapshot = this.snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
