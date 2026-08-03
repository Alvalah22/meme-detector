# Meme Detector 🎭

A browser-based app that watches your face and hand gestures through your webcam and shows a matching meme in real time. Everything runs **locally in your browser** — no camera footage is ever uploaded or sent to a server.

Built with vanilla JavaScript and [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision) for face and hand landmark detection.

## Requirements

- A modern browser with webcam support (Chrome, Edge, or Safari recommended)
- A working webcam
- An internet connection (to load MediaPipe's model files from CDN on first run)

## Installation & Running

1. Clone or download this repository.
2. Make sure the `assets/` folder (containing the meme images) is in the same folder as `index.html`.
3. Serve the folder with any static file server — this is required because the app uses camera access and ES modules, which don't work when opening `index.html` directly (`file://`).

   Using Node.js:
   ```bash
   npx serve .
   ```
   Or using Python:
   ```bash
   python3 -m http.server 8000
   ```
4. Open the URL shown in your terminal (e.g. `http://localhost:3000` or `http://localhost:8000`) in your browser.

## How to Use

1. Click **"Coba deteksi aku"** (Try detecting me) on the start screen.
2. Allow camera access when your browser asks for permission.
3. Wait a moment while the app **calibrates** — hold a neutral, relaxed face so it can learn your baseline expression.
4. Once calibration finishes, your camera feed appears on the left panel and the detected meme appears on the right panel.
5. Try the gestures below in front of the camera — the matching meme will show up automatically.

## Gestures

| Gesture | Meme |
|---|---|
| Two open hands beside the face | Emoji Pasrah |
| Fingers touching the mouth | Ronaldo Gigit Jari |
| Open mouth with tongue out | Kucing Lidah |
| Raised / furrowed eyebrows | Anjing Skeptis |
| "V" hand sign (index + middle finger) | Hamster Oke |
| Two open hands above the head | Sonic.exe |

## Controls

The buttons in the header let you:

- **Kalibrasi ulang** (Recalibrate) — redo calibration if detection feels off, e.g. after changing lighting or position
- **Info deteksi** (Detection info) — open a debug panel showing live gesture confidence scores
- **Ganti kamera** (Switch camera) — switch between available cameras (useful on phones/tablets with front & back cameras)
- **Cara mainnya** (How to play) — open the gesture guide
- **Matikan** (Turn off) — stop the camera and detection

## Tips for Best Results

- Make sure your face is well-lit and clearly visible to the camera.
- Sit at a comfortable distance where your face and hands are both in frame.
- Recalibrate if you switch locations or lighting changes significantly.
- Hold a gesture for a moment — detection uses smoothing, so it may take a fraction of a second to register.

## Project Structure

```
.
├── index.html   # App markup / layout
├── style.css    # Styling and theme
├── app.js       # Detection logic, calibration, gesture rules, rendering
└── assets/      # Meme images (not included in this listing)
```

## Privacy

All face and hand detection runs entirely on your device using MediaPipe in the browser. No video, images, or landmark data ever leaves your computer.

## License

This project is licensed under the [MIT License](LICENSE).
