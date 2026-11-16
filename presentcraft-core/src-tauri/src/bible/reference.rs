// ---------------------------------------------------------------- references / lookup / search
use super::*;

#[derive(Debug, PartialEq, Clone)]
pub struct Ref {
    pub book: usize,
    pub chapter: u32,
    pub from: Option<u32>,
    pub to: Option<u32>,
}

/// "Yoh 3:16-18", "1 Kor 13", "John 3:16", "1Kor13:4", "Mazmur 23".
pub fn parse_ref(input: &str) -> Result<Ref, String> {
    let mut s = input.trim().replace(['–', '—'], "-");
    for (a, b) in [(" :", ":"), (": ", ":"), (" -", "-"), ("- ", "-")] {
        while s.contains(a) {
            s = s.replace(a, b);
        }
    }
    let split = s
        .rfind(|c: char| !(c.is_ascii_digit() || c == ':' || c == '-'))
        .map(|i| i + s[i..].chars().next().map_or(0, char::len_utf8))
        .unwrap_or(0);
    let (book_part, spec) = s.split_at(split);
    if spec.is_empty() || !spec.starts_with(|c: char| c.is_ascii_digit()) {
        return Err("Type a chapter after the book, for example: John 3:16".into());
    }
    let book = *book_index()
        .get(&norm(book_part))
        .ok_or_else(|| format!("Unknown book: {}", book_part.trim()))?;

    let bad = || "Invalid reference. Example: John 3:16-18".to_string();
    let (cpart, vpart) = match spec.split_once(':') {
        Some((c, v)) => (c, Some(v)),
        None => (spec, None),
    };
    let chapter: u32 = cpart.parse().map_err(|_| bad())?;
    if chapter == 0 {
        return Err(bad());
    }
    let (from, to) = match vpart {
        None => (None, None),
        Some(v) => match v.split_once('-') {
            Some((a, b)) => (Some(a.parse().map_err(|_| bad())?), Some(b.parse().map_err(|_| bad())?)),
            None => (Some(v.parse().map_err(|_| bad())?), None),
        },
    };
    Ok(Ref { book, chapter, from, to })
}