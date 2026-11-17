js/
├── main.js                  ← hanya bootstrap: import & inisialisasi semua modul
├── core/
│   ├── state.js             ← data bersama (slide terpilih, daftar slide, dll.)
│   ├── events.js            ← pub/sub kecil antar modul
│   └── utils.js             ← helper umum
├── services/
│   ├── storage.js           ← simpan/muat data
│   ├── media-import.js      ← upload/drag-drop file video & gambar
│   └── audience-output.js   ← layar audiens, blank (tombol B)
└── ui/
    ├── menubar.js
    ├── library.js           ← panel Media
    ├── sorter.js            ← grid slide, zoom, edit
    ├── props.js             ← rotasi, opacity, align
    ├── preview.js           ← kontrol video (seek, loop, speed)
    ├── background-panel.js  ← explorer + grid background
    ├── bible.js             ← tombol toolbar Alkitab
    └── editor.js