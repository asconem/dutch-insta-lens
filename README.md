# Dutch Insta-Lens

A browser extension that translates Dutch text on Instagram posts using OCR and DeepL. Built for Dutch language learners who follow Dutch-language Instagram accounts.

## How It Works

1. **Shift+Click** any Instagram image containing Dutch text
2. The extension uses OCR to detect and highlight text with interactive overlays
3. Click any highlighted block to see the English translation
4. Edit OCR results for accuracy and re-translate as needed

## Features

- **OCR text detection** via OCR.space with positional overlay mapping
- **Dutch → English translation** via DeepL (with Google Translate fallback)
- **Editable text blocks** — fix OCR mistakes and re-translate
- **Resizable/dismissable overlays** for precise text selection

### Firefox-only features
- **Google Neural TTS** — hear Dutch pronunciation with the 🔊 button
- **Script Pad** — collect Dutch phrases across multiple scans and batch translate
- **Video frame capture** — scan Dutch text in Instagram videos

## Installation

### Firefox
Load the `firefox/` folder as a temporary add-on via `about:debugging`, or package as `.xpi`.

### Chrome
Load the `chrome/` folder as an unpacked extension via `chrome://extensions` (enable Developer Mode), or install from the Chrome Web Store.

## Privacy

See our [Privacy Policy](index.html) for details on how data is handled. The extension does not collect, store, or transmit any personal information.
