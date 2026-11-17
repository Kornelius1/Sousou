// ---------------------------------------------------------------- books
use std::{collections::HashMap, sync::OnceLock};

pub(super) struct BookDef {
    pub(super) id: &'static str,
    pub(super) id_name: &'static str,
    pub(super) en_name: &'static str,
    pub(super) abbr: &'static [&'static str],
}

macro_rules! b {
    ($id:expr, $idn:expr, $en:expr, [$($a:expr),*]) => {
        BookDef { id: $id, id_name: $idn, en_name: $en, abbr: &[$($a),*] }
    };
}

pub(super) const BOOKS: [BookDef; 75] = [
    // Old Testament (0..38)
    b!("GEN", "Kejadian", "Genesis", ["kej", "gen", "ge"]),
    b!("EXO", "Keluaran", "Exodus", ["kel", "exod", "ex"]),
    b!("LEV", "Imamat", "Leviticus", ["im", "lev", "le"]),
    b!("NUM", "Bilangan", "Numbers", ["bil", "num", "nu"]),
    b!("DEU", "Ulangan", "Deuteronomy", ["ul", "deut", "dt"]),
    b!("JOS", "Yosua", "Joshua", ["yos", "josh"]),
    b!("JDG", "Hakim-hakim", "Judges", ["hak", "judg"]),
    b!("RUT", "Rut", "Ruth", ["ru"]),
    b!("1SA", "1 Samuel", "1 Samuel", ["1sam"]),
    b!("2SA", "2 Samuel", "2 Samuel", ["2sam"]),
    b!("1KI", "1 Raja-raja", "1 Kings", ["1raj", "1kgs"]),
    b!("2KI", "2 Raja-raja", "2 Kings", ["2raj", "2kgs"]),
    b!("1CH", "1 Tawarikh", "1 Chronicles", ["1taw", "1chr"]),
    b!("2CH", "2 Tawarikh", "2 Chronicles", ["2taw", "2chr"]),
    b!("EZR", "Ezra", "Ezra", []),
    b!("NEH", "Nehemia", "Nehemiah", ["neh"]),
    b!("EST", "Ester", "Esther", ["est"]),
    b!("JOB", "Ayub", "Job", ["ayb"]),
    b!("PSA", "Mazmur", "Psalms", ["mzm", "ps", "psalm"]),
    b!("PRO", "Amsal", "Proverbs", ["ams", "prov", "pr"]),
    b!("ECC", "Pengkhotbah", "Ecclesiastes", ["pkh", "eccl", "eccles"]),
    b!("SNG", "Kidung Agung", "Song of Solomon", ["kid", "song", "sos", "songofsongs"]),
    b!("ISA", "Yesaya", "Isaiah", ["yes"]),
    b!("JER", "Yeremia", "Jeremiah", ["yer"]),
    b!("LAM", "Ratapan", "Lamentations", ["rat"]),
    b!("EZK", "Yehezkiel", "Ezekiel", ["yeh", "ezek", "eze"]),
    b!("DAN", "Daniel", "Daniel", []),
    b!("HOS", "Hosea", "Hosea", []),
    b!("JOL", "Yoel", "Joel", ["yl"]),
    b!("AMO", "Amos", "Amos", ["am"]),
    b!("OBA", "Obaja", "Obadiah", ["ob", "obad"]),
    b!("JON", "Yunus", "Jonah", ["yun"]),
    b!("MIC", "Mikha", "Micah", ["mi", "mik"]),
    b!("NAM", "Nahum", "Nahum", ["nah"]),
    b!("HAB", "Habakuk", "Habakkuk", []),
    b!("ZEP", "Zefanya", "Zephaniah", ["zef", "zeph"]),
    b!("HAG", "Hagai", "Haggai", []),
    b!("ZEC", "Zakharia", "Zechariah", ["za", "zak", "zech"]),
    b!("MAL", "Maleakhi", "Malachi", []),
    // New Testament (39..65)
    b!("MAT", "Matius", "Matthew", ["mat", "matt", "mt"]),
    b!("MRK", "Markus", "Mark", ["mrk", "mk", "mar"]),
    b!("LUK", "Lukas", "Luke", ["luk", "lk"]),
    b!("JHN", "Yohanes", "John", ["yoh", "jn"]),
    b!("ACT", "Kisah Para Rasul", "Acts", ["kis"]),
    b!("ROM", "Roma", "Romans", ["rm", "ro"]),
    b!("1CO", "1 Korintus", "1 Corinthians", ["1kor", "1cor"]),
    b!("2CO", "2 Korintus", "2 Corinthians", ["2kor", "2cor"]),
    b!("GAL", "Galatia", "Galatians", []),
    b!("EPH", "Efesus", "Ephesians", ["ef"]),
    b!("PHP", "Filipi", "Philippians", ["flp", "phil"]),
    b!("COL", "Kolose", "Colossians", ["kol"]),
    b!("1TH", "1 Tesalonika", "1 Thessalonians", ["1tes", "1thess"]),
    b!("2TH", "2 Tesalonika", "2 Thessalonians", ["2tes", "2thess"]),
    b!("1TI", "1 Timotius", "1 Timothy", ["1tim"]),
    b!("2TI", "2 Timotius", "2 Timothy", ["2tim"]),
    b!("TIT", "Titus", "Titus", []),
    b!("PHM", "Filemon", "Philemon", ["flm", "phlm"]),
    b!("HEB", "Ibrani", "Hebrews", ["ibr"]),
    b!("JAS", "Yakobus", "James", ["yak", "jam"]),
    b!("1PE", "1 Petrus", "1 Peter", ["1ptr", "1pet"]),
    b!("2PE", "2 Petrus", "2 Peter", ["2ptr", "2pet"]),
    b!("1JN", "1 Yohanes", "1 John", ["1yoh", "1jhn"]),
    b!("2JN", "2 Yohanes", "2 John", ["2yoh", "2jhn"]),
    b!("3JN", "3 Yohanes", "3 John", ["3yoh", "3jhn"]),
    b!("JUD", "Yudas", "Jude", ["yud"]),
    b!("REV", "Wahyu", "Revelation", ["why", "re"]),
    // Deuterocanonical (66..74)
    b!("TOB", "Tobit", "Tobit", ["tob", "tb"]),
    b!("JDT", "Yudit", "Judith", ["ydt", "yd", "jdt", "jth"]),
    b!("ESG", "Tambahan Ester", "Additions to Esther", ["estyun", "tambest", "test", "addesth", "esthgr"]),
    b!("WIS", "Kebijaksanaan Salomo", "Wisdom", ["keb", "kebsal", "kb", "wis", "wisdomofsolomon", "wisd"]),
    b!("SIR", "Yesus bin Sirakh", "Sirach", ["sir", "si", "ecclus", "ecclesiasticus"]),
    b!("BAR", "Barukh", "Baruch", ["bar", "br"]),
    b!("S3Y", "Tambahan Daniel", "Additions to Daniel", ["danyun", "tambdan", "tdan", "doaazarya", "prazar", "songofthethree", "sus", "bel"]),
    b!("1MA", "1 Makabe", "1 Maccabees", ["1mak", "1mk", "1macc", "1mac"]),
    b!("2MA", "2 Makabe", "2 Maccabees", ["2mak", "2mk", "2macc", "2mac"]),
];

/// Lowercase, letters and digits only: "1 Kor." -> "1kor".
pub(super) fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn book_keys(b: &BookDef) -> Vec<String> {
    [b.id, b.id_name, b.en_name]
        .into_iter()
        .chain(b.abbr.iter().copied())
        .map(norm)
        .collect()
}

pub(super) fn book_index() -> &'static HashMap<String, usize> {
    static MAP: OnceLock<HashMap<String, usize>> = OnceLock::new();
    MAP.get_or_init(|| {
        let mut m = HashMap::new();
        for (i, b) in BOOKS.iter().enumerate() {
            for k in book_keys(b) {
                m.entry(k).or_insert(i);
            }
        }
        m
    })
}

pub(super) fn book_by_id(id: &str) -> Option<usize> {
    BOOKS.iter().position(|b| b.id == id)
}

pub(super) fn book_name(def: &BookDef, lang: &str) -> &'static str {
    let l = lang.to_lowercase();
    if l == "id" || l.starts_with("ind") || l.starts_with("id-") {
        def.id_name
    } else {
        def.en_name
    }
}