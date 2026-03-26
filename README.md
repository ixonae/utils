# Ixonae Utils

A collection of browser-based utility tools. Everything runs locally in your browser — no data is uploaded anywhere.

- **Production:** https://web-tools.ixonae.com

## Available tools

- **Watermark Tool** — Add visible or stealth watermarks to images. Supports visible text overlay, LSB (Least Significant Bit) steganography, DCT (Discrete Cosine Transform) steganography, and EXIF metadata embedding.
- **EXIF Viewer & Editor** — View all EXIF metadata in JPEG photos. Selectively strip GPS data, camera info, or all metadata before sharing.

## Getting started

No build step, no server required. Clone the repository and open the HTML directly:

```bash
git clone https://github.com/ixonae/utils.git
cd utils
open web_utils/index.html
```

Or serve it locally if you prefer:

```bash
npx serve web_utils
```

## Project structure

```
web_utils/
  index.html                  # Landing page
  shared/
    components/               # Reusable UI components (header, footer, upload zone)
    styles/                   # Shared CSS
    utils/                    # DOM and image helpers
  tools/
    watermark/                # Watermark tool (visible, LSB, DCT, EXIF)
    exif/                     # EXIF viewer and editor
  tests/                      # Unit tests (Vitest)
    helpers/                  # Test utilities and fixtures
    exif/                     # EXIF parser/writer tests
    watermark/                # Watermark encoding/decoding tests
vitest.config.js              # Vitest configuration
package.json
```

## Testing

Tests use [Vitest](https://vitest.dev/) and cover the core logic (EXIF parsing/writing, LSB/DCT steganography, bit encoding).

```bash
npm install
npm test            # Single run
npm run test:watch  # Watch mode
```

## Disclaimer

This project is largely the result of experimenting and playing around with AI-assisted coding. The code may not follow best practices everywhere and is provided as-is. Use at your own discretion.

## License

Apache-2.0
