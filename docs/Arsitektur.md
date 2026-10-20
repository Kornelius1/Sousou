# PresentCraft Frontend: Peta Arsitektur

Dokumen ini menjawab: **"file mana yang mengatur panel mana?"**
Lokasi kode: `frontend/` (`index.html`, `css/`, `js/`).

Tanda **(belum diverifikasi)** berarti isinya belum pernah saya lihat langsung, hanya disimpulkan dari nama atau pemakaiannya.

---

## 1. Peringatan penting soal penamaan

Nama di kode **tidak sama** dengan nama di layar. Ini sumber kebingungan terbesar.

| Yang tampil di layar | Posisi | Nama di kode | Prefix ID HTML | File JS utama |
|---|---|---|---|---|
| **Media** (daftar grup + slide/file) | kiri atas | **library** | `lib-*` | `library.js` |
| **Slide** (grid thumbnail) | tengah | **sorter** | `slide-grid`, `zoom` | `sorter.js` |
| **Properties** + **Preview** | kanan | props / preview | `p-*`, `pv-*` | `properties.js`, `preview.js` |
| **Background** (daftar grup) | bawah kiri | **explorer** | `ex-*` | `explorer.js` |
| Grid background | bawah tengah | bg-detail | `bg-*` | `background-panel.js` |
| Pengaturan background | bawah kanan | bg-settings | `bg-*` | `background-panel.js` |
| Toolbar bawah | paling bawah | toolbar | `tb-*` | `toolbar.js` |

Jadi: **"explorer" = panel Background**, **"library" = panel Media**. Keduanya tampil sebagai pohon grup, tapi datanya berbeda (lihat bagian 3).

---

## 2. Peta file

### Entry point
- **`main.js`**: memanggil semua `init*()` dalam urutan tertentu. Tidak berisi logika bisnis. **Urutan di sini penting** (lihat bagian 6).

### Panel dan UI
| File | Tanggung jawab |
|---|---|
| `sorter.js` | Grid slide tengah: render kartu + thumbnail, pilih slide, navigasi panah, drag-drop urutan, impor `.probundle`, slide kosong (`createBlankSlide`, `initBlankDeck`, `showGroupSlides`) |
| `library.js` | Panel Media: membuat `createTree` untuk `lib-list`, menyambungkan aksi (tambah ke slide, jadikan background), menyinkronkan grid tengah (`refreshGrid`) |
| `explorer.js` | Panel Background (kiri bawah): membuat `createTree` untuk `ex-list` |
| `tree.js` | **Komponen pohon generik** yang dipakai library DAN explorer: render grup/item, rename, hapus, sort, drag antar grup, popup menu, tombol tambah, input nama baru |
| `background-panel.js` | Grid tile background (`#bg-grid`, tile `.bgt`) dan pengaturan skala/opasitas/loop/bisu |
| `properties.js` | Panel Properties kanan (layer, transform, teks) |
| `preview.js` | Preview kanan bawah dan kontrol video |
| `toolbar.js` | Tombol toolbar dan **shortcut keyboard global** (`initShortcuts`) |
| `menu.js` | Menu bar atas |
| `confirm.js` | Dialog konfirmasi (`askConfirm`) |

### Data dan state
| File | Tanggung jawab |
|---|---|
| `state.js` | Objek `state` global: `slides`, `cards`, `activeIndex`, `selectedLayer`, `bg`, `groups`, `selectedGroup`, `selectedItem`, `blanked`, dst. |
| `store.js` | Bentuk item (`base()`, `newBlank`), `itemName`, `sameItem`, dan **factory `lib`** (store khusus library) |
| `groups.js` | Operasi grup untuk **explorer**: `createGroup`, `addFiles`, `moveItem`, dst. Menulis ke `state.groups` |
| `media.js` | `MEDIA_FILTER`, `kindOf` (menentukan jenis file) |
| `../background-state.js` | Penyimpanan dan event background (`loadBackground`, `onBackgroundChange`) |

### Infrastruktur
| File | Tanggung jawab |
|---|---|
| `bus.js` | Event bus: `emit(nama, data)` dan `on(nama, fn)`. Cara antar-modul saling memberi tahu |
| `utils.js` | `$` (getElementById), `setStatus` (teks di toolbar bawah) |
| `tauri.js` | Jembatan ke backend Rust: `invoke`, `openDialog` |
| `audience.js` | Layar audiens: `emitPayload`, `toPayload`, `setBlanked`, `emitBlank` |
| `slide-renderer.js` | `window.SlideRenderer` (render thumbnail dan background) **(belum diverifikasi)** |

### CSS
| File | Isi |
|---|---|
| `base.css` | Variabel global (`--select-color`), gaya dasar |
| `panes.css` | Panel atas: library, slide grid (`.card`), properties |
| `bottom.css` | Panel bawah: explorer, background grid (`.bgt`), pengaturan, toolbar |

---

## 3. Dua sumber data yang berbeda (jangan tertukar)

Library dan explorer sama-sama memakai `createTree`, tapi **menyimpan data di tempat berbeda**:

```
Panel Media (library)            Panel Background (explorer)
  library.js                       explorer.js
      |                                |
      v                                v
  lib (store.js)                   groups.js
  lib.s.groups                     state.groups
  lib.s.gid / lib.s.iid            state.selectedGroup / selectedItem
  event: lib-changed,              event: groups-changed,
         lib-selection                    selection-changed
```

Aturan praktis:
- Mau mengubah perilaku **Media**: edit `store.js` (fungsi di dalam factory `lib`) dan `library.js`.
- Mau mengubah perilaku **Background**: edit `groups.js` dan `explorer.js`.
- Mau mengubah **tampilan/interaksi pohon** di keduanya sekaligus: edit `tree.js`.

### Kontrak `createTree`

`tree.js` hanya memanggil fungsi yang diberikan lewat `cfg.api`. Kalau satu fungsi tidak disediakan, fitur itu harus **menyembunyikan dirinya**, bukan error.

```
api: { selectGroup, selectItem, createGroup, renameGroup, deleteGroup,
       removeItem, moveItem, sortGroup, addFiles,
       addBlank   <- opsional. Kalau ada, tombol tambah menampilkan menu
                     "Slide kosong / Upload file". Kalau tidak ada, langsung upload. }
```

Saat ini hanya **library** yang menyediakan `addBlank` (`lib.addBlank`, di `store.js`).

---

## 4. Alur data penting

### a. Slide kosong dibuat di panel Media
```
tombol tambah (lib-add) -> menu -> "Slide kosong"
  -> tree.js: baris input sementara (promptName/createRow)
  -> Enter + nama terisi -> finishCreate -> cfg.api.addBlank
  -> lib.addBlank (store.js) -> changed() -> emit 'lib-changed'
  -> tree.render()  +  library.refreshGrid()
```
Nama kosong, Escape, atau blur dengan teks kosong = **batal** (tidak ada data dibuat), meniru VS Code.

### b. Grid tengah mengikuti grup yang dipilih
```
lib-changed / lib-selection
  -> library.refreshGrid()
  -> sorter.showGroupSlides(grup)   (item kind:'slide' -> daftar slide)
  -> sorter.applySlides(...)        (bangun ulang kartu + thumbnail)
  -> emit 'slides:loaded'
```
Setiap slide hasilnya membawa `itemId` dan `groupId` supaya fitur edit nanti tahu item mana yang harus ditulis balik.

### c. Navigasi keyboard di grid
Dua handler bekerja bersamaan:
1. `sorter.js` (`initSorter`): panah di dalam `#slide-grid`, gerak berdasarkan posisi geometris kartu.
2. `toolbar.js` (`initShortcuts`): handler global di `window`.

Handler global **harus** mengecek `if (e.defaultPrevented) return;` setelah blok Ctrl+O. Kalau baris itu hilang, satu tekanan panah memajukan **dua** slide (bug yang pernah terjadi).

### d. Impor `.probundle`
`sorter.importFile` -> `invoke('load_presentation_bundle')` -> `applySlides`. Ini **menimpa grid** sampai grup dipilih lagi. Belum dijadikan grup library.

---

## 5. Event bus: daftar event yang diketahui

| Event | Dipancarkan oleh | Didengar oleh |
|---|---|---|
| `slides:loaded` | `applySlides` (sorter) | preview, properties, library (`syncBundle`) |
| `slide:shown` | `showSlide` (sorter) | preview/properties **(belum diverifikasi)** |
| `lib-changed` | store `lib` | `tree.js` (library), `library.refreshGrid` |
| `lib-selection` | store `lib` | `tree.js` (library), `library.refreshGrid` |
| `groups-changed` | `groups.js` | `tree.js` (explorer) |
| `selection-changed` | `groups.js` | `tree.js` (explorer) |
| `background-changed` | background-state | `sorter` (`refreshThumbBackgrounds`) |
| `item-updated` | **(belum diverifikasi)** | `explorer.js` (render ulang untuk `kind: 'color'`) |

> **Awas loop:** `applySlides` memancarkan `slides:loaded`. Kalau `syncBundle` menulis ke `lib`, ia memicu `lib-changed`, lalu `refreshGrid`, lalu `applySlides` lagi. `library.js` memutusnya dengan flag `syncing`. Jangan hapus flag itu.

---

## 6. Urutan inisialisasi di `main.js` (jangan diacak)

```
initMenu, initToolbar, initShortcuts, initSorter, initPreview, initProperties
await lib.load()
initLibrary()
await onBackgroundChange(...)          <- listener dulu, baru baca disk
state.bg = await loadBackground()
await loadGroups()
initExplorer, initBackgroundPanel, syncPanel
refreshThumbBackgrounds, renderLibrary
refreshGrid() atau initBlankDeck()     <- setelah preview & properties ada,
renderPreview()                           supaya event slides:loaded tidak hilang
```

Alasan: modul yang mendengar `slides:loaded` harus sudah terpasang sebelum `applySlides` pertama dipanggil.

---

## 7. Bentuk data

### Item (library dan explorer), dasar dari `store.js base()`
```js
{ id, src, text, label, loop, mute, scale, opacity, added, kind }
```
`kind` yang dikenal: `image`, `video`, `audio`, `text`, `color`, **`slide`** (baru).

- Nama tampilan (`itemName`): `color` -> `src`; `text` dan `slide` -> `label`; lainnya -> nama file dari `src`.
- Pembanding duplikat (`sameItem`): `slide` dibandingkan lewat `id`, bukan `src` (karena `src` semua slide kosong sama-sama `''`).

### Slide di grid (`state.slides[i]`)
```js
{ slide_number, group_name, group_color, layers: [], itemId?, groupId?, label? }
```
Field lain mengikuti output backend `load_presentation_bundle` **(belum diverifikasi penuh)**.

---

## 8. Resep perubahan umum

| Mau ... | Ubah |
|---|---|
| Warna highlight pilihan | `--select-color` di `base.css`. Pastikan aturan lama (cyan `#03dac6`) di `panes.css` baris `.card.active` sudah diganti |
| Menambah jenis item baru (mis. `kind: 'foo'`) | `store.js` (`itemName`, `sameItem`), `tree.js` (`ICON_KINDS`), `library.js` (`contextMenu`), cek semua tempat yang membaca `it.src` |
| Menambah opsi di menu tombol tambah | `openAddMenu` di `tree.js` |
| Menambah fitur khusus satu panel | Sediakan fungsi opsional di `cfg.api` panel itu, lalu di `tree.js` cek `if (cfg.api.namaFungsi)` |
| Shortcut keyboard baru | `toolbar.js` `initShortcuts` (global) atau `sorter.js` `initSorter` (hanya saat fokus di grid) |
| Menyimpan hasil drag-drop urutan slide | `sorter.reorderSlides` juga harus memindahkan item di `g.items` dan memanggil `changed()` milik `lib` (belum dikerjakan) |

---

## 9. Jebakan yang sudah pernah terjadi

1. **Slide terlewat saat panah ditekan**: handler `sorter` dan `toolbar` sama-sama menangani panah. Solusi: `if (e.defaultPrevented) return;` di handler global.
2. **`cfg.api.addBlank is not a function`**: `createTree` dipakai dua panel, `addBlank` hanya ada di satu. Solusi: tombol tambah mengecek keberadaan `addBlank` dulu.
3. **Slide kosong tidak muncul di Media**: fungsi ditulis di `groups.js` (store explorer), padahal Media memakai `lib` di `store.js`.
4. **Panel tengah tidak sesuai explorer**: grid hanya diisi `applySlides` dari impor/slide awal, tidak pernah mendengarkan `lib-changed`.
5. **Highlight putih ikut muncul bersama cyan**: kartu aktif selalu terfokus (`card.focus()`), jadi outline bawaan browser tampil. Solusi: `outline: none` dan satu penanda lewat `--select-color`.
6. **Dua "Grup baru" kosong di panel**: kemungkinan dari `syncBundle` yang jalan setiap `slides:loaded`, termasuk saat `initBlankDeck()` **(dugaan, belum dipastikan)**.

---

## 10. Pekerjaan yang masih terbuka

- Simpan urutan drag-drop grid ke `g.items`.
- Klik item di library memilih slide yang sesuai di grid (`itemId`).
- Varian "senyap" `showSlide` supaya klik di library tidak langsung mengubah layar audiens.
- Fitur edit slide: tulis balik `layers` ke item `kind: 'slide'`.
- Putuskan nasib impor `.probundle` (dijadikan grup library atau tetap menimpa grid).
- `syncBundle` di `library.js`: belum dibaca, perlu didokumentasikan.
- Isi `preview.js`, `properties.js`, `audience.js`, `background-panel.js`: belum dibaca.