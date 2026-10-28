# XIMG v1 Specification

XIMG is a self-contained custom image container designed for local browser decoding.

## Goals

- `.ximg` is a real binary format, not a renamed PNG/JPEG.
- Browser decoding happens locally; the image is not uploaded by the viewer.
- The format is versioned so future revisions can remain compatible.
- v1 is lossless RGBA with DEFLATE compression.
- Metadata is optional UTF-8 JSON.

## File layout

```text
Offset  Size  Field
0       4     Magic: ASCII `XIMG`
4       1     Version: `1`
5       1     Flags
6       1     Color model: `1` = RGBA8
7       1     Compression: `1` = DEFLATE
8       4     Width, unsigned little-endian 32-bit
12      4     Height, unsigned little-endian 32-bit
16      4     Payload length, unsigned little-endian 32-bit
20      4     Metadata length, unsigned little-endian 32-bit
24      4     CRC-32 of uncompressed RGBA pixel bytes
28      4     Reserved: must be `0`
32      N     Metadata UTF-8 JSON
32+N    M     Compressed RGBA pixel payload
```

All integer fields are little-endian.

## Flags

v1 defines no flags. The value must be `0`.

## Color model

`1` means RGBA8: four bytes per pixel in row-major order, with one byte each for red, green, blue and alpha.

The uncompressed pixel length must be exactly:

```text
width × height × 4
```

## Compression

`1` means DEFLATE. The payload is a raw DEFLATE stream (RFC 1951), not a zlib or gzip wrapper.

Browsers can decode this using `DecompressionStream("deflate-raw")` where supported. The bundled viewer also includes a compatibility path for environments that expose only a zlib-wrapped `deflate` stream.

## Metadata

Metadata is UTF-8 encoded JSON. An empty metadata block has length `0` and represents no metadata.

Suggested keys are application-defined. XIMG itself does not require any metadata keys.

Example:

```json
{
  "name": "example",
  "software": "XIMG Viewer",
  "created": "2026-10-28T00:00:00Z"
}
```

## Integrity

CRC-32 uses the standard IEEE polynomial `0xEDB88320` and is calculated over the **uncompressed RGBA bytes**.

A decoder must reject the file if the CRC does not match.

## Validation rules

A v1 decoder must reject:

- incorrect magic bytes;
- unsupported version;
- non-zero flags;
- unsupported color model;
- unsupported compression;
- zero width or height;
- dimensions that overflow the expected RGBA byte count;
- payload or metadata ranges outside the file;
- invalid UTF-8/JSON metadata when metadata length is non-zero;
- decompressed pixel data with the wrong length;
- CRC-32 mismatch.

Recommended implementation limit for browser viewers: reject images larger than `16384 × 16384` pixels before allocation.

## MIME type and extension

- Extension: `.ximg`
- Recommended MIME type: `image/x-ximg`

The MIME type is informational. Operating systems and browsers do not automatically gain native XIMG support merely from this registration.

## Compatibility strategy

The canonical XIMG implementation should live in portable JavaScript/TypeScript. Native applications can implement the same binary specification independently.

The v1 format deliberately keeps the codec simple. A future version can add other color models, compression codecs, thumbnails or animation through new version/flag definitions without changing the v1 interpretation.
