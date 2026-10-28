# My Custom Formats

A home for multiple custom file formats. **SumanImg** is the first format in the project and is specifically for images. Future formats can live beside it without changing the project's overall purpose.

## SumanImg

SumanImg is a custom binary image format using the `.sumanImg` extension.

- File extension: `.sumanImg`
- Internal magic: `SMIG`
- MIME type: `image/x-sumanimg`
- v1: lossless RGBA8 + raw DEFLATE
- Optional UTF-8 JSON metadata
- CRC-32 integrity checking

The full binary specification is in [`SUMANIMG-SPEC.md`](./SUMANIMG-SPEC.md).

## SumanImg Viewer

The static browser viewer is intended for GitHub Pages:

**https://sumankayal247.github.io/my-custom-formats/**

It can:

- Open `.sumanImg` files locally.
- Drag and drop SumanImg files.
- Decode SumanImg v1.
- Verify CRC-32 integrity.
- Display dimensions and metadata.
- Convert normal browser-supported images to `.sumanImg`.
- Download the generated `.sumanImg` without uploading the image to a server.

## SumanImg CLI

The repository also contains a command-line tool for converting images to SumanImg.

### Install locally from this repository

```bash
npm install
npm install -g .
```

After that, the command is simply:

```bash
sumanimg photo.png
```

This creates:

```text
photo.sumanImg
```

### Convert a whole folder

You can paste a folder path directly:

```bash
sumanimg "/home/suman/Pictures"
```

All supported images in that folder are converted into a `sumanImg` subfolder:

```text
Pictures/
├── photo1.jpg
├── photo2.png
├── wallpaper.webp
└── sumanImg/
    ├── photo1.sumanImg
    ├── photo2.sumanImg
    └── wallpaper.sumanImg
```

For subfolders too:

```bash
sumanimg "/home/suman/Pictures" --recursive
```

### Useful commands

```bash
# One image
sumanimg photo.png

# Folder
sumanimg ./photos

# Folder including subfolders
sumanimg ./photos --recursive

# Preview what would happen without converting
sumanimg ./photos --dry-run

# Replace existing output files
sumanimg ./photos --overwrite

# Choose a different output folder
sumanimg ./photos --output ./converted

# Convert SumanImg back to PNG
sumanimg photo.sumanImg --decode

# Inspect a SumanImg file
sumanimg photo.sumanImg --info

# Show help
sumanimg --help
```

The CLI uses **Sharp** to read common image formats and the SumanImg core implementation to create the actual `.sumanImg` binary.

## Automated SumanImg tests

SumanImg has fixed test vectors and automated validation tests. They check things such as:

- Known 1×1 and 2×2 SumanImg files decode correctly.
- Encoding produces the expected binary bytes.
- Pixels and metadata survive an encode/decode round trip.
- Corrupted data is rejected.
- Invalid magic bytes are rejected.
- Unsupported versions are rejected.
- Unexpected trailing data is rejected.

Run them with:

```bash
npm test
```

GitHub Actions also runs these tests automatically when the SumanImg core, tests, package configuration, or workflow changes.

## Files

```text
my-custom-formats/
├── index.html                 # GitHub Pages viewer/converter
├── sumanImg.js                # Browser SumanImg encoder/decoder
├── sumanImg-core.mjs          # Node.js reference encoder/decoder
├── sumanimg.mjs               # User-friendly SumanImg CLI
├── SUMANIMG-SPEC.md           # SumanImg v1 binary specification
├── package.json               # CLI package and test command
├── tests/
│   └── sumanImg.test.mjs      # Automated format tests + fixed vectors
└── .github/workflows/
    └── sumanimg-tests.yml     # Automatic test runner
```

## Architecture

```text
                 My Custom Formats
                         │
          ┌──────────────┴──────────────┐
          │                             │
       SumanImg                    Future formats
       (images)                    (added later)
          │
    ┌─────┴─────┐
    │           │
 Browser      Node.js
 Viewer         CLI
    │           │
    └─────┬─────┘
          │
     SumanImg v1
     Specification
          │
     Test Vectors
```

The browser and Node.js implementations follow the same SumanImg specification. The test vectors help make sure future changes do not silently break existing `.sumanImg` files.

## Enable GitHub Pages

If Pages is not already enabled:

1. Open this repository on GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **`main`**.
5. Select folder **`/ (root)`**.
6. Click **Save**.
7. Wait for GitHub Pages to deploy.
8. Open `https://sumankayal247.github.io/my-custom-formats/`.

Because `index.html` is in the repository root, no build tool is required for the viewer.

## Roadmap

### SumanImg

- [x] v1 binary specification
- [x] Browser decoder
- [x] Browser encoder/converter
- [x] Local drag-and-drop viewer
- [x] Metadata support
- [x] CRC-32 integrity validation
- [x] Node.js reference encoder/decoder
- [x] User-friendly CLI
- [x] Folder/batch conversion
- [x] Automated test vectors
- [x] GitHub Actions validation
- [ ] Publish the CLI to npm for `npx` / global installation
- [ ] Native desktop/mobile integration
- [ ] Future SumanImg version only after v1 is stable

### Project

- [ ] Add the next custom file format as its own specification and implementation
- [ ] Keep each format independently versioned and tested
