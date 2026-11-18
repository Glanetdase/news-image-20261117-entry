// THE WORLD IN ONE DAY — Tuesday 17 November 2026.
// A newspaper front page drawn entirely in code: masthead, the Kerch Bridge
// lead, nine secondary stories, a world map, the day in figures, more stories.
// Written by hand in this session. No image assets, no network, no randomness:
// two runs write byte-identical PNGs.

import { deflateSync } from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- PNG writer
// Minimal PNG encoder: 8-bit RGB, no filtering, one IDAT. CRC32 is the
// standard polynomial, built once at startup.

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- colours
type RGB = [number, number, number];
const PAPER: RGB = [248, 244, 233];
const INK: RGB = [20, 20, 20];
const RED: RGB = [168, 30, 30];
const BLUE: RGB = [43, 93, 138];
const SEA: RGB = [58, 110, 165];
const SEADARK: RGB = [38, 80, 125];
const SKY: RGB = [207, 224, 238];
const SKYPALE: RGB = [226, 234, 240];
const GREY: RGB = [107, 107, 107];
const LIGHTGREY: RGB = [212, 207, 192];
const DARK: RGB = [51, 51, 51];
const YELLOW: RGB = [232, 180, 40];
const ORANGE: RGB = [214, 110, 30];
const GREEN: RGB = [46, 125, 60];
const WHITE: RGB = [255, 255, 255];

// ------------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);

function fillPaper(): void {
  for (let i = 0; i < px.length; i += 3) {
    px[i] = PAPER[0];
    px[i + 1] = PAPER[1];
    px[i + 2] = PAPER[2];
  }
}

function setPix(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  px[o] = c[0];
  px[o + 1] = c[1];
  px[o + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPix(i, j, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPix(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, r: number, c: RGB): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    disc(x, y, r, c);
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) setPix(cx + x, cy + y, c);
    }
  }
}

// Filled triangle by scanline.
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: [number, number, number, number][] = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(Math.round(ax + ((y - ay) * (bx - ax)) / (by - ay)));
      }
    }
    if (xs.length >= 2) {
      const a = Math.min(...xs);
      const b = Math.max(...xs);
      for (let x = a; x <= b; x++) setPix(x, y, c);
    }
  }
}

function ellipseArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, c: RGB): void {
  const steps = 48;
  let px0 = 0;
  let py0 = 0;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = Math.round(cx + rx * Math.cos(a));
    const y = Math.round(cy + ry * Math.sin(a));
    if (i > 0) line(px0, py0, x, y, c);
    px0 = x;
    py0 = y;
  }
}

// --------------------------------------------------------------------- font
// A 5x7 bitmap font, drawn by hand: capitals, digits and the punctuation the
// page needs. All page text is set in capitals, so no lowercase is needed.

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "*": ["00000", "10101", "01110", "10101", "00000", "00000", "00000"],
};

function drawChar(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch] || FONT["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "1") rect(x + col * s, y + r * s, s, s, c);
    }
  }
}

function textWidth(s: string, sc: number): number {
  return s.length * 6 * sc - sc;
}

function text(str: string, x: number, y: number, sc: number, c: RGB): void {
  const up = str.toUpperCase();
  for (let i = 0; i < up.length; i++) drawChar(up[i], x + i * 6 * sc, y, sc, c);
}

function textCentered(str: string, cx: number, y: number, sc: number, c: RGB): void {
  const up = str.toUpperCase();
  const w = textWidth(up, sc);
  text(up, cx - Math.floor(w / 2), y, sc, c);
}

function wrap(str: string, maxW: number, sc: number): string[] {
  const words = str.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, sc) <= maxW) {
      cur = t;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draws wrapped text, returns the y just below the block.
function textBlock(str: string, x: number, y: number, maxW: number, sc: number, c: RGB, gap: number): number {
  const lines = wrap(str, maxW, sc);
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], x, y + i * (7 * sc + gap), sc, c);
  }
  return y + lines.length * (7 * sc + gap);
}

function textBlockCentered(str: string, cx: number, y: number, maxW: number, sc: number, c: RGB, gap: number): number {
  const lines = wrap(str, maxW, sc);
  for (let i = 0; i < lines.length; i++) {
    textCentered(lines[i], cx, y + i * (7 * sc + gap), sc, c);
  }
  return y + lines.length * (7 * sc + gap);
}

// ------------------------------------------------------- small illustrations
// Each draws a simple, bold scene into the given box. All shapes are plain
// rectangles, lines, discs and triangles — no assets, no text inside pictures.

// Thick arc: stamps discs along an ellipse arc so arches read boldly.
// Steps scale with the arc's size so the discs overlap into a solid line.
function arcThick(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, r: number, c: RGB): void {
  const steps = Math.max(48, Math.ceil((rx + ry) * 1.4));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    disc(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), r, c);
  }
}

function drawBridgeScene(x: number, y: number, w: number, h: number): void {
  const seaY = y + Math.floor(h * 0.58);
  const deckY = y + Math.floor(h * 0.52);
  rect(x, y, w, seaY - y, SKY);
  rect(x, seaY, w, y + h - seaY, SEA);
  // a few short wave marks, low in the sea so they do not read as a road
  for (const wy of [seaY + 34, seaY + 58]) {
    for (let wx = x + 40; wx < x + w - 60; wx += 130) {
      line(wx, wy, wx + 26, wy, WHITE);
    }
  }
  // the gap where the span fell: wide and unmistakable
  const gapL = x + Math.floor(w * 0.5);
  const gapR = x + Math.floor(w * 0.7);
  // deck, left of the gap and right of the gap, with jagged cut ends
  rect(x, deckY, gapL - x, 9, DARK);
  rect(gapR, deckY, x + w - gapR, 9, DARK);
  line(gapL - 2, deckY, gapL + 6, deckY + 9, DARK);
  line(gapR + 2, deckY, gapR - 6, deckY + 9, DARK);
  // two pylons
  const p1 = x + Math.floor(w * 0.18);
  const p2 = x + Math.floor(w * 0.85);
  rect(p1 - 5, y + 14, 10, deckY - y - 14, INK);
  rect(p2 - 5, y + 14, 10, deckY - y - 14, INK);
  // cables fanning from the tower tops to the deck, never across the gap
  for (const t of [p1, p2]) {
    for (let i = 0; i < 5; i++) {
      const tx = x + Math.floor(w * (0.04 + i * 0.09));
      if (tx < gapL - 10 || tx > gapR + 10) line(t, y + 16, tx, deckY, GREY);
    }
  }
  // intact arch over the left span, drawn bold
  arcThick(x + Math.floor(w * 0.31), deckY, Math.floor(w * 0.15), Math.floor(h * 0.32), Math.PI, 2 * Math.PI, 3, INK);
  thickLine(x + Math.floor(w * 0.16), deckY, x + Math.floor(w * 0.16), deckY - Math.floor(h * 0.24), 2, INK);
  thickLine(x + Math.floor(w * 0.46), deckY, x + Math.floor(w * 0.46), deckY - Math.floor(h * 0.24), 2, INK);
  // broken arch on the right: a stub that stops dead at the gap
  arcThick(x + Math.floor(w * 0.79), deckY, Math.floor(w * 0.08), Math.floor(h * 0.28), Math.PI, Math.PI * 1.35, 3, INK);
  // the fallen span: a long tilted deck section lying in the water.
  // The whole group stays inside the water band (seaY to the bottom of
  // this scene) and clear of the headline below it: the second piece is
  // flatter, and the debris and third splash sit beside it, not under it.
  const fx = x + Math.floor(w * 0.6);
  const fy = seaY + Math.floor(h * 0.2);
  thickLine(fx - 46, fy - 12, fx + 44, fy + 16, 6, DARK);
  thickLine(fx - 28, fy + 26, fx + 28, fy + 31, 3, DARK);
  // debris in the water, flanking the lower piece
  rect(fx - 54, fy + 28, 12, 4, DARK);
  rect(fx + 38, fy + 30, 10, 3, DARK);
  // splash marks around the fallen span
  line(fx - 56, fy - 2, fx - 40, fy - 14, WHITE);
  line(fx + 54, fy + 22, fx + 70, fy + 10, WHITE);
  line(fx - 64, fy + 20, fx - 52, fy + 26, WHITE);
  // smoke rising from the gap, a tight overlapping plume
  disc(gapL + 24, deckY - 22, 9, GREY);
  disc(gapL + 34, deckY - 38, 11, GREY);
  disc(gapL + 24, deckY - 54, 8, GREY);
  disc(gapR - 10, deckY - 28, 7, GREY);
  disc(gapL + 42, deckY - 58, 6, GREY);
}

function drawTanker(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKYPALE);
  const seaY = y + Math.floor(h * 0.62);
  rect(x, seaY, w, y + h - seaY, SEA);
  // hull
  const hx = x + Math.floor(w * 0.12);
  const hw = Math.floor(w * 0.68);
  rect(hx, seaY - 8, hw, 12, DARK);
  tri(hx + hw, seaY - 8, hx + hw + 14, seaY + 4, hx + hw, seaY + 4, DARK);
  // cabin
  rect(hx + hw - 34, seaY - 22, 26, 14, WHITE);
  rect(hx + hw - 34, seaY - 22, 26, 14, INK); // outline block, then windows
  rect(hx + hw - 30, seaY - 19, 18, 8, SKY);
  // funnel with smoke
  rect(hx + 18, seaY - 20, 10, 12, INK);
  disc(hx + 23, seaY - 28, 5, GREY);
  disc(hx + 30, seaY - 36, 6, GREY);
  // flame on the deck
  tri(hx + 60, seaY - 8, hx + 68, seaY - 26, hx + 76, seaY - 8, ORANGE);
  tri(hx + 64, seaY - 8, hx + 68, seaY - 18, hx + 72, seaY - 8, YELLOW);
}

function drawSkyline(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKYPALE);
  disc(x + Math.floor(w * 0.78), y + 8, 7, RED);
  const base = y + h;
  const heights = [0.55, 0.8, 0.45, 0.95, 0.6, 0.75, 0.5];
  const bw = Math.floor(w / heights.length);
  for (let i = 0; i < heights.length; i++) {
    const bh = Math.floor(h * heights[i]);
    rect(x + i * bw + 2, base - bh, bw - 4, bh, DARK);
  }
  // three small stars above the skyline
  for (const sx of [0.2, 0.32, 0.44]) {
    const cx = x + Math.floor(w * sx);
    const cy = y + 6;
    rect(cx - 1, cy - 3, 2, 6, YELLOW);
    rect(cx - 3, cy - 1, 6, 2, YELLOW);
  }
}

function drawChip(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, LIGHTGREY);
  const cx = x + Math.floor(w * 0.32);
  const cy = y + Math.floor(h / 2);
  const s = Math.floor(h * 0.36);
  // pins
  for (let i = -1; i <= 1; i++) {
    rect(cx - s - 6, cy + i * 8 - 1, 6, 2, INK);
    rect(cx + s, cy + i * 8 - 1, 6, 2, INK);
  }
  rect(cx - s, cy - s, s * 2, s * 2, DARK);
  rect(cx - Math.floor(s * 0.55), cy - Math.floor(s * 0.55), Math.floor(s * 1.1), Math.floor(s * 1.1), GREEN);
  // falling arrow on the right
  const ax = x + Math.floor(w * 0.72);
  line(ax, y + 3, ax, y + h - 8, RED);
  tri(ax - 6, y + h - 10, ax + 6, y + h - 10, ax, y + h - 2, RED);
}

function drawVirus(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKYPALE);
  const cx = x + Math.floor(w * 0.3);
  const cy = y + Math.floor(h / 2);
  const r = Math.floor(h * 0.3);
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    line(
      Math.round(cx + Math.cos(ang) * r),
      Math.round(cy + Math.sin(ang) * r),
      Math.round(cx + Math.cos(ang) * (r + 5)),
      Math.round(cy + Math.sin(ang) * (r + 5)),
      RED
    );
  }
  disc(cx, cy, r, RED);
  // medical cross on the right
  const px0 = x + Math.floor(w * 0.68);
  const py0 = y + Math.floor(h / 2);
  rect(px0 - 3, py0 - 10, 6, 20, GREEN);
  rect(px0 - 10, py0 - 3, 20, 6, GREEN);
}

function drawBolt(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, DARK);
  // building with unlit windows
  const bx = x + Math.floor(w * 0.62);
  rect(bx, y + 6, Math.floor(w * 0.3), h - 6, GREY);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      rect(bx + 5 + c * 9, y + 10 + r * 7, 5, 4, INK);
    }
  }
  // lightning bolt
  const bx0 = x + Math.floor(w * 0.28);
  const by0 = y + 2;
  thickLine(bx0, by0, bx0 - 8, y + Math.floor(h * 0.5), 2, YELLOW);
  thickLine(bx0 - 8, y + Math.floor(h * 0.5), bx0 + 4, y + Math.floor(h * 0.5), 2, YELLOW);
  thickLine(bx0 + 4, y + Math.floor(h * 0.5), bx0 - 6, y + h - 2, 2, YELLOW);
}

function drawDocument(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKYPALE);
  const dx = x + Math.floor(w * 0.3);
  const dy = y + 2;
  const dw = Math.floor(w * 0.34);
  const dh = h - 4;
  rect(dx, dy, dw, dh, WHITE);
  rect(dx, dy, dw, 1, INK);
  rect(dx, dy + dh - 1, dw, 1, INK);
  rect(dx, dy, 1, dh, INK);
  rect(dx + dw - 1, dy, 1, dh, INK);
  for (let i = 0; i < 3; i++) {
    rect(dx + 5, dy + 5 + i * 5, dw - 10, 2, GREY);
  }
  // red seal
  disc(dx + dw - 8, dy + dh - 8, 6, RED);
  // a stamp block on the right
  rect(x + Math.floor(w * 0.72), y + 5, Math.floor(w * 0.2), 10, RED);
  rect(x + Math.floor(w * 0.72), y + 18, Math.floor(w * 0.2), 2, INK);
}

function drawJets(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  disc(x + Math.floor(w * 0.85), y + 7, 6, RED);
  // two delta jets
  const j1x = x + Math.floor(w * 0.3);
  const j1y = y + Math.floor(h * 0.45);
  tri(j1x - 16, j1y + 4, j1x + 14, j1y, j1x - 16, j1y - 4, INK);
  tri(j1x - 6, j1y, j1x - 14, j1y - 8, j1x - 2, j1y, INK);
  const j2x = x + Math.floor(w * 0.58);
  const j2y = y + Math.floor(h * 0.68);
  tri(j2x - 12, j2y + 3, j2x + 11, j2y, j2x - 12, j2y - 3, DARK);
  // contrails
  line(j1x - 16, j1y, x + 4, j1y + 6, WHITE);
  line(j2x - 12, j2y, x + 40, j2y + 4, WHITE);
}

function drawClapper(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, DARK);
  const cx = x + Math.floor(w * 0.5);
  const cy = y + Math.floor(h / 2);
  const bw = Math.floor(w * 0.4);
  const bh = Math.floor(h * 0.66);
  const top = cy - Math.floor(bh / 2);
  // white board with a dark outline
  rect(cx - bw, top + 6, bw * 2, bh - 6, WHITE);
  rect(cx - bw, top + 6, bw * 2, 1, INK);
  rect(cx - bw, top + bh - 1, bw * 2, 1, INK);
  rect(cx - bw, top + 6, 1, bh - 6, INK);
  rect(cx + bw - 1, top + 6, 1, bh - 6, INK);
  // clapper strip on top: dark bar with white diagonal ticks
  rect(cx - bw, top, bw * 2, 6, INK);
  for (let i = 0; i < 5; i++) {
    const sx = cx - bw + 4 + i * Math.floor((bw * 2 - 8) / 5);
    line(sx, top, sx + 5, top + 6, WHITE);
  }
  // two dark text lines on the board
  rect(cx - bw + 6, top + 11, bw * 2 - 12, 2, DARK);
  rect(cx - bw + 6, top + 16, bw - 4, 2, GREY);
}

function drawCourthouse(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKYPALE);
  const cx = x + Math.floor(w * 0.5);
  const base = y + h - 2;
  // pediment
  tri(cx - 34, base - 22, cx + 34, base - 22, cx, base - 34, DARK);
  // columns
  for (const off of [-24, -8, 8, 24]) {
    rect(cx + off - 3, base - 22, 6, 20, DARK);
  }
  // base
  rect(cx - 40, base - 3, 80, 3, DARK);
}

// ------------------------------------------------------------- story blocks
interface Story {
  art: (x: number, y: number, w: number, h: number) => void;
  head: string;
  body: string;
}

const STORIES: Story[] = [
  {
    art: drawTanker,
    head: "US STRIKES IRAN",
    body: "US WARPLANES HIT A MISSILE SITE ON QESHM ISLAND. 24 SEAFARERS LEFT THE BURNING TANKER TARA GAS.",
  },
  {
    art: drawSkyline,
    head: "SUMMIT IN CHINA",
    body: "TRUMP HEADS TO CHINA FOR A RARE SUMMIT WITH XI AND PUTIN. UKRAINE, TRADE AND SECURITY ON THE AGENDA.",
  },
  {
    art: drawChip,
    head: "NVIDIA IN TURMOIL",
    body: "EX-CHIEF JENSEN HUANG QUIT AMID A SPY SCANDAL. RECORD REVENUE, BUT AI STOCKS LED WALL STREET DOWN.",
  },
  {
    art: drawVirus,
    head: "MEASLES STATUS LOST",
    body: "THE US LOST ITS MEASLES ELIMINATION STATUS, FIRST TIME SINCE 2000. FALLING VACCINATION RATES BLAMED.",
  },
  {
    art: drawBolt,
    head: "OUTAGES HIT THE US",
    body: "A SOFTWARE BUG HIT JPMORGAN AND ZELLE. UNITED ENDED A 90-MINUTE OUTAGE; APPLE AND AN NSA SYSTEM FELL.",
  },
  {
    art: drawDocument,
    head: "UK SANCTIONS ISRAEL FIRMS",
    body: "BRITAIN SANCTIONED EIGHT ISRAELI FIRMS OVER SETTLEMENTS. FOUR NATIONS URGED GAZA AID ACCESS.",
  },
  {
    art: drawJets,
    head: "JAPAN SCRAMBLES JETS",
    body: "JAPAN SCRAMBLED JETS AFTER TWO SUSPECTED RUSSIAN AIRCRAFT ENTERED ITS AIRSPACE. TOKYO PROTESTED.",
  },
  {
    art: drawClapper,
    head: "DEPARDIEU ADMITS CHARGE",
    body: "ACTOR GERARD DEPARDIEU WITHDREW HIS APPEAL AND ADMITTED A SEXUAL ASSAULT CHARGE IN A PARIS COURT.",
  },
  {
    art: drawCourthouse,
    head: "EPSTEIN: EXPERT SAYS MURDER",
    body: "FORENSIC EXPERT MICHAEL FREEMAN SAYS EPSTEIN'S DEATH WAS MURDER, NOT SUICIDE, AFTER REVIEWING THE FILE.",
  },
];

// ------------------------------------------------------------------- layout
function drawBorder(): void {
  rect(10, 10, W - 20, 2, INK);
  rect(10, H - 12, W - 20, 2, INK);
  rect(10, 10, 2, H - 20, INK);
  rect(W - 12, 10, 2, H - 20, INK);
  rect(14, 14, W - 28, 1, INK);
  rect(14, H - 15, W - 28, 1, INK);
  rect(14, 14, 1, H - 28, INK);
  rect(W - 15, 14, 1, H - 28, INK);
}

function drawMasthead(): void {
  textCentered("THE WORLD IN ONE DAY", 512, 26, 6, INK);
  rect(24, 76, 976, 3, RED);
  textCentered("TUESDAY 17 NOVEMBER 2026", 512, 86, 3, INK);
  textCentered("18 STORIES FROM 6 CONTINENTS", 512, 112, 2, GREY);
}

function drawLead(): void {
  drawBridgeScene(24, 134, 976, 162);
  textCentered("KERCH BRIDGE DOWN", 512, 304, 5, RED);
  textBlockCentered(
    "UKRAINE'S DRONES AND MISSILES BROUGHT DOWN A SPAN OF THE 19 KM ROAD-AND-RAIL BRIDGE TO CRIMEA OVERNIGHT. THE ROAD IS OUT; RAIL WAS RESTORED BY THE AFTERNOON. DEBRIS IN THE CANAL THREATENS THE GRAIN ROUTE.",
    512,
    348,
    976,
    2,
    INK,
    2
  );
  rect(24, 406, 976, 2, INK);
}

function drawStoryGrid(): void {
  const colX = [24, 352, 680];
  const rowY = [414, 502, 590];
  const colW = 312;
  for (let i = 0; i < STORIES.length; i++) {
    const s = STORIES[i];
    const cx = colX[i % 3];
    const cy = rowY[Math.floor(i / 3)];
    s.art(cx, cy, colW, 24);
    let y = cy + 28;
    const headLines = wrap(s.head, colW, 2);
    for (const hl of headLines) {
      text(hl, cx, y, 2, INK);
      y += 16;
    }
    y += 2;
    textBlock(s.body, cx, y, colW, 1, DARK, 1);
    // thin divider under each story except the last row
    if (Math.floor(i / 3) < 2) {
      rect(cx, cy + 80, colW, 1, LIGHTGREY);
    }
  }
  rect(24, 678, 976, 2, INK);
}

// ------------------------------------------------------------ world map
// A coarse equirectangular world map, 56 columns by 22 rows, drawn by hand:
// '#' is land. Marker grid positions (col, row): Kerch (33,5), Iran (36,7),
// China (46,6), USA (16,6), Britain (28,4), Japan (50,7).
const MAP: string[] = [
  "  ##########       ######          ####################",
  " #############    ########        ######################",
  " ###############   ######         ######################",
  "  #############     ####    ##   ######################",
  "   ############      ###   ####  #####################",
  "    ##############    ##   ######  ##################",
  "     #############         ######  ##################",
  "      #########  ##        ######## ##################",
  "       ######   ###        ######### ##############",
  "        ####    ####       ######### ############",
  "         ##    #####      ######### ##########",
  "               #####      ########  ########",
  "               ####       ########   ####    ##",
  "               ####        #######    ##  ####",
  "                ###        ######     #  ######",
  "                ###         #####          #######",
  "                 ##         ####           #######",
  "                 ##          ###           ######",
  "                  #          ##            ######",
  "                             ##             ####",
  "                              #             ###",
  "                                             ##",
];

const MAP_MARKS: [number, number, string][] = [
  [33, 5, "1"],
  [36, 7, "2"],
  [46, 6, "3"],
  [14, 6, "4"],
  [28, 4, "5"],
  [50, 7, "6"],
];

function drawMap(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKYPALE);
  const cols = 56;
  const rows = MAP.length;
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) {
    const row = MAP[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "#") {
        rect(Math.floor(x + c * cw), Math.floor(y + r * ch), Math.ceil(cw), Math.ceil(ch), INK);
      }
    }
  }
  // numbered markers
  for (const [col, row, label] of MAP_MARKS) {
    const mx = Math.round(x + (col + 0.5) * cw);
    const my = Math.round(y + (row + 0.5) * ch);
    disc(mx, my, 6, RED);
    text(label, mx - 2, my - 3, 1, WHITE);
  }
}

const FIGURES: [string, string][] = [
  ["19 KM", "LENGTH OF THE KERCH BRIDGE"],
  ["24", "SEAFARERS EVACUATED FROM THE TANKER TARA GAS"],
  ["$60M", "VALUE OF THE C-130 AIRCRAFT DAMAGED"],
  ["50.4M", "DUBAI AIRPORT PASSENGERS, JAN-SEP 2026 (DOWN 28.1%)"],
  ["$1.1TN", "YEARLY HEALTH COST OF ENDOCRINE-DISRUPTING CHEMICALS (UN)"],
  ["5", "HOUTHI DRONES SAID LAUNCHED AT SAUDI PIPELINE PUMPS"],
];

const MORE_STORIES: string[] = [
  "YEMEN RETREAT BEFORE HOUTHI",
  "EU RWANDA RETURN HUB PLAN",
  "UKRAINE ONLINE PEACE TALKS",
  "THIRD US CARRIER IN MIDEAST",
  "JUDGE BLOCKS STUDENT LIMITS",
  "BECKHAM SUES COTY FOR $41M",
  "TIGER WOODS RETURNS TO GOLF",
  "NATGEO PICTURES OF THE YEAR",
];

const ALSO_TODAY: string[] = [
  "ILLINOIS ETHANOL WORKER HELD OVER ALLEGED BOMB PLOT",
  "WAYMO ROBOTAXIS PULLED FROM FREEWAYS",
  "FLOODING IN FLORIDA; STORM IN THE WEST",
  "IRISH ACTIVIST CHARGED OVER C-130 DAMAGE",
];

function drawBottomBand(): void {
  // --- the day in figures (left column)
  text("THE DAY IN FIGURES", 24, 690, 2, INK);
  const figY = [712, 758, 804, 850, 896, 942];
  for (let i = 0; i < FIGURES.length; i++) {
    const [num, label] = FIGURES[i];
    const y = figY[i];
    const nw = textWidth(num, 3);
    text(num, 130 - nw, y, 3, RED);
    textBlock(label, 138, y + 2, 182, 1, DARK, 1);
  }
  // --- world map (centre column)
  text("WHERE THE NEWS HAPPENED", 336, 690, 2, INK);
  drawMap(336, 712, 304, 150);
  text("1 KERCH BRIDGE  2 IRAN  3 CHINA", 336, 870, 1, INK);
  text("4 USA  5 BRITAIN  6 JAPAN", 336, 884, 1, INK);
  text("ALSO TODAY", 336, 904, 2, INK);
  let ay = 926;
  for (const item of ALSO_TODAY) {
    text("- " + item, 336, ay, 1, DARK);
    ay += 14;
  }
  // --- more stories (right column)
  text("MORE STORIES", 656, 690, 2, INK);
  let my = 714;
  for (const s of MORE_STORIES) {
    text(s, 656, my, 2, INK);
    my += 26;
  }
  rect(656, 936, 344, 1, LIGHTGREY);
  textBlock("WALL STREET: MAJOR INDEXES CLOSED LOWER AS AI STOCKS LED LOSSES.", 656, 946, 344, 1, DARK, 1);
}

// ---------------------------------------------------------------------- main
function main(): void {
  fillPaper();
  drawBorder();
  drawMasthead();
  drawLead();
  drawStoryGrid();
  drawBottomBand();
  // footer
  textCentered("ALL STORIES AS REPORTED ON TUESDAY 17 NOVEMBER 2026", 512, 992, 1, GREY);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(px, W, H);
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
