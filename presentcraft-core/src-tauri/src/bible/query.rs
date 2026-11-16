use serde::Serialize;
use super::*; // Translation, Ref, dan seterusnya

#[derive(Serialize, Clone)]
pub struct VerseOut {
    pub n: u32,
    pub text: String,
}

#[derive(Serialize, Clone)]
pub struct Passage {
    pub book_id: String,
    pub book: String,
    pub chapter: u32,
    pub label: String,
    pub verses: Vec<VerseOut>,
    pub translation: String,
    pub license: String,
    pub attribution: String,
}

pub fn passage(t: &Translation, r: &Ref) -> Result<Passage, String> {
    let def = &BOOKS[r.book];
    let name = book_name(def, &t.meta.lang);
    let book = t
        .books
        .iter()
        .find(|b| b.id == def.id)
        .ok_or_else(|| format!("{name} is not in this translation."))?;
    let chap = book
        .chapters
        .get(r.chapter as usize - 1)
        .ok_or_else(|| format!("{name} has no chapter {}.", r.chapter))?;
    let (a, b) = match (r.from, r.to) {
        (None, _) => (1, chap.len() as u32),
        (Some(a), None) => (a, a),
        (Some(a), Some(b)) => (a.min(b), a.max(b)),
    };
    let verses: Vec<VerseOut> = (a..=b)
        .filter_map(|n| {
            let text = chap.get((n as usize).checked_sub(1)?)?;
            (!text.is_empty()).then(|| VerseOut { n, text: text.clone() })
        })
        .collect();
    let (first, last) = match (verses.first(), verses.last()) {
        (Some(f), Some(l)) => (f.n, l.n),
        _ => return Err("No such verse in this translation.".into()),
    };
    let label = if r.from.is_none() {
        format!("{name} {}", r.chapter)
    } else if first == last {
        format!("{name} {}:{first}", r.chapter)
    } else {
        format!("{name} {}:{first}-{last}", r.chapter)
    };
    Ok(Passage {
        book_id: def.id.to_string(),
        book: name.to_string(),
        chapter: r.chapter,
        label,
        verses,
        translation: t.meta.name.clone(),
        license: t.meta.license.clone(),
        attribution: t.meta.attribution.clone(),
    })
}

#[derive(Serialize, Clone)]
pub struct Hit {
    pub book_id: String,
    pub book: String,
    pub chapter: u32,
    pub verse: u32,
    pub text: String,
}

/// Every word must appear (case-insensitive), in canonical book order.
pub fn search(t: &Translation, query: &str, limit: usize) -> Vec<Hit> {
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    let mut out = Vec::new();
    if words.is_empty() {
        return out;
    }
    for b in &t.books {
        let Some(i) = book_by_id(&b.id) else { continue };
        let name = book_name(&BOOKS[i], &t.meta.lang);
        for (ci, chap) in b.chapters.iter().enumerate() {
            for (vi, text) in chap.iter().enumerate() {
                if text.is_empty() {
                    continue;
                }
                let low = text.to_lowercase();
                if words.iter().all(|w| low.contains(w)) {
                    out.push(Hit {
                        book_id: b.id.clone(),
                        book: name.to_string(),
                        chapter: ci as u32 + 1,
                        verse: vi as u32 + 1,
                        text: text.clone(),
                    });
                    if out.len() >= limit {
                        return out;
                    }
                }
            }
        }
    }
    out
}