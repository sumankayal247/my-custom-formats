/*
 * SumanImg v1 browser implementation.
 * Format specification: SUMANIMG-SPEC.md
 */

const SUMANIMG_MAGIC = [0x53, 0x4d, 0x49, 0x47]; // SMIG
const SUMANIMG_HEADER_SIZE = 32;
const SUMANIMG_VERSION = 1;
const SUMANIMG_MAX_DIMENSION = 16384;

/*
 * Original CRC-32 implementation kept commented out before optimization.
 *
 * function crc32(bytes) {
 *   let crc = 0xffffffff;
 *   for (let i = 0; i < bytes.length; i++) {
 *     crc ^= bytes[i];
 *     for (let bit = 0; bit < 8; bit++) {
 *       crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
 *     }
 *   }
 *   return (crc ^ 0xffffffff) >>> 0;
 * }
 */

const CRC32_TABLE = new Uint32Array(256);
for (let value = 0; value < 256; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  CRC32_TABLE[value] = crc >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertDimension(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("SumanImg: invalid image dimensions");
  }
  if (width > SUMANIMG_MAX_DIMENSION || height > SUMANIMG_MAX_DIMENSION) {
    throw new Error("SumanImg: image exceeds the viewer dimension limit");
  }
  const pixelLength = width * height * 4;
  if (!Number.isSafeInteger(pixelLength)) {
    throw new Error("SumanImg: image is too large");
  }
  return pixelLength;
}

/*
 * Original streamBytes implementation kept commented out before diagnostic replacement.
 *
 * async function streamBytes(bytes, format, mode) {
 *   if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
 *     throw new Error("SumanImg: this browser does not provide the CompressionStream API");
 *   }
 *   const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
 *   const stream = new Stream(format);
 *   const writer = stream.writable.getWriter();
 *   await writer.write(bytes);
 *   await writer.close();
 *   return new Uint8Array(await new Response(stream.readable).arrayBuffer());
 * }
 */

async function streamBytes(bytes, format, mode, onProgress = null) {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
    throw new Error("SumanImg: this browser does not provide the CompressionStream API");
  }

  const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
  reportLog(onProgress, `CompressionStream: creating ${format} stream`);
  const stream = new Stream(format);
  reportLog(onProgress, "CompressionStream: stream created");

  reportLog(onProgress, "CompressionStream: creating writable writer");
  const writer = stream.writable.getWriter();
  reportLog(onProgress, "CompressionStream: writer created");

  reportLog(onProgress, `CompressionStream: writer.write() START — ${bytes.byteLength} input bytes`);
  const writeStart = performance.now();
  await writer.write(bytes);
  reportLog(onProgress, `CompressionStream: writer.write() END — ${((performance.now() - writeStart) / 1000).toFixed(3)}s`);

  reportLog(onProgress, "CompressionStream: writer.close() START");
  const closeStart = performance.now();
  await writer.close();
  reportLog(onProgress, `CompressionStream: writer.close() END — ${((performance.now() - closeStart) / 1000).toFixed(3)}s`);

  reportLog(onProgress, "CompressionStream: reading readable output START");
  const readStart = performance.now();
  const output = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  reportLog(onProgress, `CompressionStream: reading readable output END — ${((performance.now() - readStart) / 1000).toFixed(3)}s, ${output.byteLength} output bytes`);
  return output;
}

/*
 * Diagnostic replacement for the compression path.
 * The tests deliberately compare the current write-then-read order against a
 * concurrently drained readable side. This can detect a WritableStream backpressure
 * deadlock without changing the SumanImg v1 format or production output.
 */

async function runCompressionDiagnostics(bytes, onLog = null) {
  if (typeof CompressionStream === "undefined") {
    reportLog(onLog, "DIAGNOSTIC: CompressionStream is unavailable; cannot run stream tests");
    return;
  }

  reportLog(onLog, "DIAGNOSTIC: ===== CompressionStream deep test suite START =====");
  reportLog(onLog, `DIAGNOSTIC: browser=${navigator?.userAgent || "unknown"}`);
  reportLog(onLog, `DIAGNOSTIC: input bytes=${bytes.byteLength}`);
  reportLog(onLog, `DIAGNOSTIC: input ArrayBuffer=${bytes.buffer.constructor?.name || "unknown"}, byteOffset=${bytes.byteOffset}, byteLength=${bytes.byteLength}`);
  reportLog(onLog, `DIAGNOSTIC: CompressionStream type=${typeof CompressionStream}`);

  const testBuffer = new Uint8Array(1024);
  for (let i = 0; i < testBuffer.length; i++) testBuffer[i] = i & 0xff;

  const runWithTimeout = async (label, operation, timeoutMs = 3000) => {
    const started = performance.now();
    let timeoutId = null;
    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`TIMEOUT after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      reportLog(onLog, `DIAGNOSTIC: ${label} PASS in ${((performance.now() - started) / 1000).toFixed(3)}s`);
      return { ok: true, result };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      reportLog(onLog, `DIAGNOSTIC: ${label} FAIL after ${((performance.now() - started) / 1000).toFixed(3)}s — ${error?.message || error}`);
      return { ok: false, error };
    }
  };

  const directConstruction = await runWithTimeout("construct deflate-raw stream", async () => {
    const stream = new CompressionStream("deflate-raw");
    return { writable: !!stream.writable, readable: !!stream.readable };
  });
  if (directConstruction.ok) {
    reportLog(onLog, `DIAGNOSTIC: stream interfaces writable=${directConstruction.result.writable}, readable=${directConstruction.result.readable}`);
  }

  const tinySequential = await runWithTimeout("1KB sequential write", async () => {
    const stream = new CompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    await writer.write(testBuffer);
    await writer.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  });
  if (tinySequential.ok) {
    reportLog(onLog, `DIAGNOSTIC: 1KB sequential output=${tinySequential.result.byteLength} bytes`);
  }

  const tinyConcurrent = await runWithTimeout("1KB concurrent drain + write", async () => {
    const stream = new CompressionStream("deflate-raw");
    const reader = stream.readable.getReader();
    const output = [];
    const drain = (async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output.push(chunk.value);
      }
    })();
    const writer = stream.writable.getWriter();
    await writer.write(testBuffer);
    await writer.close();
    await drain;
    reader.releaseLock();
    return output.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  });
  if (tinyConcurrent.ok) {
    reportLog(onLog, `DIAGNOSTIC: 1KB concurrent drained output=${tinyConcurrent.result} bytes`);
  }

  const actualSequential = await runWithTimeout("ACTUAL SIZE sequential write", async () => {
    const stream = new CompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }, 5000);
  if (actualSequential.ok) {
    reportLog(onLog, `DIAGNOSTIC: ACTUAL SIZE sequential output=${actualSequential.result.byteLength} bytes`);
  }

  const actualConcurrent = await runWithTimeout("ACTUAL SIZE concurrent drain + write", async () => {
    const stream = new CompressionStream("deflate-raw");
    const reader = stream.readable.getReader();
    let outputBytes = 0;
    const drain = (async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        outputBytes += chunk.value.byteLength;
      }
    })();
    const writer = stream.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    await drain;
    reader.releaseLock();
    return outputBytes;
  }, 5000);
  if (actualConcurrent.ok) {
    reportLog(onLog, `DIAGNOSTIC: ACTUAL SIZE concurrent drained output=${actualConcurrent.result} bytes`);
  }

  const chunkedConcurrent = await runWithTimeout("ACTUAL SIZE 64KB chunked + concurrent drain", async () => {
    const stream = new CompressionStream("deflate-raw");
    const reader = stream.readable.getReader();
    let outputBytes = 0;
    const drain = (async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        outputBytes += chunk.value.byteLength;
      }
    })();
    const writer = stream.writable.getWriter();
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, bytes.byteLength);
      reportLog(onLog, `DIAGNOSTIC: chunk write ${offset}-${end} (${end - offset} bytes)`);
      await writer.write(bytes.subarray(offset, end));
    }
    await writer.close();
    await drain;
    reader.releaseLock();
    return outputBytes;
  }, 5000);
  if (chunkedConcurrent.ok) {
    reportLog(onLog, `DIAGNOSTIC: chunked concurrent output=${chunkedConcurrent.result} bytes`);
  }

  reportLog(onLog, "DIAGNOSTIC: ===== CompressionStream deep test suite END =====");
}

/*
 * Original compressDeflate implementation kept commented out before diagnostic replacement.
 *
 * async function compressDeflate(bytes, onLog = null) {
 *   try {
 *     if (typeof onLog === "function") onLog("CompressionStream: starting deflate-raw");
 *     const result = await streamBytes(bytes, "deflate-raw", "compress");
 *     if (typeof onLog === "function") onLog(`CompressionStream: deflate-raw returned ${result.byteLength} bytes`);
 *     return result;
 *   } catch (error) {
 *     if (error instanceof TypeError) {
 *       if (typeof onLog === "function") onLog("CompressionStream: deflate-raw unsupported; falling back to deflate");
 *       const result = await streamBytes(bytes, "deflate", "compress");
 *       if (typeof onLog === "function") onLog(`CompressionStream: deflate fallback returned ${result.byteLength} bytes`);
 *       return result;
 *     }
 *     throw error;
 *   }
 * }
 */

async function compressDeflate(bytes, onLog = null) {
  try {
    reportLog(onLog, "CompressionStream: starting deflate-raw");
    const result = await streamBytes(bytes, "deflate-raw", "compress", onLog);
    reportLog(onLog, `CompressionStream: deflate-raw returned ${result.byteLength} bytes`);
    return result;
  } catch (error) {
    if (error instanceof TypeError) {
      reportLog(onLog, "CompressionStream: deflate-raw unsupported; falling back to deflate");
      const result = await streamBytes(bytes, "deflate", "compress", onLog);
      reportLog(onLog, `CompressionStream: deflate fallback returned ${result.byteLength} bytes`);
      return result;
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

function reportProgress(onProgress, percent, stage, detail = "") {
  if (typeof onProgress === "function") onProgress({ percent, stage, detail });
}

/*
 * Original reportLog implementation kept commented out before adding a Nerd View fallback.
 *
 * function reportLog(onLog, message) {
 *   if (typeof onLog === "function") onLog(message);
 * }
 */

function reportLog(onLog, message) {
  if (typeof onLog === "function") {
    onLog(message);
    return;
  }

  // Keep encoder diagnostics visible even when the caller has not passed an onLog callback.
  if (typeof document !== "undefined") {
    const logElement = document.getElementById("nerdLog");
    if (logElement) {
      const line = document.createElement("div");
      line.className = "nerd-line";
      line.innerHTML = `<span class="nerd-time">+${(performance.now() / 1000).toFixed(3)}s</span><span class="nerd-kind">ENCODER</span><span class="nerd-message"></span>`;
      line.querySelector(".nerd-message").textContent = message;
      logElement.appendChild(line);
      logElement.scrollTop = logElement.scrollHeight;
    }
  }
}

/*
 * Original encoder kept commented out before diagnostic instrumentation.
 *
 * export async function encodeSumanImg({ width, height, rgba, metadata = null, onProgress = null }) {
 *   const expectedLength = assertDimension(width, height);
 *   const pixels = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
 *   if (pixels.length !== expectedLength) {
 *     throw new Error(`SumanImg: expected ${expectedLength} RGBA bytes, received ${pixels.length}`);
 *   }
 *   reportProgress(onProgress, 40, "preparing", "Validating image data");
 *   const meta = metadataBytes(metadata);
 *   if (meta.length > 0xffffffff) throw new Error("SumanImg: metadata is too large");
 *   const pixelCrc = crc32(pixels);
 *   reportProgress(onProgress, 50, "compressing", "Compressing RGBA pixels");
 *   const compressed = await compressDeflate(pixels);
 *   reportProgress(onProgress, 90, "finalizing", "Building SumanImg file");
 *   if (compressed.length > 0xffffffff) throw new Error("SumanImg: payload is too large");
 *   const header = new ArrayBuffer(SUMANIMG_HEADER_SIZE);
 *   const view = new DataView(header);
 *   SUMANIMG_MAGIC.forEach((byte, index) => view.setUint8(index, byte));
 *   view.setUint8(4, SUMANIMG_VERSION);
 *   view.setUint8(5, 0);
 *   view.setUint8(6, 1);
 *   view.setUint8(7, 1);
 *   view.setUint32(8, width, true);
 *   view.setUint32(12, height, true);
 *   view.setUint32(16, compressed.length, true);
 *   view.setUint32(20, meta.length, true);
 *   view.setUint32(24, pixelCrc, true);
 *   view.setUint32(28, 0, true);
 *   const result = concatBytes(new Uint8Array(header), meta, compressed).buffer;
 *   reportProgress(onProgress, 100, "complete", "Conversion complete");
 *   return result;
 * }
 */

export async function encodeSumanImg({ width, height, rgba, metadata = null, onProgress = null, onLog = null }) {
  const expectedLength = assertDimension(width, height);
  const pixels = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
  if (pixels.length !== expectedLength) {
    throw new Error(`SumanImg: expected ${expectedLength} RGBA bytes, received ${pixels.length}`);
  }

  reportProgress(onProgress, 40, "preparing", "Validating image data");
  reportLog(onLog, `Encoder validation passed: ${width}×${height}, ${pixels.byteLength} RGBA bytes`);

  const meta = metadataBytes(metadata);
  if (meta.length > 0xffffffff) throw new Error("SumanImg: metadata is too large");
  reportLog(onLog, `Metadata encoded: ${meta.byteLength} bytes`);

  reportLog(onLog, "CRC-32: starting synchronous pixel integrity calculation");
  const crcStart = performance.now();
  const pixelCrc = crc32(pixels);
  reportLog(onLog, `CRC-32: complete in ${((performance.now() - crcStart) / 1000).toFixed(3)}s (0x${pixelCrc.toString(16).padStart(8, "0")})`);

  reportProgress(onProgress, 50, "compressing", "Compressing RGBA pixels");
  reportLog(onLog, `DEFLATE: starting compression of ${pixels.byteLength} RGBA bytes`);
  const compressionStart = performance.now();
  const compressed = await compressDeflate(pixels, onLog);
  reportLog(onLog, `DEFLATE: total compression phase ${((performance.now() - compressionStart) / 1000).toFixed(3)}s`);

  reportProgress(onProgress, 90, "finalizing", "Building SumanImg file");
  if (compressed.length > 0xffffffff) throw new Error("SumanImg: payload is too large");
  reportLog(onLog, `Header: building 32-byte SumanImg v1 header; payload=${compressed.byteLength}, metadata=${meta.byteLength}`);

  const header = new ArrayBuffer(SUMANIMG_HEADER_SIZE);
  const view = new DataView(header);
  SUMANIMG_MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint8(4, SUMANIMG_VERSION);
  view.setUint8(5, 0);
  view.setUint8(6, 1);
  view.setUint8(7, 1);
  view.setUint32(8, width, true);
  view.setUint32(12, height, true);
  view.setUint32(16, compressed.length, true);
  view.setUint32(20, meta.length, true);
  view.setUint32(24, pixelCrc, true);
  view.setUint32(28, 0, true);

  reportLog(onLog, "Payload assembly: concatenating header + metadata + compressed pixels");
  const result = concatBytes(new Uint8Array(header), meta, compressed).buffer;
  reportLog(onLog, `Encoder output ready: ${result.byteLength} total bytes`);
  reportProgress(onProgress, 100, "complete", "Conversion complete");
  return result;
}

export async function decodeSumanImg(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer?.() ?? input);
  if (bytes.length < SUMANIMG_HEADER_SIZE) throw new Error("SumanImg: file is too small");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < SUMANIMG_MAGIC.length; i++) {
    if (view.getUint8(i) !== SUMANIMG_MAGIC[i]) throw new Error("SumanImg: invalid magic bytes");
  }

  const version = view.getUint8(4);
  const flags = view.getUint8(5);
  const colorModel = view.getUint8(6);
  const compression = view.getUint8(7);
  if (version !== SUMANIMG_VERSION) throw new Error(`SumanImg: unsupported version ${version}`);
  if (flags !== 0) throw new Error("SumanImg: unsupported flags");
  if (colorModel !== 1) throw new Error("SumanImg: unsupported color model");
  if (compression !== 1) throw new Error("SumanImg: unsupported compression");

  const width = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  const payloadLength = view.getUint32(16, true);
  const metadataLength = view.getUint32(20, true);
  const expectedCrc = view.getUint32(24, true);
  if (view.getUint32(28, true) !== 0) throw new Error("SumanImg: reserved header field is not zero");

  const expectedPixelLength = assertDimension(width, height);
  const payloadStart = SUMANIMG_HEADER_SIZE + metadataLength;
  const payloadEnd = payloadStart + payloadLength;
  if (payloadStart > bytes.length || payloadEnd > bytes.length) {
    throw new Error("SumanImg: payload is outside the file");
  }
  if (payloadEnd !== bytes.length) throw new Error("SumanImg: unexpected trailing data");

  let metadata = null;
  if (metadataLength) {
    try {
      const metadataText = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(SUMANIMG_HEADER_SIZE, payloadStart));
      metadata = JSON.parse(metadataText);
    } catch {
      throw new Error("SumanImg: invalid metadata JSON");
    }
  }

  const pixels = await decompressDeflate(bytes.subarray(payloadStart, payloadEnd));
  if (pixels.length !== expectedPixelLength) {
    throw new Error("SumanImg: decompressed pixel length does not match dimensions");
  }
  if (crc32(pixels) !== expectedCrc) throw new Error("SumanImg: CRC-32 integrity check failed");

  return { width, height, rgba: pixels, metadata, version };
}

export function isSumanImg(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return bytes.length >= 4 && SUMANIMG_MAGIC.every((byte, index) => bytes[index] === byte);
}
