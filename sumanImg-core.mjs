import { deflateRaw, inflateRaw } from "node:zlib";
import { promisify } from "node:util";

export const SUMANIMG_MAGIC = Buffer.from("SMIG", "ascii");
export const SUMANIMG_HEADER_SIZE = 32;
export const SUMANIMG_VERSION = 1;
export const SUMANIMG_MAX_DIMENSION = 16384;

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("SumanImg: invalid image dimensions");
  }
  if (width > SUMANIMG_MAX_DIMENSION || height > SUMANIMG_MAX_DIMENSION) {
    throw new Error("SumanImg: image exceeds the dimension limit");
  }
  const pixelLength = width * height * 4;
  if (!Number.isSafeInteger(pixelLength)) {
    throw new Error("SumanImg: image is too large");
  }
  return pixelLength;
}

export async function encodeSumanImg({ width, height, rgba, metadata = null }) {
  const expectedLength = assertDimensions(width, height);
  const pixels = Buffer.from(rgba);
  if (pixels.length !== expectedLength) {
    throw new Error(`SumanImg: expected ${expectedLength} RGBA bytes, received ${pixels.length}`);
  }

  const metadataText = metadata == null
    ? ""
    : typeof metadata === "string"
      ? metadata
      : JSON.stringify(metadata);
  const metadataBytes = Buffer.from(metadataText, "utf8");
  const compressed = await deflateRawAsync(pixels);

  const header = Buffer.alloc(SUMANIMG_HEADER_SIZE);
  SUMANIMG_MAGIC.copy(header, 0);
  header.writeUInt8(SUMANIMG_VERSION, 4);
  header.writeUInt8(0, 5);
  header.writeUInt8(1, 6);
  header.writeUInt8(1, 7);
  header.writeUInt32LE(width, 8);
  header.writeUInt32LE(height, 12);
  header.writeUInt32LE(compressed.length, 16);
  header.writeUInt32LE(metadataBytes.length, 20);
  header.writeUInt32LE(crc32(pixels), 24);
  header.writeUInt32LE(0, 28);

  return Buffer.concat([header, metadataBytes, compressed]);
}

export async function decodeSumanImg(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < SUMANIMG_HEADER_SIZE) throw new Error("SumanImg: file is too small");
  if (!bytes.subarray(0, 4).equals(SUMANIMG_MAGIC)) throw new Error("SumanImg: invalid magic bytes");

  const version = bytes.readUInt8(4);
  const flags = bytes.readUInt8(5);
  const colorModel = bytes.readUInt8(6);
  const compression = bytes.readUInt8(7);
  if (version !== SUMANIMG_VERSION) throw new Error(`SumanImg: unsupported version ${version}`);
  if (flags !== 0) throw new Error("SumanImg: unsupported flags");
  if (colorModel !== 1) throw new Error("SumanImg: unsupported color model");
  if (compression !== 1) throw new Error("SumanImg: unsupported compression");

  const width = bytes.readUInt32LE(8);
  const height = bytes.readUInt32LE(12);
  const payloadLength = bytes.readUInt32LE(16);
  const metadataLength = bytes.readUInt32LE(20);
  const expectedCrc = bytes.readUInt32LE(24);
  if (bytes.readUInt32LE(28) !== 0) throw new Error("SumanImg: reserved header field is not zero");

  const expectedPixelLength = assertDimensions(width, height);
  const payloadStart = SUMANIMG_HEADER_SIZE + metadataLength;
  const payloadEnd = payloadStart + payloadLength;
  if (payloadStart > bytes.length || payloadEnd > bytes.length) {
    throw new Error("SumanImg: payload is outside the file");
  }
  if (payloadEnd !== bytes.length) throw new Error("SumanImg: unexpected trailing data");

  let metadata = null;
  if (metadataLength) {
    try {
      metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(SUMANIMG_HEADER_SIZE, payloadStart)));
    } catch {
      throw new Error("SumanImg: invalid metadata JSON");
    }
  }

  const pixels = await inflateRawAsync(bytes.subarray(payloadStart, payloadEnd));
  if (pixels.length !== expectedPixelLength) {
    throw new Error("SumanImg: decompressed pixel length does not match dimensions");
  }
  if (crc32(pixels) !== expectedCrc) throw new Error("SumanImg: CRC-32 integrity check failed");

  return { width, height, rgba: pixels, metadata, version };
}

export function isSumanImg(input) {
  const bytes = Buffer.from(input);
  return bytes.length >= 4 && bytes.subarray(0, 4).equals(SUMANIMG_MAGIC);
}
