# Palm Fortune App

Cross-platform Expo application for palm scanning and fortune prediction backed by a Flask API and Firebase. Users can scan their palm, store the analysis in Firestore, request an AI-generated reading, and review their scan history inside the app.

## Features
- 📷 **Palm Scan** – Capture palm images with Expo Camera, toggle flash/torch, and retake shots.
- 🔍 **Image Analysis** – Upload scans to the Flask backend for processing (OpenCV/Mediapipe pipeline).
- 🔐 **Firebase Auth/Profile** – Email/password authentication with persisted user profiles.
- 🔮 **AI Fortune** – Send scan summaries and user context to DeepSeek for palmistry-inspired predictions. The answer is saved to `users/{uid}/fortunes`.
- 📚 **History Viewer** – Display each saved fortune with a quick preview and access to full details.
- ⏳ **Loading Experience** – Custom loading overlay while images upload & fortunes generate.

## Project Structure
```
.
├── client/          # Expo app (TypeScript/React Native)
│   ├── app/         # Screens & routing
│   ├── components/  # Shared UI components
│   ├── services/    # Auth & Firestore helpers
│   └── utils/       # Fortune parsing, constants, etc.
├── server/          # Flask backend
│   ├── serve_flask.py      # REST endpoints
│   ├── python.py           # Image analysis pipeline
│   ├── firebase-key.json   # Service account (private)
│   └── requirements.txt
└── README.md
```

## Prerequisites
- Node.js 18+ & npm (or yarn)
- Expo CLI (`npm install -g expo-cli`)
- Python 3.10+
- Firebase project (Firestore + Authentication enabled)
- DeepSeek API key for fortune predictions

## Environment Variables
### Client (`client/.env`)
```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=... (optional)
```

### Server (`server/.env`)
```
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE=https://api.deepseek.com            # optional override
GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/firebase-key.json
# Tune DeepSeek timeouts if needed:
# DEEPSEEK_CONNECT_TIMEOUT=10
# DEEPSEEK_READ_TIMEOUT=75
```

If `GOOGLE_APPLICATION_CREDENTIALS` is not set, the Flask app falls back to `server/firebase-key.json`.

## Setup

### 1. Install dependencies
```bash
# client
cd client
npm install

# server
cd ../server
python -m venv .venv
. .venv/Scripts/activate   # PowerShell: .\.venv\Scripts\Activate
pip install -r requirements.txt
```

### 2. Configure IP address for the Expo client
Set the backend URL in `client/utils/constants.ts`:
```ts
export const API_BASE = "http://<your-local-ip>:8000";
```
Use `10.0.2.2` for Android emulator, `127.0.0.1` for iOS simulator, or your LAN IP for devices on the same network.

### 3. Run the backend
```bash
cd server
. .venv/Scripts/activate
python serve_flask.py
```

### 4. Run the Expo app
```bash
cd client
npx expo start
```
Choose your target (web, emulator, or Expo Go on device). When a scan is taken, the client uploads to the server and shows a modal with the latest fortune, plus a history tab for previous readings.

## Development Notes
- The history tab listens to `users/{uid}/fortunes` and renders each document through `FortuneResultCard`.
- `client/utils/fortune.ts` parses the AI response into sections (Love/Career/Finance/Health) and creates previews to reduce bandwidth.
- Flask endpoints:
  - `POST /analyze` – process palm image
  - `POST /scan/save` – store summarized scan data under the user
  - `POST /fortune/predict` – request DeepSeek prediction & save to Firestore
  - `GET /fortune/list` – list previous fortunes (client uses Firestore SDK directly instead)
- Ensure the service account JSON is **not** committed to public repositories.

## Troubleshooting
- **`network request failed` on Expo**: confirm `API_BASE` points to a reachable IP and the server is running. Check firewall rules if using Windows.
- **HTTP 402 from `/fortune/predict`**: DeepSeek credits exhausted or API key invalid; update `DEEPSEEK_API_KEY`.
- **Firebase permissions**: Firestore rules must allow authenticated users to read/write their own `users/{uid}/...` documents.

## Future Ideas
- Add unit tests for fortune parsing.
- Provide UI controls to set fortune language/style before sending requests.
- Allow exporting scan results or sharing fortunes with friends.

Happy palm reading! ✋✨
