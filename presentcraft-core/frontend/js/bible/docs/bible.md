## Isi folder
 
```
js/
  bible.js              pintu masuk: dengar klik #tb-bible, buka dialog
  bible/
    dialog.js           otak dialog: state, alur, event, muat pasal, cari kata
    view.js             kerangka DOM (tidak ada logika)
    picker.js           kolom Kitab dan Pasal
    preview.js          kolom Ayat dan bar bawah
    importer.js         daftar terjemahan, tombol Download dan Import zip
    slides.js           ayat terpilih → slide
    books.js            66 kitab (kode, jumlah pasal), pencarian kitab, parsing referensi
    catalog.js          daftar terjemahan yang boleh diunduh
    lang/
      index.js          daftar bahasa
      eng.js, ind.js    label UI dan nama kitab per bahasa
css/
  bible.css             seluruh tampilan dialog
```
 
## Siapa mengerjakan apa
 
| File | Tugasnya | Isi pentingnya |
|---|---|---|
| `bible.js` | Membuka dialog saat tombol diklik. | `openBible`, re-export `chunkVerses` dan `buildItems` untuk kode lama |
| `dialog.js` | Memegang state `S`, mengatur alur, dan satu-satunya tempat yang memanggil backend untuk memuat pasal dan mencari kata. | `goTo`, `doSearch`, `runBackend`, `dispatch`, fungsi saran kitab, `start`, `redraw` |
| `view.js` | Membuat elemen-elemen dialog dan mengembalikannya sebagai objek `v`. | `mk`, `buildView` |
| `picker.js` | Menggambar kolom Kitab (PL/PB) dan kolom Pasal, serta menyorot yang aktif. | `renderBooks`, `renderChaps`, `markNav` |
| `preview.js` | Menggambar kolom Ayat (ayat, hasil pencarian, pesan) dan ringkasan di bar bawah. | `renderVerses`, `paintVerses`, `syncBar`, `selected` |
| `importer.js` | Mengisi dropdown terjemahan dan mengurus Download / Import zip. | `loadTranslations`, `translationLang`, `wireImport` |
| `slides.js` | Memecah ayat jadi slide dan memasukkannya ke grup. | `fmtNums`, `chunkVerses`, `buildItems`, `addToSlides`, `LOOK` |
| `books.js` | Data kitab dan segala hal tentang mengenali kitab dari ketikan. Tanpa nama bahasa. | `BOOKS`, `findBook`, `suggestBooks`, `parseRef`, `bookName`, `bookRef` |
| `catalog.js` | Terjemahan yang bisa diunduh, lengkap dengan lisensi dan atribusi. | `CATALOG` |
| `lang/*.js` | Nama kitab, singkatan, dan semua teks UI untuk satu bahasa. | `ui`, `books` |
| `bible.css` | Tampilan. Semua class berawalan `.bible-`. | variabel warna di `.bible-box` |
 
## Alur singkat
 
1. Tombol Bible diklik → `openBible()` membangun dialog lewat `buildView()`.
2. `loadTranslations()` mengisi dropdown dari `bible_list`, lalu `start()` membuka posisi terakhir (kalau belum ada, Yohanes 1).
3. Operator mengetik atau mengklik. Semua jalan berujung ke `goTo()` (muat satu pasal) atau `doSearch()` (cari kata).
4. Ayat dipilih di kolom Ayat: klik untuk memilih, drag atau Shift+klik untuk rentang.
5. **Add to slides** → `addToSlides()` → `lib.replaceSlides()`. Passage yang sama ditambahkan lagi akan **menggantikan** slide lamanya, bukan menggandakan.
### Apa yang terjadi saat mengetik
 
| Ketikan | Hasil |
|---|---|
| `yoh 3:16-18` | Buka Yohanes 3, ayat 16–18 langsung terpilih |
| `yoh 3` | Buka Yohanes 3, semua ayat terpilih |
| `yoh` | Muncul saran kitab (panah + Enter untuk memilih) |
| `Allah mengasihi` | Pencarian kata, hasil muncul di kolom Ayat dengan kata disorot |
| Referensi yang tidak dikenali tabel kitab | Diserahkan ke backend dulu; kalau ditolak baru dicari sebagai kata |
 
Referensi diproses setelah jeda 250 ms, pencarian kata setelah 350 ms. Enter langsung memprosesnya tanpa menunggu. Escape menutup saran dulu, baru dialog.
 
## State `S`
 
Dipegang `dialog.js`, hanya dibaca oleh `picker.js` dan `preview.js`. Perubahan state **hanya** terjadi di `dialog.js` (plus klik ayat di `preview.js` yang mengubah `sel`).
 
| Field | Artinya |
|---|---|
| `lang`, `ui` | Bahasa terjemahan aktif dan label UI-nya |
| `book`, `chapter` | Kitab dan pasal yang sedang dibuka |
| `cp` | Pasal yang sudah termuat |
| `sel` | `Set` nomor ayat yang dipilih |
| `hits`, `hitWords` | Hasil pencarian kata dan kata yang disorot |
| `info` | Pesan di kolom Ayat (error, petunjuk) |
| `anchor`, `drag` | Bantu Shift+klik dan drag |
| `rows`, `bookEls`, `chapEls` | Referensi elemen, supaya sorotan bisa diperbarui tanpa render ulang |
 
## Ingin mengubah sesuatu? Buka ini
 
| Keperluan | File |
|---|---|
| Tambah bahasa | lihat bagian “Menambah bahasa” di bawah |
| Ubah singkatan atau nama kitab | `lang/<bahasa>.js` |
| Ubah tulisan UI (Pasal, Ayat, pesan) | `lang/<bahasa>.js`, bagian `ui` |
| Tambah terjemahan | `catalog.js` (cek lisensinya dulu) |
| Ubah tampilan slide Alkitab (posisi, ukuran teks) | `slides.js` → `LOOK` |
| Ubah aturan pemecahan slide | `slides.js` → `chunkVerses`, `AUTO_CHARS` |
| Ubah format ketikan referensi | `books.js` → `REF`, `parseRef` |
| Ubah alur ketik, pencarian, saran | `dialog.js` → `dispatch` |
| Ubah warna, jarak, ukuran | `bible.css` |
| Tambah tombol atau opsi baru | `view.js` (elemen) + `dialog.js` (event) |
| Ubah isi kolom Ayat | `preview.js` |
| Ubah isi kolom Kitab atau Pasal | `picker.js` |
 
## Menambah bahasa
 
Contoh: menambah bahasa dengan kode `xyz`.
 
1. Salin `lang/eng.js` jadi `lang/xyz.js`, lalu terjemahkan bagian `ui` dan nama kitabnya. Format kitab: satu baris per kitab, `KODE=Nama|singkatan|singkatan`, nama pertama yang ditampilkan.
2. Di `lang/index.js`: `import xyz from "./xyz.js";` lalu tambahkan `xyz` ke `REGISTRY`.
3. Di `catalog.js`, isi `lang: "xyz"` pada terjemahan yang bahasanya itu.
Selesai. Nama kitab, saran ketik, singkatan, dan label OT/NT/Pasal/Ayat langsung ikut. Yang belum diterjemahkan otomatis memakai bahasa Inggris, jadi file bahasa boleh dikerjakan sedikit-sedikit.
 
## Kontrak dengan backend
 
Perintah Rust yang dipakai dialog ini:
 
| Perintah | Dipanggil dari | Kira-kira mengembalikan |
|---|---|---|
| `bible_list` | `importer.js` | daftar `{id, name, books, lang?}` |
| `bible_passage` | `dialog.js` | `{book, chapter, verses: [{n, text}], translation, attribution, ...}` |
| `bible_search` | `dialog.js` | daftar `{book, chapter, verse, text}` |
| `bible_import_usfm` | `importer.js` | `{books}` |
| `bible_download_usfm` | `importer.js` | `{books}` |
 
Kalau `bible.rs` berubah, cukup periksa `dialog.js` dan `importer.js`.
 
Catatan penting: `bible_passage` menerima **nama kitab bahasa Inggris** (mis. `"Song of Solomon 3"`). Itu sebabnya ada `bookRef()`, yang selalu mengambil nama dari `lang/eng.js`. Tabel Inggris harus lengkap dan ejaannya sama dengan parser Rust.
 
## Hal-hal yang gampang kelupaan
 
- **Kitab dikenali lewat kode USFM** (`GEN`, `JHN`, …), bukan lewat nama. Jangan mencocokkan kitab dengan nama tampilan.
- **Guard `token`.** Setiap `goTo` dan `doSearch` menaikkan `token`, dan hasil yang sudah basi diabaikan. Pertahankan pola ini kalau menambah pemanggilan backend baru, supaya klik cepat tidak menimpa hasil yang lebih baru.
- **Bahasa terjemahan** dibaca dari `bible_list` (`lang`). Kalau backend tidak mengirimnya, dipakai `lang` dari `catalog.js`, dan kalau tidak ada juga, bahasa Inggris. Terjemahan hasil import sendiri biasanya jatuh ke Inggris.
- **Teks yang masih Inggris di dialog**: Close, Add to slides, Per slide, opsi, dan Add translation. Kalau mau dilokalkan, pindahkan ke `ui` di file bahasa.
- **Variabel warna** (`--panel`, `--field`, `--line`, `--text`, `--text-dim`) ada di blok `.bible-box` paling atas `bible.css`. Ganti tema cukup di situ.