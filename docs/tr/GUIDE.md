# Kur'an Mushafı uygulaması geliştirmek — A'dan Z'ye

[العربية](../ar/GUIDE.md) · [English](../en/GUIDE.md) · **Türkçe**

Bu rehber, basılı Medine Mushafının (Quran.com ve Tarteel'in gösterdiği Mushaf) birebir aynısı görünen bir Mushafın
nasıl yapılacağını anlatır: her kelime ayrı bir öğe, metinle eş zamanlı sekiz kâri, telefonlarda çevrimdışı okuma ve
Cloudflare'de ücretsiz barındırma. Buradaki her şey, bizim kurduğumuz ve canlı ortamda çalıştırdığımız sistemdir.
Veriler bu depoda. [`example/`](../../example) klasöründeki örnek ise düz JavaScript ile yazılmış, çalışan bir
uygulamadır ve bir saatte okunabilir.

Bir yapay zekâ kodlama asistanıyla çalışıyorsanız ona [`AGENTS.md`](../../AGENTS.md) dosyasını (ya da
[`skills/quran-mushaf/`](../../skills/quran-mushaf/SKILL.md) içindeki beceriyi) verin: bütün sistemi ona anlatır.

## İçindekiler

1. [Bu depoda neler var](#1-bu-depoda-neler-var)
2. [Temel fikirler, iki dakikada](#2-temel-fikirler-iki-dakikada)
3. [Örneği çalıştırın](#3-örneği-çalıştırın)
4. [Veri dosyaları](#4-veri-dosyaları)
5. [Sayfayı kelime kelime çizmek](#5-sayfayı-kelime-kelime-çizmek)
6. [Kelimelerle çalışmak](#6-kelimelerle-çalışmak)
7. [Kârilerin sesi](#7-kârilerin-sesi)
8. [Cloudflare üzerinde barındırma, adım adım](#8-cloudflare-üzerinde-barındırma-adım-adım)
9. [Telefonlarda önbellek ve ücretsiz kalmak](#9-telefonlarda-önbellek-ve-ücretsiz-kalmak)
10. [Kendi uygulamanıza eklemek](#10-kendi-uygulamanıza-eklemek)
11. [Sık karşılaşılan sorunlar](#11-sık-karşılaşılan-sorunlar)
12. [Teşekkür](#12-teşekkür)

---

## 1. Bu depoda neler var

```
data/
  mushaf/
    mushaf_index.json      her ayetin sayfası, her sayfanın cüzü / hizbi
    chapters.json          114 sure (adları, ayet sayısı, ilk ve son sayfa)
    pages/page-001.json …  604 sayfa: satırlar ve her satırın kelimeleri
  fonts/
    pages/p1.woff2 …       604 sayfa fontu (her sayfaya bir tane, her biri ~160 KB, toplam 93 MB)
    surah-header.woff2     süslü sure çerçevesi, her sure için bir glif
  audio/
    reciters.json          kâriler (id, ar / en / tr adı, klasör)
    <id>/index.json        her kâri için: her ayetin, her sayfa dosyasının içinde nerede başladığı
tools/
  audio/                   kârilerin sayfa dosyalarını (MP3) ayet kayıtlarından oluşturur
  cloudflare/              R2'ye yükleme ve dosyaları sunan Worker
example/                   eksiksiz bir uygulama: sayfalar, kelime kelime, ses, çevrimdışı
docs/                      bu rehber: Arapça, İngilizce ve Türkçe
AGENTS.md                  bir yapay zekâ asistanının bunu sizin için kurması için gereken her şey
skills/quran-mushaf/       aynısı, bir Claude Code becerisi (skill) olarak
```

Ses dosyalarının kendisi (sekiz kâri için 6.2 GB) depoda yok: araçlar onları orijinal ayet kayıtlarından, bayt bayt
aynı olacak şekilde yeniden oluşturur (bkz. [7.2](#72-ses-dosyalarını-oluşturmak)).

## 2. Temel fikirler, iki dakikada

**Sayfa, baskının ta kendisidir.** Mushaf, Kral Fahd Kompleksinin 1421H Medine baskısıdır: 604 sayfa, her sayfada 15
satır. Verilerimizdeki her satır o baskının bir satırıdır; aynı kelimeler, aynı sırayla.

**Her sayfaya bir font.** Kompleks her sayfa için ayrı bir font hazırladı (adı QCF V2). Bir sayfanın fontunda, o
sayfadaki her kelime tek bir glif (bazen iki) olarak durur. Yani Arapça metni "dizmezsiniz": her kelimenin glifini
yerine koyarsınız ve sayfa; doğru bitişik yazımlar, işaretler ve aralıklarla tam baskıdaki gibi görünür. Üstelik her
kelime ekranda ayrı bir öğe olur. Dokunma, vurgulama ve sesle senkron kendiliğinden gelir.

**Her sayfaya bir ses dosyası.** Her kâri için bir sayfanın ayetleri tek bir MP3'te birleştirilir. Yanında küçük bir
indeks bulunur: her ayetin dosyanın neresinde başladığını söyler. Bir sayfayı dinlemek tek bir istek demektir.
Sonraki ayete geçmek ya da bir ayeti tekrarlamak yeni bir istek değil, dosyanın içinde bir atlamadır.

**Cloudflare'de statik dosyalar.** Her şey — sayfa verileri, fontlar, ses — statik bir dosyadır. Hepsi Cloudflare
R2'de (ücretsiz depolama, ücretsiz indirme trafiği), küçük bir Worker'ın (ücretsiz, salt okunur bir adres) arkasında
durur. Dosyalar yayımlandıktan sonra hiç değişmez; bu yüzden telefonlar ve Cloudflare onları bir yıl boyunca saklar.

## 3. Örneği çalıştırın

Herhangi bir statik web sunucusu yeterli. Deponun klasöründe:

```bash
npx serve .
```

ya da `python -m http.server 8000`. `http://localhost:3000/example/` adresini (veya `:8000/example/`) açın. Mushaf,
deponun kendi `data/` klasöründen hemen çalışır. Sayfa çevirmek için kaydırın (ya da ok tuşlarını kullanın); bir
kelimeyi görmek için ona dokunun.

**Ses** için git'te bulunmayan MP3 dosyaları gerekir. Ya bir kâriyi kendiniz oluşturun (yaklaşık bir saat, bkz.
[7.2](#72-ses-dosyalarını-oluşturmak)):

```bash
node tools/audio/build-reciter.mjs husary
```

ya da örneği zaten barındırdığınız seslere yönlendirin: `example/index.html?audio=https://your-worker.workers.dev/v1/audio`.

## 4. Veri dosyaları

### 4.1 `mushaf/mushaf_index.json`

```json
{
  "pageInfo":  [[1, 1, 1], [2, 1, 1], …],          // sayfa başına (indeks = sayfa − 1): [ilk sure, cüz, hizb]
  "ayahPages": { "1": [1, 1, 1, 1, 1, 1, 1], "2": [2, 2, 2, 2, 2, 3, …], … }   // sure → her ayetin sayfası
}
```

`ayahPages["2"][4]`, 2:5 ayetinin sayfasıdır. Her sayfa bir ayetin ilk kelimesiyle başlar: bu baskıda hiçbir ayet
iki sayfaya bölünmez.

### 4.2 `mushaf/chapters.json`

114 kayıt: `id`, `name_arabic`, `name_simple`, `verses_count`, `bismillah_pre` (surenin önünde besmele varsa
true: 1. ve 9. sureler dışında hepsi), `pages: [first, last]` (ilk ve son sayfa), `revelation_place` (nüzul yeri).

### 4.3 `mushaf/pages/page-NNN.json`

```json
{
  "page": 3,
  "script": "qcf-v2",
  "lines": [
    { "line": 1, "type": "words", "words": [
      { "id": 6905, "surah": 2, "ayah": 6, "pos": 1, "text": "إِنَّ", "end": 0, "g": "ﱁ" }, …
    ]},
    …
  ]
}
```

Diğer satır türleri (örneğin 604. sayfada):

```json
{ "line": 1, "type": "header", "surah": 112 }
{ "line": 2, "type": "basmala", "g": "ﱁﱂﱃﱄ", "fontPage": 1 }
{ "line": 4, "type": "words", "centered": true, "words": [ … ] }
```

- `type: "words"` — basılı bir satır. Her kelimede şunlar bulunur:
  - `id`: kelimenin genel kimliği (Quran.com'un kullandığı kimliklerin aynısı);
  - `surah`, `ayah`, `pos`: kelimenin yeri (pos = kelimenin kendi ayetindeki sırası);
  - `text`: kelimenin Unicode yazımı (Osmanî hat) — arama, kopyalama ve ekran okuyucular için;
  - `g`: çizilecek glif kod(lar)ı, **bu sayfanın** fontunda;
  - `end: 1`, bir ayetin sonundaki ayet numarası glifini belirtir.
- `centered: true` — baskının doldurmak yerine ortaladığı kısa bir satır (sure sonları, son sayfalar).
- `type: "header"` — bir surenin süslü çerçevesi (`fonts/surah-header.woff2` ile çizilir).
- `type: "basmala"` — sureden önceki besmele; **`fontPage` sayfasının** fontundaki (Fâtiha'nın fontu) gliflerle
  çizilir.

Sayfa 1 ve 2'de satırlar daha az ve daha kısadır; bunları baskıdaki gibi ortalanmış ve biraz daha büyük çizin.

### 4.4 Fontlar

- `fonts/pages/p{N}.woff2` — N. sayfanın fontu. Dilediğiniz bir aile adıyla kaydedin (biz `qcf-v2-pN` kullanıyoruz)
  ve sayfanın `g` kodlarını bu fontla çizin. **Bu dosyaları asla değiştirmeyin.**
- `fonts/surah-header.woff2` — her sure için bir glif: içinde «سورة …» yazan çerçeve. Her surenin glifinin kod
  noktası, [`example/js/fonts.js`](../../example/js/fonts.js) içindeki `SURAH_HEADER_CODES` tablosundadır
  (1. sure = U+FC45).

### 4.5 Ses

`audio/reciters.json`:

```json
{ "v": 1, "reciters": [
  { "id": "husary", "name": { "ar": "محمود خليل الحصري", "en": "Mahmoud Khalil Al-Husary", "tr": "Mahmud Halil el-Husari" },
    "style": "murattal", "path": "husary/" }, …
]}
```

`audio/<id>/index.json` (oluşturulduktan ya da barındırıldıktan sonra yanında `p001.mp3 … p604.mp3` de bulunur):

```json
{ "v": 1, "rate": 22050, "kbps": 64,
  "pages": { "1": { "ms": 42516, "bytes": 340636, "ayat": [[1, 1, 0], [1, 2, 4739], [1, 3, 9989], …] }, … } }
```

Her sayfa dosyası için: ms cinsinden uzunluğu, boyutu ve içindeki her ayet için `[surah, ayah, startMs]`. **Ayet 0,
kârinin bir surenin 1. ayetinden önce okuduğu besmeledir** (1. ve 9. surelerden önce asla). Bir ayet, bir sonrakinin
başladığı yerde biter (sonuncusu `ms` noktasında biter).

Sekiz kâri: Mahmud Halil el-Husari, Muhammed Sıddık el-Minşavi, Suud eş-Şureym, Mahir el-Muaykıli, Yasir
ed-Devseri, Mişari Raşid el-Afasi, Abdülbasit Abdüssamed, Ali Cabir. Hepsi tertil (murattal) okuyuştur.

## 5. Sayfayı kelime kelime çizmek

Kod: [`example/js/page.js`](../../example/js/page.js) ve [`example/style.css`](../../example/style.css).

### 5.1 Yapı

```html
<div class="page-card" dir="rtl">
  <div class="page-head"><span>سورة البقرة</span><span>الجزء الأول</span></div>
  <div class="page-body" style="font-family: qcf-v2-p3">
    <div class="line">
      <span class="word" data-location="2:6:1" data-word-id="6905">ﱁ</span> …
    </div>
    …
  </div>
  <div class="folio">3</div>
</div>
```

Her satır için bir `div`, her kelime için bir `span`. Span'ın metni, kelimenin `g` değeridir.

### 5.2 Boyutlar: her şey sayfanın genişliğini izler

Sayfa, basılı bir sayfanın oranlarına (3:5) sahip bir karttır. Bu kart bir CSS **size container**'dır (boyut
kapsayıcısı). Bu yüzden içindeki her boyut `cqw` cinsindendir (kartın genişliğinin %1'i) ve sayfa telefonda, tablette
ya da dizüstü bilgisayarda aynı görünür:

```css
.page-card {
  aspect-ratio: 3 / 5;
  width: min(100%, 450px, calc((100dvh - 9.5rem) * 3 / 5));  /* ekranın hem genişliğine HEM yüksekliğine sığar */
  container-type: inline-size;
  --qcf-room: calc(164.5cqw - 3.5rem);                        /* 15 satırın paylaştığı yükseklik */
  --qcf-size: min(calc(100cqw / 16), calc(var(--qcf-room) / 27));
}
```

Bu fontlarla tam bir basılı satır yaklaşık 15.6 em genişliğindedir; bu yüzden `100cqw / 16` bir satırı tam olarak
sayfa genişliğinde yapar. İkinci sınır, kısa ve geniş ekranlarda 15 satırın birbirine değmesini önler (her satıra en
az 1.8 em düşer).

```css
.page-body { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
.line      { display: flex; justify-content: space-between; white-space: nowrap; font-size: var(--qcf-size); line-height: 1.5; }
.line.centered { justify-content: center; column-gap: 0.25em; }
```

`space-between`, kelimeleri tıpkı baskıdaki gibi kenardan kenara yayar. `overflow: visible` olarak bırakın: harflerin
üstündeki ve altındaki işaretler satır kutusunun dışına taşar.

- Sure başlığı: `font-size: calc(100cqw / 3.302)` — çerçeve glifi 3.302 em genişliğindedir, böylece sayfanın
  genişliğini doldurur.
- Besmele satırı: ortalanmış, `font-size: var(--qcf-size)`, `fontPage` sayfasının fontuyla çizilir.
- Sayfa 1–2: satırlar ortalanmış ve 1.3× daha büyük.

### 5.3 Fontları doğru şekilde yüklemek

Her sayfanın kendi fontu gerekir (~160 KB). Fontları `FontFace` API'siyle yükleyin ve kendiniz kaydedin:

```js
const face = await new FontFace("qcf-v2-p3", "url(…/fonts/pages/p3.woff2)", { display: "block" }).load();
document.fonts.add(face);
```

Hızlı ve ucuz kalmasını sağlayan kurallar (hepsi [`example/js/fonts.js`](../../example/js/fonts.js) içinde):

1. **Bir sayfayı ancak fontları yüklendikten sonra çizin.** Glif kodları başka bir fontta hiçbir anlam taşımaz. Bu
   arada kodları değil, boş bir sayfa (yer tutucu satırlar) gösterin. `display: "block"` bunu garanti eder.
2. **Önce en yakındaki, aynı anda iki tane.** Bir kuyruk önce okunan sayfanın fontunu, sonra komşularınınkini yükler.
   Bir sayfadan daha uzaktaki sayfalar, okuyucu yaklaşana kadar bekler.
3. **Son 24 fontu tutun**, daha eskileri `document.fonts` içinden kaldırın (çözümlenmiş fontlar bellek kaplar).
4. Besmele bulunan bir sayfa 1. sayfanın fontuna da ihtiyaç duyar; sure başlığı bulunan bir sayfa da başlık fontuna.

### 5.4 Fazla geniş gelen nadir satır

Birkaç sayfada, bazı boyutlarda, bir satır sayfadan kıl payı daha geniş olur. Çizdikten sonra her satırı bir kez
ölçün ve yalnızca o satırı küçültün ([`fitLines`](../../example/js/page.js)):

```js
const ratio = sumOfWordWidths / line.width;
if (ratio > 1) line.style.fontSize = `calc(${currentSize} * ${0.99 / ratio})`;
```

Bu oran boyuta bağlı değildir. Bu yüzden sayfa yeniden boyutlandırıldığında da doğru kalır (boyut değişince yeniden
ölçün).

### 5.5 Sayfa çevirmek: sağdan sola

Sonraki sayfa **sol taraftadır**. Sayfayı sağa kaydırmak (kâğıt bir sayfayı çeker gibi) sonraki sayfayı gösterir.
`←` sonraki sayfa, `→` önceki sayfadır. "Önceki" düğmesini sağda, "sonraki" düğmesini solda gösterin.

### 5.6 Önceden hazırlık

Bir sayfa gösterildiğinde, önündeki ve arkasındaki ikişer sayfanın sayfa dosyalarını (her biri birkaç KB) indirin;
hemen önceki ve hemen sonraki sayfanın fontlarını da kuyruğa ekleyin. Böylece sayfa çevrildiğinde anında görünür.

## 6. Kelimelerle çalışmak

Ekrandaki her kelime, kendisiyle ilgili her şeyi üzerinde taşır:

```html
<span class="word" data-location="2:255:3" data-word-id="…" data-text="ٱللَّهُ">ﱆ</span>
```

- **Bir kelimeye dokunma**: `data-location` ve `data-text` değerlerini okuyun (bkz.
  [`example/js/app.js`](../../example/js/app.js) içindeki tıklama işleyicisi).
- **Bütün bir ayeti vurgulama**, hiçbir şeyi yeniden çizmeden — tek bir CSS kuralıyla:

  ```js
  style.textContent = `.word[data-location^="2:255:"] { background: … }`;
  ```

  (`^=` "ile başlar" demektir: `2:255:` 2:255'in her kelimesiyle eşleşir, 2:25 ile asla.)
- **Bir kelimeyi işaretleme** (ezber hataları, notlar, yer imleri): kelimenin `id` değerini ya da konumunu saklayın.
- **Arama**: kelimelerin `text` alanında arayın (daha esnek bir arama için önce harekeleri kaldırın).

## 7. Kârilerin sesi

### 7.1 Neden sayfa başına tek dosya

Bilinen kaynaklar her ayet için bir MP3 verir: kâri başına 6236 dosya. Bir sayfayı bu şekilde çalmak, her ayet için
bir istek demektir — her sayfada bir istek yağmuru. Bir sayfanın ayetlerini tek dosyada birleştirmek ise **sayfa
başına tek istek** demektir. Sonraki ayete geçmek, geri dönmek ya da bir ayeti tekrarlamak, elinizdeki dosyanın
içinde bir atlamadır (seek).

### 7.2 Ses dosyalarını oluşturmak

Gereksinimler: Node 20 veya üstü ve PATH'te [ffmpeg](https://ffmpeg.org/).

```bash
node tools/audio/build-reciter.mjs husary      # veya minshawi, shuraim, muaiqly, dosari, alafasy, abdulbasit, alijaber
```

Araç dört adımda çalışır ([`tools/audio/`](../../tools/audio)) ve `data/audio/husary/p001.mp3 … p604.mp3` ile
`index.json` dosyalarını yazar:

1. **İndirme.** Kârinin 6236 ayet dosyası EveryAyah'tan `sources/` klasörüne indirilir (sunucuyu yormadan: aynı anda
   4 dosya; kesilirse kaldığı yerden devam eder).
2. **Besmeleyi ölçme.** Bazı kârilerin besmelesi, diğer ayetlerinden çok daha alçak sesle kaydedilmiştir. Araç ses
   yüksekliğini (EBU R128) ölçer ve aynı seviyede duyulması için bir kazanç hesaplar.
3. **Sayfaları oluşturma.** Her sayfanın ayetleri çözülür. Her ayetin başındaki ve sonundaki sessizlik kırpılır
   (öncesinde ~0.1 s, sonrasında 0.15 s kalacak şekilde, 8 ms'lik yumuşak bir geçişle; böylece ayetler arada boşluk
   kalmadan birbirini izler). 1. ve 9. sureler dışında her surenin 1. ayetinden önce besmele eklenir. Sayfa **tek
   seferde** mono, **CBR** 64 kbps MP3 olarak kodlanır.
   - Her ayetin başlangıcı örnek (sample) sayısıyla hesaplanır; bu yüzden indeks tam doğrudur.
   - CBR önemlidir: tarayıcılar sabit bit hızlı MP3'te tam isabetle atlama yapar.
4. **Kontrol.** 604 sayfa, 6236 ayet ve her dosyanın çözülmüş uzunluğu indeksiyle birebir aynı.

Sonuç, yayımladığımız dosyalarla bayt bayt aynıdır: bunu `data/audio/<id>/index.json` ile karşılaştırarak
doğrulayabilirsiniz. Bir kâri yaklaşık bir saat sürer (çoğu indirme) ve 0.5–1.2 GB yer kaplar. Kâri başına ayarlar
[`tools/audio/reciters.config.json`](../../tools/audio/reciters.config.json) dosyasındadır (Ali Cabir'in ilk dosyası
istiâze ile başlar, bu yüzden besmelesi dosyanın 7. saniyesinde başlar).

### 7.3 Sayfayla eş zamanlı çalmak

Kod: [`example/js/audio-queue.js`](../../example/js/audio-queue.js) ve
[`example/js/audio-player.js`](../../example/js/audio-player.js). Fikir şu:

1. **Çalma listesi.** "2:5'ten surenin sonuna kadar" isteği, kârinin `index.json` dosyasından okunan
   `{ page file, surah, ayah, startMs, endMs }` öğelerinden oluşan bir listeye dönüşür (gereken yerlerde 1. ayetten
   önce besmele öğesiyle birlikte).
2. **Tek bir `<audio>` öğesi.** Bir öğe için `audio.src` değerini o öğenin sayfa dosyasına ayarlayın (sayfa başına
   bir kez) ve `audio.currentTime = startMs` yapın. Geçerli sayfa **akış olarak (stream)** gelir: ses ilk birkaç
   KB'tan sonra başlar.
3. **Nerede olduğunuzu bilin.** `timeupdate` olayında (saniyede yaklaşık 4 kez) `currentTime` değerini `endMs` ile
   karşılaştırın. Buna, geçerli ayetin sonuna tam ayarlanmış bir zamanlayıcı ekleyin; böylece ekran kapalıyken bile
   tekrarın sonu tam isabetli olur:
   - aynı sayfa, sonraki ayet hemen ardından geliyor → yalnızca vurguyu taşıyın (ses çalmaya devam eder);
   - tekrar → `startMs` noktasına geri atlayın (istek yok);
   - başka bir sayfa → `src` değerini değiştirin.
4. **Sonraki sayfa, önceden.** Bir sayfa çalmaya başladıktan üç saniye sonra, listenin ihtiyaç duyduğu sonraki sayfa
   dosyasını `fetch()` ile indirin (tek istek) ve bir `Blob` URL'si olarak saklayın. Okuma oraya geldiğinde dosya
   bellekten, anında çalar. Bu şekilde yaklaşık 4 sayfa tutun; daha eskileri `URL.revokeObjectURL` ile serbest
   bırakın.
5. **Metni takip edin.** Her yeni öğede o öğenin ayetini vurgulayın ([6](#6-kelimelerle-çalışmak) bölümündeki CSS
   kuralı). Ayet başka bir sayfadaysa o sayfaya geçin.
6. **Telefonlara nazik davranın.** Yüklenemeyen bir sayfa 1.5 saniye sonra bir kez daha denenir. Oynat düğmesi bir
   hatadan sonra yeniden dener. `NotAllowedError`, tarayıcının önce bir dokunuş istediği anlamına gelir (iPhone):
   hata değil, "duraklatıldı" gösterin.
7. **Kilit ekranı.** `navigator.mediaSession.metadata` değerini (sure ve ayet, kâri) ve oynat / duraklat / önceki /
   sonraki işleyicilerini ayarlayın.

Sağdan sola yazılan dillerde "sonraki ayet" düğmesini sola koyun ve atlama simgelerini aynalayın.

### 7.4 Bir ses, iki baskı

Bir ayetin hangi sayfa **dosyasında** olduğu, Mushafın sayfalarından değil, her zaman kârinin `index.json`
dosyasından okunur. Sayfa çevirme ise Mushafın kendi indeksini kullanır. Böylece bir baskıya göre kesilmiş ses,
ekranda başka bir baskı varken de doğru çalar (1405H ve 1421H baskılarında 56 ayet komşu bir sayfada yer alır).
Bizim dosyalarımız, `data/mushaf` ile aynı olan 1421H sayfalarına göre kesilmiştir.

## 8. Cloudflare üzerinde barındırma, adım adım

Cloudflare'in ücretsiz katmanları içinde her şey ücretsizdir (bkz. [9.4](#94-maliyet)).

### 8.1 Hesap

[dash.cloudflare.com](https://dash.cloudflare.com) adresinde ücretsiz bir hesap açın. R2, ücretsiz katman için bile,
etkinleştirmek üzere bir kez ödeme yöntemi ister. Ücretsiz sınırlar içinde hiçbir ücret alınmaz.

### 8.2 Bucket oluşturmak

**R2 Object Storage → Create bucket** → bir ad verin (ör. `quran-files`) → location: automatic (konum: otomatik) →
**Create**.

### 8.3 Dosyaları yüklemek

Önerdiğimiz düzen, deponun `data/` klasörünü bir sürüm klasörünün altına aynen yansıtır:

```
v1/mushaf/…   v1/fonts/…   v1/audio/…
```

- **Birkaç dosya**: bucket'ın içinde **Upload**'a tıklayın ve klasörleri sürükleyip bırakın.
- **Binlerce dosya** (fontlar, ses): aracı kullanın.
  1. **R2 → Manage API tokens → Create API token** → izin olarak **Object Read & Write**, yalnızca kendi
     bucket'ınızda → oluşturun. Access Key ID ve Secret Access Key değerlerini kopyalayın (yalnızca bir kez
     gösterilir).
  2. `.env.example` dosyasını `.env` olarak kopyalayın (`.env` dosyasını asla commit etmeyin). Anahtarları, S3 uç
     noktasını (bucket → Settings → S3 API, bucket adı olmadan) ve bucket adını doldurun.
  3. Yükleyin:

     ```bash
     node tools/cloudflare/upload-r2.mjs data/mushaf v1/mushaf
     node tools/cloudflare/upload-r2.mjs data/fonts  v1/fonts
     node tools/cloudflare/upload-r2.mjs data/audio  v1/audio
     ```

     Her dosya `Cache-Control: public, max-age=31536000, immutable` (bir yıl) başlığını alır; yalnızca
     `reciters.json` bir saatlik süre alır. Komutu tekrar çalıştırmak yalnızca değişenleri gönderir.

### 8.4 Worker: herkese açık adresiniz

1. **Workers & Pages → Create → Start with Hello World** → bir ad verin (ör. `quran-files`) → **Deploy**.
2. **Edit code** → içindeki her şeyi [`tools/cloudflare/files-worker.js`](../../tools/cloudflare/files-worker.js)
   ile değiştirin → **Deploy**.
3. Worker'ın **Settings → Bindings → Add → R2 bucket** bölümünde → değişken adı (variable name) **`FILES`** →
   bucket'ınız → **Deploy**.
4. Dosyalarınız artık `https://quran-files.<your-subdomain>.workers.dev/v1/…` adresinde. Birini kontrol edin:
   `…/v1/mushaf/chapters.json`.

Worker yalnızca `FOLDERS` içindeki anahtarlar (varsayılan olarak `v1/`) için `GET` / `HEAD` isteklerine yanıt verir.
Range isteklerini yanıtlar (seste ileri geri atlama için) ve açık CORS başlıkları gönderir (fontlar ve sonraki ses
sayfası `FontFace` / `fetch` ile okunur; bunların da bu başlıklara ihtiyacı vardır).

### 8.5 Neden bucket'ın r2.dev adresi değil?

R2 bir bucket'a herkese açık bir `pub-….r2.dev` adresi verebilir, ama: bazı internet sağlayıcıları tüm `*.r2.dev`
adreslerini engeller (Türkiye'de ölçtük: bağlantı kurulamıyor); hız sınırı vardır; ve Cloudflare bu adresi asla
önbelleğe almaz. Worker'ı (ya da kendi alan adınızı) kullanın.

### 8.6 Kendi alan adınız (sonra, önerilir)

Alan adınızı Cloudflare'e ekleyin (**Websites → Add a site**, ardından alan adını aldığınız firmada ad sunucularını,
yani name server'ları değiştirin). Sonra Worker'da: **Settings → Domains & Routes → Add → Custom domain** → ör.
`files.example.com`. İki kazancı var: hiçbir sağlayıcı bu adresi engellemez ve Worker dosyaların tamamını
Cloudflare'in uç önbelleğinde (edge cache) tutar (Cache API `workers.dev` üzerinde hiçbir şey yapmaz). Böylece
isteklerin çoğu R2'ye hiç ulaşmaz.

### 8.7 Uygulamayı buraya yönlendirin

Örnekte, [`example/js/config.js`](../../example/js/config.js) içindeki `FILES_BASE`, `v1` klasörünün adresidir
(ör. `https://quran-files.you.workers.dev/v1`). `AUDIO_BASE` başka bir adres vermedikçe ses adresi
`FILES_BASE + "/audio"` olur. Hızlı bir deneme için: `example/index.html?files=https://…/v1`.

## 9. Telefonlarda önbellek ve ücretsiz kalmak

### 9.1 Hiç değişmeyen dosyalar

Yayımlanan her dosya **değişmezdir (immutable)**: bir şey değişirse onu yeni bir klasörde (`v2/…`) yayımlayın ve
uygulamayı oraya yönlendirin; asla üzerine yazmayın. Bu sayede `Cache-Control: immutable, max-age=31536000`
kullanılabilir: telefon dosyayı bir yıl saklar ve sunucuya bir daha sormaz bile.

### 9.2 Service worker: çevrimdışı Mushaf

[`example/sw.js`](../../example/sw.js):

- sayfa dosyaları, indeks ve fontlar: **önce önbellek (cache first)** — ilk ziyaretten sonra bir sayfa hiç ağ
  olmadan çizilir;
- uygulamanın kendi dosyaları (HTML, CSS, JS): **önce ağ (network first)**, çevrimdışıyken saklanan kopya;
- ses: service worker tarafından saklanmaz (büyük dosyalar, Range istekleri). Bunları tarayıcının kendi HTTP
  önbelleği tutar; oynatıcı da sonraki sayfayı arka planda indirir.

Bir sayfanın, okunmadan önce çevrimdışı kullanılabilir olmasını mı istiyorsunuz? Sayfa dosyasını ve fontunu bir kez
indirin (ör. 604 sayfayı yavaş yavaş dolaşan bir "Mushafı indir" düğmesi). Service worker içinden geçeni saklar.

### 9.3 Cloudflare'in kendi önbelleği

Kendi alan adınızla (8.6), Worker dosyaların tamamını Cloudflare'in uç sunucularında tutar: bir şehirdeki ilk öğrenci
sayfayı R2'den alır, sonrakiler uç sunucudan.

### 9.4 Maliyet

Bu rehberin yazıldığı tarihteki ücretsiz katmanlar (güncel değerler için Cloudflare'in fiyat sayfalarına bakın):

| Hizmet | Her ay ücretsiz | Neyi tüketir |
|---|---|---|
| R2 depolama | 10 GB | fontlar 93 MB + sayfa verileri 9 MB + kâri başına ses 0.5–1.2 GB (8 kâri ≈ 6.3 GB) |
| R2 okuma (class B) | 10 milyon | R2'den sunulan her dosya |
| R2 yazma (class A) | 1 milyon | yalnızca yüklemeler |
| R2 indirme trafiği | ücretsiz, sınırsız | — |
| Workers | **günde** 100.000 istek | her dosya isteği |

Örnek: her gün 5 yeni sayfa okuyan ve 3 sayfa dinleyen 300 öğrenci → yaklaşık 300 × (5 sayfa dosyası + 5 font + 3 ses
sayfası) ≈ günde 4000 istek. Bu, Worker'ın günlük kotasının %4'ü. Zaten telefonda olan dosyalar hiçbir şeye mal olmaz.

Maliyeti bu kadar düşük tutan kurallar: sayfa başına tek ses dosyası; yalnızca okuyucunun yakınındaki fontları
yüklemek; ±2 sayfa dosyası ve ±1 font önceden indirmek, asla bütün kitabı birden değil; değişmez dosyalar; bir
service worker.

## 10. Kendi uygulamanıza eklemek

Örnek bilerek düz JavaScript ile yazıldı: aynı parçalar React, Vue, Svelte, Flutter (WebView) ya da yerel (native)
bir uygulamada da çalışır.

- **React**: sayfa dosyasını ve fontlarını yükleyen bir `<QuranPage page={n} />` bileşeni (ikisi de hazır olana kadar
  yer tutucuyu gösterin); düz bir modül olarak font modülü (kendi kuyruğunu kendisi yönetir); sayfa çizildikten sonra
  bir `useLayoutEffect` içinde `fitLines`. Ses oynatıcıyı React'in dışında bir sınıf olarak tutun ve ona
  `useSyncExternalStore` ile abone olun.
- **Kaydırma**: herhangi bir carousel bileşeni iş görür. Biz `dir="rtl"` ve sanal slaytlarla Swiper kullanıyoruz:
  yalnızca geçerli sayfa ve iki yanındaki birer sayfa DOM'a yerleştirilir (mount).
- **Yerel uygulamalar**: sayfa dosyası + font yaklaşımı aynı şekilde çalışır (font dosyasını kaydedin, `g` kodlarını
  onunla çizin). Ses için platformun kendi oynatıcısını ve aynı `index.json` dosyasını kullanın.

**Bir yapay zekâ asistanıyla**: projenizi Claude Code'da (ya da başka bir ajanda) açın. Bu deponun `AGENTS.md`
dosyasını projenizin yanına kopyalayın ya da beceriyi kurun (`skills/quran-mushaf/` klasörünü `.claude/skills/`
içine) ve şunu isteyin: "Mushafı AGENTS.md'yi izleyerek uygulamama ekle". Asistan verileri, yukarıdaki kuralları ve
yapılması gereken kontrolleri bilir.

## 11. Sık karşılaşılan sorunlar

| Ne görüyorsunuz | Neden | Çözüm |
|---|---|---|
| Kur'an yerine rastgele harfler | sayfa, fontu yüklenmeden çizildi | `display: "block"` ile `FontFace`; yalnızca `load()` tamamlandıktan sonra çizin |
| Bir satır sayfanın dışına taşıyor | o satır bu boyutta kıl payı daha geniş | o satırı ölçüp küçültün (5.4) |
| Fontlar sizin sunucunuzdan yüklenmiyor | CORS başlığı yok | fontları Worker üzerinden sunun (Worker CORS başlıklarını gönderir) |
| Bazı kullanıcılarda hiçbir şey yüklenmiyor | `*.r2.dev`, internet sağlayıcıları tarafından engelleniyor | Worker'ı ya da kendi alan adınızı kullanın |
| iPhone'da ses başlamıyor | tarayıcı önce bir dokunuş istiyor | çalmayı dokunuşun içinde başlatın; `NotAllowedError` gelince "duraklatıldı" gösterin |
| Güncellemeden sonra eski veriler | dosyaların üzerine yazıldı, telefonlar ise onları bir yıl saklıyor | asla üzerine yazmayın: yeni bir klasöre yayımlayın |
| Sayfa başına bir istek yağmuru | ayet başına bir dosya ya da gereğinden fazla önceden indirme | sayfa başına tek dosya; ±2 / ±1 önceden indirme |
| Sayfa verilerini QUL'dan yeniden oluşturmak | QUL, 2:181, 8:6 ve 13:37'de «بَعْدَ مَا» ifadesini iki kelimeye böler | her iki glifiyle tek bir kelime olarak tutun (bizim verilerimiz böyle yapar) |

## 12. Teşekkür

Bu çalışma başkalarının omuzlarında yükseliyor; onlara içtenlikle teşekkür ediyoruz:

- **Kral Fahd Kur'an-ı Kerim Basım Kompleksi** (Medine) — Medine Mushafı ve hiç değiştirmeden kullandığımız sayfa
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
kaynağın kullanım koşullarını okuyun. [MIT lisansı](../../LICENSE), bu depo için yazılmış kodu ve rehberleri kapsar.
