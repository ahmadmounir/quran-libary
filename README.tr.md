# Quran Library — baskıdaki haliyle Mushaf, kelime kelime, kârilerle

[العربية](README.ar.md) · [English](README.md) · **Türkçe**

Gerçek bir Mushafı bir web sitesine ya da uygulamaya koymak için gereken her şey — ücretsiz ve bizim canlı ortamda
çalıştırdığımız şekilde:

- **Basılı sayfa.** Kral Fahd Kompleksinin 1421H Medine Mushafı (Quran.com ve Tarteel'in gösterdiği Mushaf): 604
  sayfa, her sayfada 15 satır. Kompleksin kendi sayfa fontlarıyla çizilir; her telefonda tam baskıdaki gibi görünür.
- **Kelime kelime.** Her kelime; suresi, ayeti ve konumuyla ayrı bir öğedir. Ona dokunun, vurgulayın, işaretleyin.
- **Eş zamanlı sekiz kâri.** el-Husari, el-Minşavi, eş-Şureym, el-Muaykıli, ed-Devseri, el-Afasi, Abdülbasit ve Ali
  Cabir: sayfa başına tek ses dosyası. Okunan ayet vurgulanır ve sayfa kendiliğinden çevrilir.
- **Telefonlarda hızlı ve hafif.** Sayfa başına tek istek, bir yıl önbellekte kalan dosyalar; Mushaf çevrimdışı da
  çalışır.
- **Ücretsiz barındırma.** Ücretsiz katmanların içinde kalan, adım adım Cloudflare R2 + Worker kurulumu.
- **Yapay zekâ asistanları için.** [`AGENTS.md`](AGENTS.md) ve bir [Claude Code becerisi (skill)](skills/quran-mushaf/SKILL.md)
  sayesinde bir asistan bunu sizin yerinize uygulamanıza ekleyebilir.

<p align="center">
  <img src="docs/images/example-light.png" width="300" alt="Telefonda örnek: Âl-i İmrân suresi, 50. sayfa, 7. ayet vurgulanmış">
  <img src="docs/images/example-dark.png" width="300" alt="Aynı sayfa karanlık modda">
</p>

## İki dakikada başlayın

```bash
git clone https://github.com/ahmadmounir/quran-libary.git
cd quran-libary
npx serve .
```

`http://localhost:3000/example/` adresini açın: Mushaf bu deponun `data/` klasöründen çalışır. Ses için bir kâriyi
bir kez oluşturun (Node 20+ ve ffmpeg gerekir; yaklaşık bir saat sürer, çoğu indirmedir):

```bash
node tools/audio/build-reciter.mjs husary
```

## Rehber

Veri dosyalarından barındırmaya, önbelleğe ve maliyete kadar ayrıntılı açıklama:

- **العربية** — [docs/ar/GUIDE.md](docs/ar/GUIDE.md)
- **English** — [docs/en/GUIDE.md](docs/en/GUIDE.md)
- **Türkçe** — [docs/tr/GUIDE.md](docs/tr/GUIDE.md)

## Depoda neler var

| Klasör | İçerik |
|---|---|
| `data/mushaf/` | 604 sayfa dosyası (satırlar ve kelimeler; her kelime glif kodu ve Unicode metniyle), ayet→sayfa indeksi, sureler |
| `data/fonts/` | 604 sayfa fontu (QCF V2, 93 MB) ve sure başlığı fontu |
| `data/audio/` | sekiz kâri ve her biri için, her ayetin her sayfa dosyasının içinde nerede başladığı |
| `tools/audio/` | sayfa ses dosyalarını ayet kayıtlarından oluşturur (bizimkilerle bayt bayt aynı) |
| `tools/cloudflare/` | R2'ye yükleme; dosyaları sunan Worker |
| `example/` | düz JavaScript ile yazılmış eksiksiz bir uygulama: sayfalar, kelime kelime, ses, çevrimdışı |
| `AGENTS.md`, `skills/` | yapay zekâ kodlama asistanları için talimatlar |

Ses dosyalarının kendisi (sekiz kâri için 6.2 GB) git'te yok; araçlar onları yeniden oluşturur.

## Yapay zekâ asistanı kullanmak

Kendi projenizi Claude Code'da (ya da herhangi bir kodlama ajanında) açın, bu depoyu ona erişilebilir kılın ve şunu
isteyin:

> Mushafı quran-libary/AGENTS.md'yi izleyerek uygulamama ekle

Claude Code ile `skills/quran-mushaf/` klasörünü projenizin `.claude/skills/` klasörüne de kopyalayabilirsiniz.

## Lisans

Bu depo için yazılmış kod ve rehberler [MIT lisansı](LICENSE) altındadır. Fontlar, sayfa verileri ve kayıtlar
sahiplerine aittir (aşağıya bakın).

## Teşekkür

Bu çalışma başkalarının omuzlarında yükseliyor; onlara içtenlikle teşekkür ediyoruz:

- **Kral Fahd Kur'an-ı Kerim Basım Kompleksi** (Medine) — Medine Mushafı ve hiç değiştirilmeden kullanılan sayfa
  fontları (QCF V2).
- **Tarteel — Quranic Universal Library (QUL)** — sayfa dosyalarımızın üzerine kurulduğu sayfa düzeni verileri ve
  kelime kelime glif kodları, ayrıca sure başlığı fontu.
- **Quran.com / Quran Foundation** — kelime kimlikleri ve yolu gösteren açık çalışmaları.
- **EveryAyah.com** — ses dosyalarımızın üzerine kurulduğu ayet ayet kayıtlar.
- **Kâriler** — Şeyh Mahmud Halil el-Husari, Şeyh Muhammed Sıddık el-Minşavi, Şeyh Suud eş-Şureym, Şeyh Mahir
  el-Muaykıli, Şeyh Yasir ed-Devseri, Şeyh Mişari Raşid el-Afasi, Şeyh Abdülbasit Abdüssamed ve Şeyh Ali Cabir —
  Allah onlardan razı olsun.

Fontların, sayfa verilerinin ve kayıtların bütün hakları sahiplerine aittir. Bunları burada, Allah'ın Kitabına hizmet
eden herkese ticari olmayan bir hizmet olarak ücretsiz paylaşıyoruz. Ticari bir şey geliştiriyorsanız önce her
kaynağın kullanım koşullarını okuyun.
