import re
import sys

def extract_strings(file_path, min_length=4):
    with open(file_path, "rb") as f:
        content = f.read()
    
    # Mencari pola karakter teks yang valid (ASCII/UTF-8) di dalam file biner
    pattern = b"[\x20-\x7E]{" + str(min_length).encode() + b",}"
    strings = re.findall(pattern, content)
    
    print(f"Berhasil menemukan {len(strings)} potongan teks di dalam file:\n")
    for s in strings:
        try:
            print(s.decode("utf-8"))
        except UnicodeDecodeError:
            pass

if __name__ == "__main__":
    # Ganti 'presentation.pro' dengan nama file .pro Anda yang sebenarnya
    filename = "perfection.pro" 
    extract_strings(filename)