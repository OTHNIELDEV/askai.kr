import { cp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = path.join(repoRoot, "extension", "src");
const distRoot = path.join(repoRoot, "extension", "dist");

const targets = [
  { manifest: "manifest.chrome.json", name: "chrome" },
  { manifest: "manifest.firefox.json", name: "firefox" }
];

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function isInsideRoundedSquare(x, y, size, radius) {
  const min = 0;
  const max = size - 1;
  const cx = x < radius ? radius : x > max - radius ? max - radius : x;
  const cy = y < radius ? radius : y > max - radius ? max - radius : y;
  return Math.hypot(x - cx, y - cy) <= radius;
}

function createIconPng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const radius = size * 0.2;
  const center = size / 2;
  const longArm = size * 0.28;
  const shortArm = size * 0.18;
  const stroke = Math.max(1.2, size * 0.055);
  const dotRadius = Math.max(1.1, size * 0.055);

  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;

    for (let x = 0; x < size; x += 1) {
      const pixel = row + 1 + x * 4;
      const inside = isInsideRoundedSquare(x, y, size, radius);
      const px = x + 0.5;
      const py = y + 0.5;
      const sparkle =
        distanceToSegment(px, py, center, center - longArm, center, center + longArm) <= stroke ||
        distanceToSegment(px, py, center - shortArm, center, center + shortArm, center) <= stroke ||
        distanceToSegment(px, py, center + size * 0.18, center - size * 0.25, center + size * 0.26, center - size * 0.33) <=
          stroke ||
        Math.hypot(px - center + size * 0.22, py - center - size * 0.25) <= dotRadius;

      raw[pixel] = sparkle ? 255 : 17;
      raw[pixel + 1] = sparkle ? 254 : 19;
      raw[pixel + 2] = sparkle ? 247 : 24;
      raw[pixel + 3] = inside ? 255 : 0;
    }
  }

  const header = Buffer.from("\x89PNG\r\n\x1a\n", "binary");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

async function buildTarget(target) {
  const targetDir = path.join(distRoot, target.name);
  await rm(targetDir, { force: true, recursive: true });
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
  await cp(path.join(sourceDir, target.manifest), path.join(targetDir, "manifest.json"));
  await unlink(path.join(targetDir, "manifest.chrome.json"));
  await unlink(path.join(targetDir, "manifest.firefox.json"));

  const iconsDir = path.join(targetDir, "icons");
  await mkdir(iconsDir, { recursive: true });
  await Promise.all([16, 32, 48, 128].map((size) => writeFile(path.join(iconsDir, `icon${size}.png`), createIconPng(size))));

  return targetDir;
}

await mkdir(distRoot, { recursive: true });
const outputs = await Promise.all(targets.map(buildTarget));
console.log(`ASKAI extensions built:\n${outputs.map((output) => `- ${output}`).join("\n")}`);
