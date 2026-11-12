# Third-Party Assets & Licenses (`public/redist/`)

The sheet music recognition and rendering assets in this directory are redistributed from [`lodebar2026/dolce`](https://github.com/lodebar2026/dolce) (`v0.8.7`) and upstream open-source projects under their respective licenses:

1. **Dolce Core Engine** (`src/lib/dolce/`)
   - License: MIT License (see `src/lib/dolce/LICENSE`)
   - Copyright (c) 2026 lodebar2026

2. **Bravura & Bravura Text Music Fonts** (`Bravura.woff2`, `BravuraText.otf`, `bravura_metadata.json`)
   - License: SIL Open Font License 1.1 (`https://scripts.sil.org/OFL`)
   - Note: `BravuraText.otf` is a subset containing only the chord-symbol (`csym`) glyphs used by Dolce.

3. **PaddleOCR Models & Dictionary** (`ocr/ch_PP-OCRv4_det_infer.onnx`, `ocr/ch_PP-OCRv6_small_rec_infer.onnx`, `ocr/ppocrv6_dict.txt`)
   - Source: PaddleOCR (`https://github.com/PaddlePaddle/PaddleOCR`)
   - License: Apache License 2.0 (`https://www.apache.org/licenses/LICENSE-2.0`)

4. **FluidR3 GM Acoustic Grand Piano SoundFont** (`soundfont/acoustic_grand_piano-mp3.js`, `soundfont/LICENSE.txt`)
   - Source: FluidR3_GM.sf2 by Frank Wen, pre-rendered by `midi-js-soundfonts` (`https://github.com/gleitz/midi-js-soundfonts`)
   - License: Creative Commons Attribution 3.0 (`https://creativecommons.org/licenses/by/3.0/us/`)

5. **PDF.js WASM Decoders** (`pdfjs/` generated at build/dev time from `pdfjs-dist/wasm/`)
   - Source: Mozilla PDF.js (`https://github.com/mozilla/pdf.js`)
   - License: Apache License 2.0 (see `node_modules/pdfjs-dist/wasm/LICENSE_*`)
