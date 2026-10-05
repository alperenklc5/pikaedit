# 🐹 PikaEdit — Free Online Tools Platform

> **Privacy-first browser tools. Your files never leave your device.**  
> [pikaedit.com](https://pikaedit.com) · [TR](https://pikaedit.com/tr) · [EN](https://pikaedit.com/en)

![Green Hosting](https://app.greenweb.org/api/v3/greencheckimage/pikaedit.com?nocache=true)

---

## What is PikaEdit?

PikaEdit is a free, multi-tool platform with 40+ tools across PDF, image, developer, text, and audio categories. Most tools run **entirely in your browser** — no file uploads, no accounts, no limits.

Built with Next.js 14, TypeScript, and Tailwind CSS. Deployed on a green-energy VPS.

---

## 🛠️ Tools

### 📄 PDF Tools
| Tool | Description | Processing |
|------|-------------|-----------|
| Merge PDF | Combine multiple PDFs into one | Client-side |
| Split PDF | Extract pages from PDF | Client-side |
| Compress PDF | Reduce PDF file size | Client-side |
| Edit PDF | Add text, draw, annotate | Client-side |
| Rotate PDF | Rotate pages | Client-side |
| Protect PDF | Add password protection | Client-side |
| Word → PDF | Convert DOCX to PDF | Server-side (LibreOffice) |
| Excel → PDF | Convert XLSX to PDF | Server-side (LibreOffice) |
| PPT → PDF | Convert PPTX to PDF | Server-side (LibreOffice) |

### 🖼️ Image Tools
| Tool | Description | Processing |
|------|-------------|-----------|
| Compress Image | Reduce image file size | Client-side |
| Resize Image | Change image dimensions | Client-side |
| Convert Format | JPG ↔ PNG ↔ WebP ↔ AVIF | Client-side |
| Crop Image | Crop to any aspect ratio | Client-side |
| Remove Background | AI background removal | Client-side (ONNX) |
| Object Removal | Remove unwanted objects | Client-side (inpainting) |
| Image to Text (OCR) | Extract text from images | Client-side (Tesseract.js) |
| Video Editor | Trim, add text, merge, speed | Server-side (FFmpeg) |
| Auto Subtitle | Generate SRT/VTT subtitles | Server-side (Whisper) |

### 👨‍💻 Developer Tools
| Tool | Description | Processing |
|------|-------------|-----------|
| JSON Editor | Format, validate, tree view | Client-side (Monaco) |
| Base64 | Encode/decode Base64 | Client-side |
| Hash Generator | MD5, SHA-1, SHA-256, SHA-512 | Client-side |
| Regex Tester | Test regular expressions | Client-side |
| URL Encoder | Encode/decode URLs | Client-side |
| Color Converter | HEX ↔ RGB ↔ HSL | Client-side |
| QR Generator | Generate QR codes | Client-side |
| Mermaid Editor | Diagram editor with live preview | Client-side (Mermaid.js) |
| Favicon Generator | Generate all favicon sizes + manifest | Client-side (Canvas) |
| Data Converter | JSON ↔ CSV ↔ YAML | Client-side |
| Timestamp Converter | Unix timestamp ↔ Date | Client-side |
| Markdown Editor | Live preview, HTML/MD export | Client-side |
| Password Generator | Cryptographically secure passwords | Client-side (Web Crypto API) |
| URL Shortener | Short links with click tracking | Server-side |

### 📝 Text Tools
| Tool | Description | Processing |
|------|-------------|-----------|
| Word Counter | Count words, chars, sentences | Client-side |
| Case Converter | UPPER, lower, Title, camelCase | Client-side |
| Lorem Generator | Generate placeholder text | Client-side |
| Diff Checker | Compare two texts | Client-side |

### 🎵 Audio Tools
| Tool | Description | Processing |
|------|-------------|-----------|
| MIDI Generator | Generate chord progressions, drum patterns, 808 bass | Client-side |
| Stem Separator | Separate vocals from instrumentals | Server-side (Demucs) |

### 📦 Other
| Tool | Description |
|------|-------------|
| CV Builder | ATS-scored resume builder with PDF export |
| Encrypted Notes | AES-256-GCM zero-knowledge note sharing |
| File Share | Temporary file sharing (up to 500MB) |

---

## 🏗️ Architecture

```
pikaedit/
├── src/
│   ├── app/
│   │   ├── [locale]/          # TR + EN (next-intl)
│   │   │   ├── pdf/           # PDF tools
│   │   │   ├── image/         # Image + video tools
│   │   │   ├── developer/     # Developer tools
│   │   │   ├── text/          # Text tools
│   │   │   ├── audio/         # Audio tools
│   │   │   ├── cv-builder/    # CV builder
│   │   │   ├── notes/         # Encrypted notes
│   │   │   ├── share/         # File sharing
│   │   │   └── guides/        # SEO guide articles
│   │   └── api/               # Server-side API routes
│   ├── components/
│   ├── lib/                   # Tool logic
│   └── messages/              # i18n (tr.json, en.json)
├── public/
│   └── midi-worker.js         # Web Worker for MIDI generation
└── data/
    └── temp/                  # Temporary files (auto-cleaned)
```

**Stack:**
- **Framework:** Next.js 14 App Router + TypeScript
- **Styling:** Tailwind CSS
- **i18n:** next-intl (Turkish + English)
- **Database:** libsql (notes, file sharing, URL shortener)
- **Server tools:** FFmpeg, Whisper.cpp, Demucs, LibreOffice
- **Deployment:** PM2 + Nginx + Let's Encrypt on VPS

---

## 💡 Code Highlights

### Client-side Inpainting (Object Removal)
```typescript
// src/lib/image/inpaint.ts
// Patch-based inpainting — fills masked areas using weighted neighbor averaging
export async function inpaintImage(
  imageData: ImageData,
  maskData: ImageData,
  onProgress?: (percent: number) => void
): Promise<ImageData> {
  const { width, height, data } = imageData;
  const result = new Uint8ClampedArray(data);

  // BFS-based distance transform: process pixels from outside in
  // Pixels closest to unmasked areas are filled first
  const queue: number[] = [];
  const distances = new Float32Array(width * height).fill(Infinity);

  // ... fills masked region with weighted neighbor average
  // Multiple passes for large regions
}
```

### MIDI Generation with Real Rhythm Patterns
```typescript
// src/lib/audio/midi-generator.ts
// Rhythm patterns extracted from MIT-licensed MIDI dataset
// (github.com/ldrolez/free-midi-chords)
export const RHYTHM_PATTERNS = {
  trap: [
    [{ beat: 0, durationBeats: 1 }, { beat: 1.75, durationBeats: 2.25 }],
    [{ beat: 0.75, durationBeats: 1.25 }, { beat: 2, durationBeats: 2 }],
    // ... syncopated patterns typical of trap production
  ],
  lofi: [
    [{ beat: 0, durationBeats: 1 }, { beat: 1, durationBeats: 1 },
     { beat: 2, durationBeats: 1.5 }, { beat: 3.5, durationBeats: 0.5 }],
    // ... jazzy, swung patterns
  ],
};
```

### Whisper Auto-Subtitles (Server-side)
```typescript
// src/app/api/subtitle/route.ts
// Uses whisper.cpp for fast CPU inference
// Supports 90+ languages, outputs SRT/VTT/TXT

const whisperArgs = [
  "-m", modelPath,           // ggml-base.bin (~150MB)
  "-f", audioPath,           // extracted audio (16kHz WAV)
  "-of", outputBase,
  "--output-srt",
  "--output-vtt", 
  "--output-txt",
];
if (language !== "auto") whisperArgs.push("-l", language);

await exec(whisperPath, whisperArgs);
```

### Stem Separation (Demucs)
```typescript
// src/app/api/audio/separate/route.ts
// Uses Meta's Demucs htdemucs model for vocal/instrumental separation
// Queue system ensures only 1 concurrent job (CPU-intensive)

const args = ["-m", "demucs", "-n", "htdemucs", "-o", outputDir];
if (mode === "two-stems") args.push("--two-stems=vocals");

// SSE streaming for real-time progress
const child = spawn("stdbuf", ["-oL", "-eL", demucsPython, "-u", ...args], {
  env: { ...process.env, OMP_NUM_THREADS: "2", PYTHONUNBUFFERED: "1" }
});
```

---

## 🔒 Privacy

| Tool type | File handling |
|-----------|--------------|
| Client-side tools | Files never leave your browser |
| Server-side tools (video, audio, conversion) | Files uploaded, processed, immediately deleted |
| Notes | AES-256-GCM encrypted client-side before upload |
| File sharing | Files stored temporarily (up to 7 days), then deleted |

---

## 🚀 Self-hosting

```bash
# Requirements: Node.js 20+, FFmpeg, LibreOffice (optional)
git clone https://github.com/alperenklc5/pikaedit
cd pikaedit
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

For server-side tools (video editing, subtitles, stem separation):
```bash
# FFmpeg
apt install -y ffmpeg

# Whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp /opt/whisper.cpp
cd /opt/whisper.cpp && make -j
bash ./models/download-ggml-model.sh base

# Demucs
python3 -m venv /opt/demucs-env
source /opt/demucs-env/bin/activate
pip install demucs
```

---

## 📊 Tech Stack Details

| Category | Technology |
|----------|-----------|
| PDF manipulation | pdf-lib, PDF.js |
| Image processing | Canvas API, sharp |
| Background removal | ONNX Runtime Web |
| OCR | Tesseract.js |
| Diagrams | Mermaid.js |
| Code editor | Monaco Editor |
| MIDI generation | midi-writer-js |
| Audio analysis | Web Audio API, @tonejs/midi |
| Video/audio | FFmpeg (server) |
| Speech-to-text | Whisper.cpp (server) |
| Stem separation | Demucs htdemucs (server) |
| Document conversion | LibreOffice (server) |
| Database | libsql (@libsql/client) |

---

## 📄 License

The code in this repository is available under the **MIT License**.

The live service at [pikaedit.com](https://pikaedit.com) is free to use.

---

## 🌱 Green Hosting

PikaEdit runs on green energy infrastructure, verified by [The Green Web Foundation](https://www.thegreenwebfoundation.org/green-web-check/pikaedit.com).

---

*Built with ❤️ and a lot of ☕*
