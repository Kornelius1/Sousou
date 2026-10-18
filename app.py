from flask import Flask, render_template_string, jsonify
import json
import os

app = Flask(__name__)

# Fungsi untuk memuat data slide dari file JSON yang sudah kita buat
def load_slides():
    if os.path.exists("output_structured_slides.json"):
        with open("output_structured_slides.json", "r", encoding="utf-8") as f:
            return json.load(f)
    return []

# Tampilan Operator (Control Panel)
OPERATOR_HTML = """
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>PresentCraft - Operator Panel</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1e1e1e; color: #fff; margin: 0; padding: 20px; }
        h1 { color: #4CAF50; }
        .container { display: flex; gap: 20px; }
        .slide-list { flex: 1; max-height: 80vh; overflow-y: auto; background: #2d2d2d; padding: 15px; border-radius: 8px; }
        .slide-item { padding: 10px; margin-bottom: 8px; background: #3d3d3d; border-radius: 4px; cursor: pointer; transition: 0.2s; }
        .slide-item:hover { background: #505050; }
        .slide-item.active { background: #4CAF50; color: white; font-weight: bold; }
        .preview-pane { flex: 1; background: #2d2d2d; padding: 20px; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
        .preview-screen { width: 100%; height: 300px; background: #000; display: flex; justify-content: center; align-items: center; font-size: 24px; padding: 20px; box-sizing: border-box; border-radius: 4px; white-space: pre-line; border: 2px solid #444; }
        button { margin-top: 15px; padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0b7dda; }
    </style>
</head>
<body>
    <h1>PresentCraft Control Panel</h1>
    <p>Klik tombol di bawah untuk membuka layar proyektor eksternal (Audience Display).</p>
    <a href="/display" target="_blank"><button>Buka Layar Proyektor (Display)</button></a>
    
    <div class="container" style="margin-top: 20px;">
        <div class="slide-list" id="slideList">
            <!-- Daftar slide akan dimuat lewat JavaScript -->
        </div>
        <div class="preview-pane">
            <h3>Pratinjau Langsung (Live Preview)</h3>
            <div class="preview-screen" id="previewText">Pilih slide untuk menampilkan</div>
        </div>
    </div>

    <script>
        let slides = [];
        let currentIndex = -1;

        async function fetchSlides() {
            let response = await fetch('/api/slides');
            slides = await response.json();
            let listContainer = document.getElementById('slideList');
            listContainer.innerHTML = '';
            
            slides.forEach((slide, index) => {
                let div = document.createElement('div');
                div.className = 'slide-item';
                div.innerText = `[Slide ${slide.slide_number}]\\n${slide.content.substring(0, 40)}...`;
                div.onclick = () => selectSlide(index);
                listContainer.appendChild(div);
            });
        }

        function selectSlide(index) {
            currentIndex = index;
            let items = document.querySelectorAll('.slide-item');
            items.forEach((item, idx) => {
                if(idx === index) item.classList.add('active');
                else item.classList.remove('active');
            });

            let currentSlide = slides[index];
            document.getElementById('previewText').innerText = currentSlide.content;

            // Kirim perintah ke server untuk memperbarui layar proyektor
            fetch('/api/set-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index: index })
            });
        }

        fetchSlides();
    </script>
</body>
</html>
"""

# Tampilan Layar Proyektor (Audience Display - Bersih tanpa tombol)
DISPLAY_HTML = """
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>PresentCraft - Audience Display</title>
    <style>
        body { background: #000; color: #fff; height: 100vh; margin: 0; display: flex; justify-content: center; align-items: center; text-align: center; font-family: 'Gotham', Arial, sans-serif; }
        #liveText { font-size: 64px; font-weight: bold; line-height: 1.4; padding: 40px; white-space: pre-line; text-shadow: 2px 2px 10px rgba(0,0,0,0.8); }
    </style>
</head>
<body>
    <div id="liveText">Memuat presentasi...</div>

    <script>
        async function checkLiveUpdate() {
            try {
                let response = await fetch('/api/get-live');
                let data = await response.json();
                document.getElementById('liveText').innerText = data.content;
            } catch (e) {
                console.log("Gagal menyinkronkan layar.");
            }
        }
        // Periksa pembaruan dari operator setiap 500 milidetik
        setInterval(checkLiveUpdate, 500);
    </script>
</body>
</html>
"""

live_state = {"content": "Selamat Datang di PresentCraft"}

@app.route('/')
def index():
    return render_template_string(OPERATOR_HTML)

@app.route('/display')
def display():
    return render_template_string(DISPLAY_HTML)

@app.route('/api/slides')
def api_slides():
    return jsonify(load_slides())

@app.route('/api/set-live', methods=['POST'])
def api_set_live():
    global live_state
    from flask import request
    data = request.json
    slides = load_slides()
    index = data.get('index', 0)
    if 0 <= index < len(slides):
        live_state["content"] = slides[index]["content"]
    return jsonify({"status": "success"})

@app.route('/api/get-live')
def api_get_live():
    return jsonify(live_state)

if __name__ == '__main__':
    print("Menjalankan server PresentCraft UI di http://127.0.0.1:5000 ...")
    app.run(debug=True, port=5000)