/*
 * XIMG v1 browser implementation.
 * Format specification: XIMG-SPEC.md
 */

const XIMG_MAGIC = [0x58, 0x49, 0x4d, 0x47]; // XIMG
const XIMG_HEADER_SIZE = 32;
const XIMG_VERSION = 1;
const XIMG_MAX_DIMENSION = 16384;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertDimension(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("XIMG: invalid image dimensions");
  }
  if (width > XIMG_MAX_DIMENSION || height > XIMG_MAX_DIMENSION) {
    throw new Error("XIMG: image exceeds the viewer dimension limit");
  }
  const pixelLength = width * height * 4;
  if (!Number.isSafeInteger(pixelLength)) {
    throw new Error("XIMG: image is too large");
  }
  return pixelLength;
}

async function streamBytes(bytes, format, mode) {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
    throw new Error("XIMG: this browser does not provide the CompressionStream API");
  }
  const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
  const stream = new Stream(format);
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function compressDeflate(bytes) {
  try {
    return await streamBytes(bytes, "deflate-raw", "compress");
  } catch (error) {
    if (error instanceof TypeError) {
      return streamBytes(bytes, "deflate", "compress");
    }
    throw error;
  }
}

async function decompressDeflate(bytes) {
  try {
    return await streamBytes(bytes, "deflate-raw", "decompress");
  } catch (error) {
    if (error instanceof TypeError) {
      return streamBytes(bytes, "deflate", "decompress");
    }
    throw error;
  }
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function metadataBytes(metadata) {
  if (metadata == null) return new Uint8Array();
  const json = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
  return new TextEncoder().encode(json);
}

export async function encodeXIMG({ width, height, rgba, metadata = null }) {
  const expectedLength = assertDimension(width, height);
  const pixels = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
  if (pixels.length !== expectedLength) {
    throw new Error(`XIMG: expected ${expectedLength} RGBA bytes, received ${pixels.length}`);
  }

  const meta = metadataBytes(metadata);
  if (meta.length > 0xffffffff) throw new Error("XIMG: metadata is too large");

  const compressed = await compressDeflate(pixels);
  if (compressed.length > 0xffffffff) throw new Error("XIMG: payload is too large");

  const header = new ArrayBuffer(XIMG_HEADER_SIZE);
  const view = new DataView(header);
  XIMG_MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint8(4, XIMG_VERSION);
  view.setUint8(5, 0); // flags
  view.setUint8(6, 1); // RGBA8
  view.setUint8(7, 1); // DEFLATE
  view.setUint32(8, width, true);
  view.setUint32(12, height, true);
  view.setUint32(16, compressed.length, true);
  view.setUint32(20, meta.length, true);
  view.setUint32(24, crc32(pixels), true);
  view.setUint32(28, 0, true);

  return concatBytes(new Uint8Array(header), meta, compressed).buffer;
}

export async function decodeXIMG(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer?.() ?? input);
  if (bytes.length < XIMG_HEADER_SIZE) throw new Error("XIMG: file is too small");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < XIMG_MAGIC.length; i++) {
    if (view.getUint8(i) !== XIMG_MAGIC[i]) throw new Error("XIMG: invalid magic bytes");
  }

  const version = view.getUint8(4);
  const flags = view.getUint8(5);
  const colorModel = view.getUint8(6);
  const compression = view.getUint8(7);
  if (version !== XIMG_VERSION) throw new Error(`XIMG: unsupported version ${version}`);
  if (flags !== 0) throw new Error("XIMG: unsupported flags");
  if (colorModel !== 1) throw new Error("XIMG: unsupported color model");
  if (compression !== 1) throw new Error("XIMG: unsupported compression");

  const width = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  const payloadLength = view.getUint32(16, true);
  const metadataLength = view.getUint32(20, true);
  const expectedCrc = view.getUint32(24, true);
  if (view.getUint32(28, true) !== 0) throw new Error("XIMG: reserved header field is not zero");

  const expectedPixelLength = assertDimension(width, height);
  const payloadStart = XIMG_HEADER_SIZE + metadataLength;
  const payloadEnd = payloadStart + payloadLength;
  if (payloadStart > bytes.length || payloadEnd > bytes.length) {
    throw new Error("XIMG: payload is outside the file");
  }
  if (payloadEnd !== bytes.length) throw new Error("XIMG: unexpected trailing data");

  let metadata = null;
  if (metadataLength) {
    try {
      const metadataText = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(XIMG_HEADER_SIZE, payloadStart));
      metadata = JSON.parse(metadataText);
    } catch {
      throw new Error("XIMG: invalid metadata JSON");
    }
  }

  const pixels = await decompressDeflate(bytes.subarray(payloadStart, payloadEnd));
  if (pixels.length !== expectedPixelLength) {
    throw new Error("XIMG: decompressed pixel length does not match dimensions");
  }
  if (crc32(pixels) !== expectedCrc) throw new Error("XIMG: CRC-32 integrity check failed");

  return { width, height, rgba: pixels, metadata, version };
}

export function isXIMG(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return bytes.length >= 4 && XIMG_MAGIC.every((byte, index) => bytes[index] === byte);
}
