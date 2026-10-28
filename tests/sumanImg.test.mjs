import assert from "node:assert/strict";
import test from "node:test";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
import { decodeSumanImg, encodeSumanImg } from "../sumanImg-core.mjs";

const inflateRawAsync = promisify(inflateRaw);

const vectors = [
  {
    name: "1x1 red pixel",
    hex: "534d49470100010101000000010000000600000000000000603643d200000000fbcfc0f01f00",
    width: 1,
    height: 1,
    rgba: [255, 0, 0, 255],
    metadata: null
  },
  {
    name: "2x2 RGBA with metadata",
    hex: "534d49470100010102000000020000000b0000002a000000662d4b7f000000007b226e616d65223a2274657374222c22736f667477617265223a2253756d616e496d672074657374227dfbcfc0f01f0c19fe830100",
    width: 2,
    height: 2,
    rgba: [
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255
    ],
    metadata: { name: "test", software: "SumanImg test" }
  }
];

test("decodes fixed SumanImg test vectors", async () => {
  for (const vector of vectors) {
    const decoded = await decodeSumanImg(Buffer.from(vector.hex, "hex"));
    assert.equal(decoded.width, vector.width, vector.name);
    assert.equal(decoded.height, vector.height, vector.name);
    assert.deepEqual([...decoded.rgba], vector.rgba, vector.name);
    assert.deepEqual(decoded.metadata, vector.metadata, vector.name);
  }
});

test("encodes the 1x1 vector exactly", async () => {
  const vector = vectors[0];
  const encoded = await encodeSumanImg({
    width: vector.width,
    height: vector.height,
    rgba: Buffer.from(vector.rgba)
  });
  assert.equal(encoded.toString("hex"), vector.hex);
});

test("round-trips pixels and metadata", async () => {
  const original = {
    width: 2,
    height: 2,
    rgba: Buffer.from(vectors[1].rgba),
    metadata: vectors[1].metadata
  };
  const encoded = await encodeSumanImg(original);
  const decoded = await decodeSumanImg(encoded);
  assert.equal(decoded.width, original.width);
  assert.equal(decoded.height, original.height);
  assert.deepEqual(decoded.rgba, original.rgba);
  assert.deepEqual(decoded.metadata, original.metadata);
});

test("rejects corrupted pixel data through CRC validation", async () => {
  const vector = Buffer.from(vectors[0].hex, "hex");
  const payloadStart = 32;
  const compressed = await inflateRawAsync(vector.subarray(payloadStart));
  compressed[0] ^= 0xff;
  vector.set(compressed, payloadStart);
  await assert.rejects(() => decodeSumanImg(vector), /CRC|invalid distance|unexpected end/i);
});

test("rejects invalid magic bytes", async () => {
  const vector = Buffer.from(vectors[0].hex, "hex");
  vector[0] = 0;
  await assert.rejects(() => decodeSumanImg(vector), /invalid magic/i);
});

test("rejects unsupported version", async () => {
  const vector = Buffer.from(vectors[0].hex, "hex");
  vector[4] = 99;
  await assert.rejects(() => decodeSumanImg(vector), /unsupported version/i);
});

test("rejects trailing bytes", async () => {
  const vector = Buffer.concat([Buffer.from(vectors[0].hex, "hex"), Buffer.from([0])]);
  await assert.rejects(() => decodeSumanImg(vector), /trailing data/i);
});
