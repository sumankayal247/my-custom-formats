#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { decodeSumanImg, encodeSumanImg, isSumanImg } from "./sumanImg-core.mjs";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".avif"]);

function printHelp() {
  console.log(`SumanImg CLI

Simple usage:
  sumanimg photo.png              Convert one image
  sumanimg ./photos               Convert every image in a folder
  sumanimg photo.sumanImg --decode Convert SumanImg to PNG
  sumanimg photo.sumanImg --info   Show file information

Options:
  -o, --output <path>   Output file or folder
  -r, --recursive       Include images in subfolders
  --decode              Decode .sumanImg to PNG
  --info                Show SumanImg information
  --overwrite           Replace existing output files
  --dry-run             Show what would be converted
  -h, --help            Show this help
`);
}

function cleanInput(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function parseArgs(argv) {
  const args = [...argv];
  const options = { recursive: false, overwrite: false, dryRun: false, mode: "encode" };
  let input = null;

  while (args.length) {
    const arg = args.shift();
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-r" || arg === "--recursive") options.recursive = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--decode") options.mode = "decode";
    else if (arg === "--info") options.mode = "info";
    else if (arg === "-o" || arg === "--output") options.output = cleanInput(args.shift() ?? "");
    else if (!input) input = cleanInput(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { input, options };
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function loadSharp() {
  try {
    const { default: sharp } = await import("sharp");
    return sharp;
  } catch {
    throw new Error("The image converter needs Sharp. Run: npm install");
  }
}

async function collectImages(folder, recursive) {
  const result = [];
  const entries = await fs.readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory() && recursive) {
      result.push(...await collectImages(fullPath, recursive));
      continue;
    }
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

async function encodeFile(input, output, overwrite, dryRun, sharp) {
  if (!overwrite && await exists(output)) {
    console.log(`SKIP  ${output} (already exists; use --overwrite)`);
    return;
  }
  console.log(`${dryRun ? "PLAN  " : "CONVERT "}${input} -> ${output}`);
  if (dryRun) return;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const encoded = await encodeSumanImg({ width: info.width, height: info.height, rgba: data });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, encoded);
}

async function decodeFile(input, output, overwrite, dryRun, sharp) {
  if (!overwrite && await exists(output)) {
    console.log(`SKIP  ${output} (already exists; use --overwrite)`);
    return;
  }
  console.log(`${dryRun ? "PLAN  " : "DECODE "}${input} -> ${output}`);
  if (dryRun) return;

  const decoded = await decodeSumanImg(await fs.readFile(input));
  const png = await sharp(decoded.rgba, {
    raw: { width: decoded.width, height: decoded.height, channels: 4 }
  }).png().toBuffer();
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, png);
}

async function showInfo(input) {
  const data = await fs.readFile(input);
  if (!isSumanImg(data)) throw new Error("This file is not a SumanImg file.");
  const decoded = await decodeSumanImg(data);
  console.log(`File: ${input}`);
  console.log(`Format: SumanImg v${decoded.version}`);
  console.log(`Dimensions: ${decoded.width} × ${decoded.height}`);
  console.log(`RGBA bytes: ${decoded.rgba.length}`);
  console.log(`Metadata: ${decoded.metadata ? JSON.stringify(decoded.metadata) : "none"}`);
  console.log(`Integrity: CRC-32 valid`);
}

async function main() {
  const { input, options } = parseArgs(process.argv.slice(2));
  if (options.help || !input) {
    printHelp();
    return;
  }

  const absoluteInput = path.resolve(input);
  const stats = await fs.stat(absoluteInput);

  if (options.mode === "info") {
    await showInfo(absoluteInput);
    return;
  }

  const sharp = await loadSharp();

  if (stats.isFile()) {
    const ext = path.extname(absoluteInput).toLowerCase();
    if (options.mode === "decode") {
      const output = options.output || path.join(path.dirname(absoluteInput), `${path.basename(absoluteInput, path.extname(absoluteInput))}.png`);
      await decodeFile(absoluteInput, path.resolve(output), options.overwrite, options.dryRun, sharp);
      return;
    }
    const output = options.output || path.join(path.dirname(absoluteInput), `${path.basename(absoluteInput, ext)}.sumanImg`);
    await encodeFile(absoluteInput, path.resolve(output), options.overwrite, options.dryRun, sharp);
    return;
  }

  if (!stats.isDirectory()) throw new Error("Input must be a file or folder.");
  if (options.mode === "decode") throw new Error("Folder decoding is not supported yet. Use --decode with a file.");

  const images = await collectImages(absoluteInput, options.recursive);
  if (!images.length) {
    console.log("No supported images found.");
    return;
  }

  const outputRoot = path.resolve(options.output || path.join(absoluteInput, "sumanImg"));
  for (const image of images) {
    const relative = path.relative(absoluteInput, image);
    const target = path.join(outputRoot, relative.replace(/\.[^.]+$/, ".sumanImg"));
    await encodeFile(image, target, options.overwrite, options.dryRun, sharp);
  }

  console.log(`\nDone: ${images.length} image(s).`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
