// ---------------------------------------------------------------- USFM
use super::*;
use std::{fs, io::Read, path::Path};

pub(super) struct ParsedBook {
    pub code: String,
    pub chapters: Vec<Vec<String>>,
}

// Markers whose text is not scripture (titles, headings, intro material, alternate numbering).
const SKIP: &[&str] = &[
    "ide", "usfm", "h", "toc", "mt", "mte", "imt", "ms", "mr", "s", "sr", "r", "rq", "sp", "cl", "cd",
    "rem", "sts", "periph", "lit", "va", "vp", "ca", "cp", "qa", "is", "ip", "ib", "io", "iot", "imi",
    "ili", "ipi", "ie", "im", "imq", "ipq", "ipr", "iq", "iex", "ior",
];

fn put(chapters: &mut [Vec<String>], ch: usize, vs: usize, s: &str) {
    if ch == 0 || vs == 0 || ch > chapters.len() {
        return;
    }
    let c = &mut chapters[ch - 1];
    if c.len() < vs {
        c.resize(vs, String::new());
    }
    c[vs - 1].push_str(s);
}

/// Leading number of a chapter/verse marker. Skips a bridge ("3-4") and a part letter ("3a").
/// Returns (number, remaining text without the single separating space).
fn leading_number(s: &str) -> (usize, &str) {
    let s = s.trim_start();
    let end = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
    let n = s[..end].parse::<usize>().unwrap_or(0);
    let mut rest = &s[end..];
    if let Some(r) = rest.strip_prefix(['-', '–']) {
        let e = r.find(|c: char| !c.is_ascii_digit()).unwrap_or(r.len());
        if e > 0 {
            rest = &r[e..];
        }
    }
    if let Some(c) = rest.chars().next() {
        if c.is_ascii_alphabetic() && rest[1..].starts_with(char::is_whitespace) {
            rest = &rest[1..];
        }
    }
    (n, rest.strip_prefix(char::is_whitespace).unwrap_or(rest))
}

pub fn parse_usfm(text: &str) -> Option<ParsedBook> {
    let text = text.trim_start_matches('\u{feff}');
    let mut code = String::new();
    let mut chapters: Vec<Vec<String>> = Vec::new();
    let (mut ch, mut vs) = (0usize, 0usize);
    let mut skip = false; // inside a footnote, cross-reference or figure
    let mut preface = String::new(); // \d (psalm title) text, merged into verse 1

    for seg in text.split('\\').skip(1) {
        let end = seg
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '+'))
            .unwrap_or(seg.len());
        let (name, after) = seg.split_at(end);
        if after.starts_with("-s") || after.starts_with("-e") {
            continue; // USFM 3 milestone: carries attributes, no text
        }
        let closing = after.starts_with('*');
        let mut rest = if closing { &after[1..] } else { after };
        if !closing {
            rest = rest.strip_prefix(char::is_whitespace).unwrap_or(rest);
        }
        let base = name
            .trim_start_matches('+')
            .trim_end_matches(|c: char| c.is_ascii_digit());

        match base {
            "id" => {
                if code.is_empty() {
                    code = rest.trim().chars().take(3).collect::<String>().to_uppercase();
                }
            }
            "c" => {
                skip = false;
                let (n, _) = leading_number(rest);
                ch = if n > 0 { n } else { ch + 1 };
                vs = 0;
                preface.clear();
                if chapters.len() < ch {
                    chapters.resize(ch, Vec::new());
                }
            }
            "v" => {
                skip = false;
                let (n, tail) = leading_number(rest);
                if ch == 0 || n == 0 {
                    continue;
                }
                vs = n;
                if vs == 1 && !preface.is_empty() {
                    let p = std::mem::take(&mut preface);
                    put(&mut chapters, ch, vs, &p);
                }
                put(&mut chapters, ch, vs, tail);
            }
            "f" | "fe" | "ef" | "x" | "ex" | "fig" => skip = !closing,
            _ if skip => {}
            b if SKIP.contains(&b) => {}
            "d" => {
                if vs == 0 {
                    preface.push_str(rest);
                    preface.push(' ');
                }
            }
            "w" | "wg" | "wh" | "wa" => {
                // \w word|attributes\w*: keep the word, drop the attributes
                let t = if closing { rest } else { rest.split('|').next().unwrap_or("") };
                put(&mut chapters, ch, vs, t);
            }
            _ => put(&mut chapters, ch, vs, rest),
        }
    }

    for c in chapters.iter_mut() {
        for v in c.iter_mut() {
            *v = v.split_whitespace().collect::<Vec<_>>().join(" ");
        }
    }
    if code.is_empty() {
        None
    } else {
        Some(ParsedBook { code, chapters })
    }
}

// ---------------------------------------------------------------- import / storage

pub fn import_zip(path: &Path, meta: &Meta) -> Result<Translation, String> {
    safe_id(&meta.id)?;
    let file = fs::File::open(path).map_err(|e| format!("Cannot open file: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Not a valid zip file: {e}"))?;
    let mut found: HashMap<usize, Vec<Vec<String>>> = HashMap::new();

    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_lowercase();
        if !(name.ends_with(".usfm") || name.ends_with(".sfm")) || f.size() > 20_000_000 {
            continue;
        }
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if let Some(p) = parse_usfm(&String::from_utf8_lossy(&bytes)) {
            if let Some(idx) = book_by_id(&p.code) {
                found.entry(idx).or_insert(p.chapters);
            }
        }
    }
    if found.is_empty() {
        return Err("No USFM books found in this file.".into());
    }
    let mut order: Vec<usize> = found.keys().copied().collect();
    order.sort_unstable();
    let books = order
        .into_iter()
        .filter_map(|i| {
            found.remove(&i).map(|chapters| Book {
                id: BOOKS[i].id.to_string(),
                chapters,
            })
        })
        .collect();
    Ok(Translation { meta: meta.clone(), books })
}
