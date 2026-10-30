// Where the files are.
// - Locally (this repository served as it is): the repository's own data/ folder.
// - Hosted: your Worker or domain, e.g. "https://quran-files.<you>.workers.dev/v1" (see the guide, "Hosting").
// For a quick test, the page address can override both: index.html?files=https://…/v1&audio=https://…/v1/audio
const params = new URLSearchParams(location.search);
const trim = (url) => url.replace(/\/+$/, "");

export const FILES_BASE = trim(params.get("files") || "../data");
export const AUDIO_BASE = trim(params.get("audio") || `${FILES_BASE}/audio`);

export const TOTAL_PAGES = 604;
