
// ---------------------------------------------------------------- tests

#[cfg(test)]
use super::*;
use std::io::Write;

const GEN: &str = "\\id GEN Test Bible\n\\h Genesis\n\\c 1\n\\s1 The Beginning\n\\p\n\
\\v 1 In the beginning, \\w God|lemma=\"elohim\"\\w* created the heavens and the earth.\\f + \\fr 1:1 \\ft A note.\\f*\n\
\\v 2 The earth was formless.\n\\q1 Poetry line\n\\q2 second line\n\\v 3-4 Bridged text\n\\c 2\n\\d A Psalm of David.\n\\v 1 The LORD is my shepherd.\n";
const JHN: &str = "\\id JHN\n\\c 3\n\\p\n\\v 16 For God so loved the world.\n\\v 17 He did not send the Son to condemn.\n";

fn tmp(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("bible_test_{}_{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
}

fn meta() -> Meta {
    Meta {
        id: "tst".into(),
        name: "Test Bible".into(),
        lang: "eng".into(),
        license: "CC BY-SA 4.0".into(),
        attribution: "Test attribution".into(),
    }
}

fn make_zip(dir: &Path) -> PathBuf {
    let path = dir.join("t_usfm.zip");
    let mut z = zip::ZipWriter::new(fs::File::create(&path).unwrap());
    let o = zip::write::SimpleFileOptions::default();
    for (n, c) in [("01-GENtst.usfm", GEN), ("44-JHNtst.usfm", JHN), ("readme.txt", "ignore me")] {
        z.start_file(n, o).unwrap();
        z.write_all(c.as_bytes()).unwrap();
    }
    z.finish().unwrap();
    path
}

#[test]
fn parses_usfm() {
    let p = parse_usfm(GEN).unwrap();
    assert_eq!(p.code, "GEN");
    assert_eq!(p.chapters[0][0], "In the beginning, God created the heavens and the earth.");
    assert_eq!(p.chapters[0][1], "The earth was formless. Poetry line second line");
    assert_eq!(p.chapters[0][2], "Bridged text");
    assert_eq!(p.chapters[0].len(), 3); // "3-4" is stored under verse 3 only
    assert_eq!(p.chapters[1][0], "A Psalm of David. The LORD is my shepherd.");
}

#[test]
fn book_aliases_do_not_collide() {
    let mut seen: HashMap<String, usize> = HashMap::new();
    for (i, b) in BOOKS.iter().enumerate() {
        for k in book_keys(b) {
            if let Some(&j) = seen.get(&k) {
                assert_eq!(i, j, "alias '{k}' used by two different books");
            }
            seen.insert(k, i);
        }
    }
}

#[test]
fn parses_references() {
    let jhn = book_by_id("JHN").unwrap();
    let cor = book_by_id("1CO").unwrap();
    let r = |b, c, f, t| Ref { book: b, chapter: c, from: f, to: t };
    assert_eq!(parse_ref("Yoh 3:16-18").unwrap(), r(jhn, 3, Some(16), Some(18)));
    assert_eq!(parse_ref("John 3:16").unwrap(), r(jhn, 3, Some(16), None));
    assert_eq!(parse_ref("john3:16").unwrap(), r(jhn, 3, Some(16), None));
    assert_eq!(parse_ref("1 Kor 13").unwrap(), r(cor, 13, None, None));
    assert_eq!(parse_ref("1Kor13:4 - 7").unwrap(), r(cor, 13, Some(4), Some(7)));
    assert_eq!(parse_ref("Mazmur 23").unwrap().book, book_by_id("PSA").unwrap());
    assert!(parse_ref("Foo 3:16").is_err());
    assert!(parse_ref("Yoh").is_err());
    assert!(parse_ref("Yoh 0:1").is_err());
}

#[test]
fn import_store_lookup_search() {
    let dir = tmp("e2e");
    let t = import_zip(&make_zip(&dir), &meta()).unwrap();
    assert_eq!(t.books.len(), 2);
    assert_eq!(t.books[0].id, "GEN"); // canonical order
    save(&dir.join("bible"), &t).unwrap();

    let listed = list(&dir.join("bible"));
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].books, 2);

    let st = BibleState::default();
    let loaded = load(&dir.join("bible"), &st, "tst").unwrap();
    let p = passage(&loaded, &parse_ref("John 3:16-17").unwrap()).unwrap();
    assert_eq!(p.label, "John 3:16-17");
    assert_eq!(p.verses.len(), 2);
    assert_eq!(p.attribution, "Test attribution");
    assert!(passage(&loaded, &parse_ref("John 3:99").unwrap()).is_err());
    assert!(passage(&loaded, &parse_ref("Matt 1:1").unwrap()).is_err()); // not installed

    let g = passage(&loaded, &parse_ref("Gen 1").unwrap()).unwrap();
    assert_eq!(g.label, "Genesis 1");
    assert_eq!(g.verses.len(), 3); // verse 4 is bridged into 3

    let hits = search(&loaded, "world LOVED", 10);
    assert_eq!(hits.len(), 1);
    assert_eq!((hits[0].chapter, hits[0].verse), (3, 16));
    assert!(search(&loaded, "", 10).is_empty());

    assert!(remove(&dir.join("bible"), "tst").unwrap());
    assert!(list(&dir.join("bible")).is_empty());
    assert!(safe_id("../evil").is_err());
}

#[test]
fn localized_names() {
    let mut m = meta();
    m.lang = "ind".into();
    let dir = tmp("id");
    let t = import_zip(&make_zip(&dir), &m).unwrap();
    let p = passage(&t, &parse_ref("Yoh 3:16").unwrap()).unwrap();
    assert_eq!(p.label, "Yohanes 3:16");
}
