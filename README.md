# CanaryOS

An on-device, real-time scam detection system for mobile devices. CanaryOS uses multimodal ML models running entirely on-device to detect scams across text, images, and UI patterns without sending sensitive data to the cloud.

## Tech Stack

- **App**: React Native (Expo) with TypeScript
- **On-Device ML**: TFLite via `react-native-fast-tflite` (JSI/zero-copy)
- **OCR**: Google ML Kit (Android) / Vision Framework (iOS)
- **Backend**: Firebase (Auth, Firestore, Cloud Storage)
- **ML Research**: Python, TensorFlow, Jupyter

## Quick Start

```bash
cd canaryapp
npm install
npx expo start
```

See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) for Firebase configuration.

## Documentation

- [Strategy & Roadmap](docs/STRATEGY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Firebase Setup](docs/FIREBASE_SETUP.md)

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `canaryapp/` | React Native mobile app |
| `research/` | ML model development (notebooks, scripts, model outputs) |
| `docs/` | Project documentation |

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Canary Yellow | `#FFD300` | Primary brand |
| Charcoal Black | `#1C1C1C` | Dark backgrounds |
| Alert Red | `#E63946` | Scam warnings |
| Trust Blue | `#0077B6` | Safe indicators |
| Off-White | `#F5F5F5` | Light backgrounds |
