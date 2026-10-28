# My Custom Formats

Experimental custom file formats. The first format is **XIMG**, a web-compatible custom image container.

## XIMG Viewer

The viewer is hosted with GitHub Pages:

**https://sumankayal247.github.io/my-custom-formats/**

The viewer can now:

- Open `.ximg` files locally.
- Drag and drop XIMG files.
- Decode XIMG v1 RGBA8 + DEFLATE.
- Verify the XIMG CRC-32 integrity check.
- Display image dimensions and embedded metadata.
- Convert regular browser-supported images into `.ximg` files locally.
- Download the generated `.ximg` without uploading the source image to a server.

## XIMG v1

The binary format is documented in [`XIMG-SPEC.md`](./XIMG-SPEC.md).

Current v1 layout:

```text
Header (32 bytes)
  magic          4 bytes   XIMG
  version        1 byte    1
  flags          1 byte    0
  color model    1 byte    RGBA8
  compression    1 byte    DEFLATE
  width          4 bytes
  height         4 bytes
  payload length 4 bytes
  metadata len   4 bytes
  CRC-32         4 bytes
  reserved       4 bytes

Metadata       UTF-8 JSON
Pixel payload  DEFLATE-compressed RGBA8 bytes
```

Recommended MIME type: `image/x-ximg`

## Files

- `index.html` — static GitHub Pages viewer/converter.
- `ximg.js` — browser encoder/decoder and validation logic.
- `XIMG-SPEC.md` — XIMG v1 binary specification.

## Enable GitHub Pages

If Pages is not already enabled:

1. Open this repository on GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **`main`**.
5. Select folder **`/ (root)`**.
6. Click **Save**.
7. Wait for GitHub Pages to deploy.
8. Open:
   `https://sumankayal247.github.io/my-custom-formats/`

Because `index.html` is in the repository root, no build tool is required.

## Architecture

```text
Regular image
     ↓
Browser canvas
     ↓
RGBA8 pixels
     ↓
XIMG v1 encoder
     ↓
.ximg file

.ximg file
     ↓
XIMG v1 decoder
     ↓
RGBA8 pixels
     ↓
Browser canvas
```

Everything in the viewer runs locally in the browser. No image upload server is required.

## Roadmap

- [x] XIMG v1 binary specification
- [x] Browser decoder
- [x] Browser encoder/converter
- [x] Local drag-and-drop viewer
- [x] Metadata support
- [x] CRC-32 integrity validation
- [ ] Node.js CLI encoder/decoder
- [ ] Automated format test vectors
- [ ] Optional lossless codec improvements
- [ ] XIMG v2 design for animation/thumbnails and additional codecs
- [ ] Native desktop/mobile integration
