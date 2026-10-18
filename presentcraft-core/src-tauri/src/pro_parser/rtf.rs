//! RTF → teks biasa. Mandiri: tidak bergantung modul lain.

fn cp1252(b: u8) -> char {
    match b {
        0x80 => '\u{20AC}',
        0x85 => '\u{2026}',
        0x91 => '\u{2018}',
        0x92 => '\u{2019}',
        0x93 => '\u{201C}',
        0x94 => '\u{201D}',
        0x95 => '\u{2022}',
        0x96 => '\u{2013}',
        0x97 => '\u{2014}',
        0x99 => '\u{2122}',
        _ => b as char,
    }
}

/// Ekstraktor RTF sederhana: melewati header (fonttbl, colortbl, {\* ...}),
/// menangani \'XX, \uN dengan \ucN, \par, \line, \tab, dan backslash+newline.
pub(super) fn rtf_to_text(s: &[u8]) -> String {
    let (mut i, mut depth) = (0usize, 0i32);
    let mut skip: Option<i32> = None;
    let mut uc = 1usize;
    let mut pending_hi: Option<u32> = None;
    let mut out = String::new();

    while i < s.len() {
        match s[i] {
            b'{' => {
                depth += 1;
                i += 1;
                let rest = &s[i..];
                if skip.is_none()
                    && [
                        &b"\\*"[..],
                        b"\\fonttbl",
                        b"\\colortbl",
                        b"\\stylesheet",
                        b"\\info",
                    ]
                    .iter()
                    .any(|p| rest.starts_with(p))
                {
                    skip = Some(depth);
                }
            }
            b'}' => {
                if skip == Some(depth) {
                    skip = None;
                }
                depth -= 1;
                i += 1;
            }
            b'\r' | b'\n' => i += 1,
            b'\\' => {
                i += 1;
                if i >= s.len() {
                    break;
                }
                match s[i] {
                    b'\\' | b'{' | b'}' => {
                        if skip.is_none() {
                            out.push(s[i] as char);
                        }
                        i += 1;
                    }
                    b'\n' | b'\r' => {
                        if skip.is_none() {
                            out.push('\n');
                        }
                        i += 1;
                    }
                    b'~' => {
                        if skip.is_none() {
                            out.push('\u{00A0}');
                        }
                        i += 1;
                    }
                    b'\'' => {
                        if i + 2 < s.len() {
                            if let Ok(h) = std::str::from_utf8(&s[i + 1..i + 3]) {
                                if let Ok(b) = u8::from_str_radix(h, 16) {
                                    if skip.is_none() {
                                        out.push(cp1252(b));
                                    }
                                }
                            }
                        }
                        i += 3;
                    }
                    c if c.is_ascii_alphabetic() => {
                        let st = i;
                        while i < s.len() && s[i].is_ascii_alphabetic() {
                            i += 1;
                        }
                        let word = &s[st..i];
                        let ns = i;
                        if i < s.len() && s[i] == b'-' {
                            i += 1;
                        }
                        while i < s.len() && s[i].is_ascii_digit() {
                            i += 1;
                        }
                        let param = std::str::from_utf8(&s[ns..i])
                            .ok()
                            .and_then(|p| p.parse::<i32>().ok());
                        if i < s.len() && s[i] == b' ' {
                            i += 1;
                        }
                        if skip.is_none() {
                            match word {
                                b"par" | b"line" => out.push('\n'),
                                b"tab" => out.push('\t'),
                                b"uc" => {
                                    if let Some(n) = param {
                                        uc = n.max(0) as usize;
                                    }
                                }
                                b"u" => {
                                    if let Some(n) = param {
                                        let cp = if n < 0 { (n + 65536) as u32 } else { n as u32 };
                                        match cp {
                                            0xD800..=0xDBFF => pending_hi = Some(cp),
                                            0xDC00..=0xDFFF => {
                                                if let Some(hi) = pending_hi.take() {
                                                    let full =
                                                        0x10000 + ((hi - 0xD800) << 10) + (cp - 0xDC00);
                                                    if let Some(ch) = char::from_u32(full) {
                                                        out.push(ch);
                                                    }
                                                }
                                            }
                                            _ => {
                                                if let Some(ch) = char::from_u32(cp) {
                                                    out.push(ch);
                                                }
                                            }
                                        }
                                        // lewati `uc` unit fallback
                                        for _ in 0..uc {
                                            if i + 3 < s.len() && s[i] == b'\\' && s[i + 1] == b'\'' {
                                                i += 4;
                                            } else if i < s.len() {
                                                i += 1;
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => i += 1,
                }
            }
            c => {
                if skip.is_none() && depth >= 1 {
                    out.push(cp1252(c));
                }
                i += 1;
            }
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_only_is_empty() {
        let rtf = br"{\rtf0\ansi\ansicpg1252{\fonttbl\f0\fnil ArialMT;}{\colortbl;\red0\green0\blue0;}{\*\expandedcolortbl;\csgenericrgb\c0\c0\c0\c100000;}{\*\listtable}{\*\listoverridetable}\uc1\paperw12240\margl0\pard\li0\ql\f0\fs100\cf1\cb3}";
        assert_eq!(rtf_to_text(rtf), "");
    }

    #[test]
    fn hex_escape_and_par() {
        let rtf = br"{\rtf0\ansi{\fonttbl\f0 Arial;}\f0\fs100 Caf\'e9 pagi\par Baris dua}";
        assert_eq!(rtf_to_text(rtf), "Café pagi\nBaris dua");
    }

    #[test]
    fn backslash_newline_is_line_break() {
        assert_eq!(rtf_to_text(b"{\\rtf0 Satu\\\nDua}"), "Satu\nDua");
    }

    #[test]
    fn unicode_with_fallback() {
        assert_eq!(rtf_to_text(b"{\\rtf0\\uc1 a\\u225?b}"), "aáb");
        assert_eq!(rtf_to_text(b"{\\rtf0\\uc2 a\\u233\\'e9\\'e9b}"), "aéb");
    }

    #[test]
    fn unicode_surrogate_pair() {
        // U+1F600 = D83D DE00 → -10179 -8704
        assert_eq!(rtf_to_text(b"{\\rtf0\\uc1 \\u-10179?\\u-8704?}"), "😀");
    }
}