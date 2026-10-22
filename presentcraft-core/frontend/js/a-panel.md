File	Isi
index.html	Kerangka halaman Control Center: panel Media, Slide, Properties, toolbar Bible, panel Background (judul dengan mata dan ukuran thumbnail)
panes.css	Gaya panel utama: grid slide dan background, preview, slider ukuran, tombol mata, pemisah judul panel
bottom.css	Gaya panel bawah (Background): daftar grup, tile .bgt, kolom grid #bg-grid (harus memakai var(--bgt))
editor.css	Gaya editor slide: panel Properties, baris satuan .ed-line, tombol rata, daftar layer
main.js	Pintu masuk: memasang semua modul, mendengarkan perubahan background dan visibilitasnya, kabar "audience-ready"
background-state.js	Pemilik tunggal state background: pilihan, simpan ke disk, event ganti, dan status tampil/sembunyi (mata)
background-panel.js	Panel Background: grid tile, klik kanan (Scale, Opacity, Loop, Mute), mata, zoom ukuran thumbnail, drag & drop file
tree.js	Menu popup (showPopup, fillMenu): tanda pilihan di menu klik kanan
preview.js	Preview di panel kanan: render slide dan background, transport video, mengikuti status mata
sorter.js	Grid slide di tengah: kartu, urutan, navigasi, toggleBlank (mata slide), zoom ukuran slide
toolbar.js	Tombol toolbar (Bible, mata slide) dan pintasan keyboard (B, panah, Ctrl+O)
audience.js	Mengirim slide ke layar audience (toPayload, emitPayload, emitBlank, setBlanked)
audience (HTML)	Halaman layar audience: menampilkan slide dan background, menyembunyikan background saat mata ditutup
fields.js	Daftar FIELDS Properties editor, daftar satuan (posisi, ukuran, font), tombol ratakan, helper nilai layer
inspector.js	Panel Properties editor: membangun baris dari FIELDS, dropdown satuan, tombol aksi
canvas.js	Render pratinjau editor dan kotak pemilih layer (tidak berubah, satuan tetap persen)