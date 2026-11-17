use super::{Book, Meta, Translation};
use rusqlite::{config::DbConfig, params, Connection, OpenFlags};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

const MAX_CHAPTERS: usize = 200;
const MAX_VERSES: usize = 300;

pub fn load_translations_from_sqlite(db_path: &Path) -> Result<Vec<Arc<Translation>>, String> {
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Gagal membuka SQLite: {}", e))?;

    // Nonaktifkan trigger demi keamanan saat membaca file eksternal
    let _ = conn.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_TRIGGER, false);

    // Validasi struktur biner file sebelum membaca tabel
    let integrity: String = conn
        .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
        .map_err(|e| format!("Gagal memeriksa integritas SQLite: {}", e))?;
    if !integrity.eq_ignore_ascii_case("ok") {
        return Err("File SQLite korup atau tidak valid".into());
    }

    // 1. Ambil daftar versi
    let mut v_stmt = conn
        .prepare("SELECT id, name, language_code, COALESCE(copyright, '') FROM versions")
        .map_err(|e| e.to_string())?;

    let versions: Vec<Meta> = v_stmt
        .query_map([], |row| {
            let copy: String = row.get(3)?;
            Ok(Meta {
                id: row.get(0)?,
                name: row.get(1)?,
                lang: row.get(2)?,
                license: if copy.is_empty() { "Unknown".into() } else { copy.clone() },
                attribution: copy,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Data tabel versions tidak valid: {}", e))?;

    // 2. Peta cepat book_number -> usfm_code
    let mut b_stmt = conn
        .prepare("SELECT book_number, usfm_code FROM books")
        .map_err(|e| e.to_string())?;

    let book_map: HashMap<i32, String> = b_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<HashMap<_, _>, _>>()
        .map_err(|e| format!("Data tabel books tidak valid: {}", e))?;

    // 3. Bangun struct Translation dalam satu lintasan tanpa HashMap bersarang
    let mut translations = Vec::with_capacity(versions.len());

    for meta in versions {
        let mut verse_stmt = conn
            .prepare(
                "SELECT book_number, chapter, verse, text
                 FROM verses
                 WHERE version_id = ?1
                 ORDER BY book_number ASC, chapter ASC, verse ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = verse_stmt
            .query_map(params![&meta.id], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut books: Vec<Book> = Vec::new();
        let mut current_book_num: Option<i32> = None;

        for row in rows {
            let (b_num, chap_raw, verse_raw, text) =
                row.map_err(|e| format!("Baris ayat korup pada versi {}: {}", meta.id, e))?;

            // Validasi angka positif sebelum konversi ke usize
            let Ok(chap) = usize::try_from(chap_raw) else { continue };
            let Ok(verse) = usize::try_from(verse_raw) else { continue };
            if chap == 0 || verse == 0 {
                continue;
            }

            // Proteksi terhadap alokasi vektor raksasa penyebab OOM
            if chap > MAX_CHAPTERS || verse > MAX_VERSES {
                return Err(format!(
                    "Indeks pasal atau ayat melebihi batas wajar pada kitab nomor {}",
                    b_num
                ));
            }

            let Some(usfm_code) = book_map.get(&b_num) else {
                continue;
            };

            if current_book_num != Some(b_num) {
                books.push(Book {
                    id: usfm_code.clone(),
                    chapters: Vec::new(),
                });
                current_book_num = Some(b_num);
            }

            let book = books.last_mut().unwrap();
            if book.chapters.len() < chap {
                book.chapters.resize_with(chap, Vec::new);
            }

            let verses_vec = &mut book.chapters[chap - 1];
            if verses_vec.len() < verse {
                verses_vec.resize(verse, String::new());
            }
            verses_vec[verse - 1] = text;
        }

        translations.push(Arc::new(Translation { meta, books }));
    }

    Ok(translations)
}