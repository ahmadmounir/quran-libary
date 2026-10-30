# Quran Library — the mushaf as printed, word by word, with reciters

[العربية](README.ar.md) · **English** · [Türkçe](README.tr.md)

Everything you need to put a real mushaf in a website or an app — free, and the way we run it in production:

- **The printed page.** The 1421H Madinah mushaf of the King Fahd Complex (the one Quran.com and Tarteel show), 604
  pages, 15 lines each, drawn with the Complex's own page fonts: it looks exactly like the print on any phone.
- **Word by word.** Every word is its own element with its surah, ayah and position — tap it, highlight it, mark it.
- **Eight reciters in sync.** Al-Husary, Al-Minshawi, Al-Shuraim, Al-Muaiqly, Al-Dosari, Alafasy, Abdul Basit and Ali
  Jaber: one audio file per page, the ayah being read is highlighted and the page turns by itself.
- **Fast and light on phones.** One request per page, files cached for a year, the mushaf works offline.
- **Free hosting.** Step-by-step Cloudflare R2 + Worker setup that stays inside the free tiers.
- **For AI assistants.** [`AGENTS.md`](AGENTS.md) and a [Claude Code skill](skills/quran-mushaf/SKILL.md) let an
  assistant build it into your app for you.

<p align="center">
  <img src="docs/images/example-light.png" width="300" alt="The example on a phone: Al Imran, page 50, ayah 7 highlighted">
  <img src="docs/images/example-dark.png" width="300" alt="The same page in dark mode">
</p>

## Start in two minutes

```bash
git clone https://github.com/ahmadmounir/quran-libary.git
cd quran-libary
npx serve .
```

Open `http://localhost:3000/example/` — the mushaf runs from this repository's `data/` folder. For the audio, build a
reciter once (Node 20+ and ffmpeg; about an hour, mostly downloading):

```bash
node tools/audio/build-reciter.mjs husary    # or several ids, or: all
```

It downloads the reciter's recordings from EveryAyah and rebuilds our audio files exactly (it checks and says so).

## The guide

The full explanation, from the data files to hosting, caching and cost:

- **العربية** — [docs/ar/GUIDE.md](docs/ar/GUIDE.md)
- **English** — [docs/en/GUIDE.md](docs/en/GUIDE.md)
- **Türkçe** — [docs/tr/GUIDE.md](docs/tr/GUIDE.md)

## What is inside

| Folder | What |
|---|---|
| `data/mushaf/` | 604 page files (lines and words, each word with its glyph code and Unicode text), the ayah→page index, the surahs |
| `data/fonts/` | the 604 page fonts (QCF V2, 93 MB) and the surah-header font |
| `data/audio/` | the eight reciters and, for each, where every ayah starts inside each page file |
| `tools/audio/` | build the page audio files from the ayah recordings (identical to ours, byte for byte) |
| `tools/cloudflare/` | upload to R2; the Worker that serves the files |
| `example/` | a complete app in plain JavaScript: pages, word by word, audio, offline |
| `AGENTS.md`, `skills/` | instructions for AI coding assistants |

The audio files themselves (6.2 GB for eight reciters) are not in git; the tools rebuild them.

## Using an AI assistant

Open your own project in Claude Code (or any coding agent), make this repository available to it, and ask:

> Add the mushaf to my app following quran-libary/AGENTS.md

With Claude Code you can also copy `skills/quran-mushaf/` into your project's `.claude/skills/`.

## Licence

The code and the guides written for this repository are under the [MIT licence](LICENSE). The fonts, the page data
and the recordings belong to their owners (see below).

## Thanks

This work stands on the shoulders of others, and we thank them sincerely:

- **King Fahd Glorious Qur'an Printing Complex** (Madinah) — the Madinah mushaf and its page fonts (QCF V2), used
  unmodified.
- **Tarteel — Quranic Universal Library (QUL)** — the page layout data and the word-by-word glyph codes our page files
  are built from, and the surah header font.
- **Quran.com / Quran Foundation** — the word ids and the open work that showed the way.
- **EveryAyah.com** — the ayah-by-ayah recordings our audio files are built from.
- **The reciters** — Sheikh Mahmoud Khalil Al-Husary, Sheikh Mohamed Siddiq El-Minshawi, Sheikh Saud Al-Shuraim,
  Sheikh Maher Al-Muaiqly, Sheikh Yasser Al-Dosari, Sheikh Mishary Rashid Alafasy, Sheikh Abdul Basit Abdul Samad and
  Sheikh Ali Jaber — may Allah reward them.

All rights to the fonts, the page data and the recordings belong to their owners. We share them here freely, as a
non-commercial service to everyone who serves the Book of Allah. If you build something commercial, read each
source's terms first.
