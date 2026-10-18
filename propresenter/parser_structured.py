import re
import json

def clean_rtf_lyrics(rtf_text):
    if "strokec2" in rtf_text:
        parts = rtf_text.split("strokec2")
        text = parts[-1]
    else:
        text = rtf_text

    text = re.sub(r'[0-9]+\\u[0-9]+[A-Z]', '', text)
    text = re.sub(r'0\u0001[A-Z]', '', text)
    
    text = text.replace("\\'92", "'")
    text = text.replace("\\'91", "'")
    text = text.replace("\\'3f", "?")
    
    text = re.sub(r'\\[a-z0-9\-]+', '', text)
    text = text.replace('\\', '')
    text = re.sub(r'[{}]', '', text)
    text = re.sub(r'^-\d+\s+', '', text)
    
    # === [1] LETAKKAN RESUB 0 DI SINI (sebelum return text.strip()) ===
    # Menghapus angka '0' yang menempel di ujung string teks
    text = re.sub(r'0$', '', text)
    
    return text.strip()

def parse_pro_file_universal(file_path):
    with open(file_path, "rb") as f:
        content = f.read()
    
    rtf_pattern = rb"\{\\rtf1[^\x00-\x08]+"
    matches = re.findall(rtf_pattern, content)
    
    slides = []
    for match in matches:
        try:
            rtf_text = match.decode("utf-8", errors="ignore")
            cleaned = clean_rtf_lyrics(rtf_text)
            
            # === [2] LETAKKAN FILTER PENGECEKAN DI SINI ===
            # Memastikan teks valid, panjangnya pas, dan tidak mengandung simbol sampah seperti ';' atau '*'
            if (cleaned 
                and len(cleaned) > 1 
                and ";" not in cleaned 
                and not cleaned.startswith("*") 
                and not cleaned.isdigit()): # Mencegah teks yang isinya murni angka masuk
                
                slides.append({
                    "slide_number": len(slides) + 1,
                    "section": f"Slide {len(slides) + 1}",
                    "content": cleaned
                })
        except Exception:
            continue
            
    return slides

if __name__ == "__main__":
    filename = "perfection.pro"
    
    print("Memproses ulang file .pro dengan parser universal yang disempurnakan...")
    parsed_slides = parse_pro_file_universal(filename)
    
    output_file = "output_structured_slides.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(parsed_slides, f, indent=4, ensure_ascii=False)
        
    print(f"Sukses! Berhasil mengekstrak {len(parsed_slides)} slide bersih ke '{output_file}'.")