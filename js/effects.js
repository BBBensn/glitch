/* effects.js — pure image effect functions, operate on ImageData */

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function clampInt(v, min, max) { return clamp(v, min, max) | 0; }

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function criterion(r, g, b, mode) {
  switch (mode) {
    case 'red': return r / 255;
    case 'green': return g / 255;
    case 'blue': return b / 255;
    case 'hue': return rgbToHsl(r, g, b)[0];
    case 'saturation': return rgbToHsl(r, g, b)[1];
    default: return (0.299 * r + 0.587 * g + 0.114 * b) / 255; // brightness
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hueToRgbChannel(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgbChannel(p, q, h + 1 / 3) * 255,
    hueToRgbChannel(p, q, h) * 255,
    hueToRgbChannel(p, q, h - 1 / 3) * 255,
  ];
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

const Effects = {};

/* ── Pixel Sort ── */
Effects.pixelSort = function (imageData, width, height, p) {
  const data = imageData.data;
  const lowT = p.low / 255, highT = p.high / 255;
  const horizontal = p.direction === 'horizontal';
  const lines = horizontal ? height : width;
  const lineLength = horizontal ? width : height;

  const idxOf = (line, pos) => {
    const x = horizontal ? pos : line;
    const y = horizontal ? line : pos;
    return (y * width + x) * 4;
  };

  for (let line = 0; line < lines; line++) {
    let pos = 0;
    while (pos < lineLength) {
      const i0 = idxOf(line, pos);
      const c0 = criterion(data[i0], data[i0 + 1], data[i0 + 2], p.sortBy);
      if (c0 < lowT || c0 > highT) { pos++; continue; }
      let end = pos;
      while (end < lineLength) {
        const i = idxOf(line, end);
        const c = criterion(data[i], data[i + 1], data[i + 2], p.sortBy);
        if (c < lowT || c > highT) break;
        end++;
      }
      const len = end - pos;
      if (len > 1) {
        const px = [];
        for (let k = pos; k < end; k++) {
          const i = idxOf(line, k);
          px.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        }
        px.sort((a, b) => {
          const ca = criterion(a[0], a[1], a[2], p.sortBy);
          const cb = criterion(b[0], b[1], b[2], p.sortBy);
          return p.reverse ? cb - ca : ca - cb;
        });
        for (let k = pos; k < end; k++) {
          const i = idxOf(line, k);
          const v = px[k - pos];
          data[i] = v[0]; data[i + 1] = v[1]; data[i + 2] = v[2]; data[i + 3] = v[3];
        }
      }
      pos = end + 1;
    }
  }
};

/* ── Dithering ── */
const FLOYD_KERNEL = [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]];
const ATKINSON_KERNEL = [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];

function quantize(value, levels) {
  const step = 255 / (levels - 1);
  return clamp(Math.round(Math.round(value / step) * step), 0, 255);
}

Effects.dither = function (imageData, width, height, p) {
  const data = imageData.data;
  const gray = p.grayscale;
  const channels = gray ? 1 : 3;
  const buf = new Float32Array(width * height * channels);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (gray) {
      buf[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    } else {
      buf[i * 3] = data[idx]; buf[i * 3 + 1] = data[idx + 1]; buf[i * 3 + 2] = data[idx + 2];
    }
  }

  const setOut = (i, c, q) => {
    const idx = i * 4;
    if (gray) { data[idx] = data[idx + 1] = data[idx + 2] = q; }
    else { data[idx + c] = q; }
  };

  const levels = p.levels;

  if (p.algorithm === 'bayer') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const threshold = (BAYER8[y % 8][x % 8] / 64 - 0.5) * (255 / levels);
        for (let c = 0; c < channels; c++) {
          setOut(i, c, quantize(clamp(buf[i * channels + c] + threshold, 0, 255), levels));
        }
      }
    }
  } else if (p.algorithm === 'random') {
    const rand = mulberry32(p.seed || 1);
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < channels; c++) {
        const n = (rand() - 0.5) * (255 / levels);
        setOut(i, c, quantize(clamp(buf[i * channels + c] + n, 0, 255), levels));
      }
    }
  } else {
    const kernel = p.algorithm === 'atkinson' ? ATKINSON_KERNEL : FLOYD_KERNEL;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        for (let c = 0; c < channels; c++) {
          const old = buf[i * channels + c];
          const q = quantize(clamp(old, 0, 255), levels);
          setOut(i, c, q);
          const err = old - q;
          for (const [dx, dy, frac] of kernel) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            buf[(ny * width + nx) * channels + c] += err * frac;
          }
        }
      }
    }
  }
};

/* ── RGB Shift / Chromatic Aberration ── */
Effects.rgbShift = function (imageData, width, height, p) {
  const src = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const rad = ((p.angle || 0) * Math.PI) / 180;
  const dx = Math.round(Math.cos(rad) * p.amount);
  const dy = Math.round(Math.sin(rad) * p.amount);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const rx = clampInt(x - dx, 0, width - 1), ry = clampInt(y - dy, 0, height - 1);
      const bx = clampInt(x + dx, 0, width - 1), by = clampInt(y + dy, 0, height - 1);
      const ridx = (ry * width + rx) * 4, bidx = (by * width + bx) * 4;
      data[idx] = src[ridx];
      data[idx + 1] = src[idx + 1];
      data[idx + 2] = src[bidx + 2];
    }
  }
};

/* ── Scanlines ── */
Effects.scanlines = function (imageData, width, height, p) {
  const data = imageData.data;
  const spacing = Math.max(1, Math.round(p.spacing));
  const thickness = Math.max(1, Math.min(Math.round(p.thickness), spacing));
  const opacity = clamp(p.opacity, 0, 1);
  for (let y = 0; y < height; y++) {
    if (y % spacing >= thickness) continue;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] *= (1 - opacity);
      data[idx + 1] *= (1 - opacity);
      data[idx + 2] *= (1 - opacity);
    }
  }
};

/* ── Noise ── */
Effects.noise = function (imageData, width, height, p) {
  const data = imageData.data;
  const rand = mulberry32(p.seed || 1);
  const amt = p.amount * 2.55;
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (p.colored) {
      data[idx] = clamp(data[idx] + (rand() - 0.5) * amt, 0, 255);
      data[idx + 1] = clamp(data[idx + 1] + (rand() - 0.5) * amt, 0, 255);
      data[idx + 2] = clamp(data[idx + 2] + (rand() - 0.5) * amt, 0, 255);
    } else {
      const n = (rand() - 0.5) * amt;
      data[idx] = clamp(data[idx] + n, 0, 255);
      data[idx + 1] = clamp(data[idx + 1] + n, 0, 255);
      data[idx + 2] = clamp(data[idx + 2] + n, 0, 255);
    }
  }
};

/* ── Block Glitch (displacement) ── */
Effects.blockGlitch = function (imageData, width, height, p) {
  const src = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const rand = mulberry32(p.seed || 1);
  const bs = Math.max(2, Math.round(p.blockSize));

  for (let by = 0; by < height; by += bs) {
    for (let bx = 0; bx < width; bx += bs) {
      if (rand() * 100 > p.intensity) continue;
      const shiftX = Math.round((rand() - 0.5) * 2 * p.maxShift);
      const bw = Math.min(bs, width - bx), bh = Math.min(bs, height - by);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const srcX = clampInt(bx + x + shiftX, 0, width - 1);
          const srcIdx = ((by + y) * width + srcX) * 4;
          const dstIdx = ((by + y) * width + (bx + x)) * 4;
          data[dstIdx] = src[srcIdx]; data[dstIdx + 1] = src[srcIdx + 1];
          data[dstIdx + 2] = src[srcIdx + 2]; data[dstIdx + 3] = src[srcIdx + 3];
        }
      }
    }
  }
};

/* ── Posterize ── */
Effects.posterize = function (imageData, width, height, p) {
  const data = imageData.data;
  const step = 255 / (p.levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.round(data[i] / step) * step);
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
  }
};

/* ── Wave Distortion ── */
Effects.wave = function (imageData, width, height, p) {
  const src = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const horizontal = p.direction === 'horizontal';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let srcX = x, srcY = y;
      if (horizontal) srcX = clampInt(x + Math.round(Math.sin(y * p.frequency) * p.amplitude), 0, width - 1);
      else srcY = clampInt(y + Math.round(Math.sin(x * p.frequency) * p.amplitude), 0, height - 1);
      const dstIdx = (y * width + x) * 4;
      const srcIdx = (srcY * width + srcX) * 4;
      data[dstIdx] = src[srcIdx]; data[dstIdx + 1] = src[srcIdx + 1];
      data[dstIdx + 2] = src[srcIdx + 2]; data[dstIdx + 3] = src[srcIdx + 3];
    }
  }
};

/* ── Pixel Drag (streaky directional smear, with slight per-channel offset
   for a chromatic-aberration-in-motion look) ── */
Effects.pixelDrag = function (imageData, width, height, p) {
  const src = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const rand = mulberry32(p.seed || 1);
  const vertical = p.direction !== 'horizontal';
  const lines = vertical ? width : height;
  const lineLen = vertical ? height : width;
  const chroma = p.chroma || 0;

  for (let i = 0; i < lines; i++) {
    if (rand() * 100 > p.density) continue;
    const maxLen = Math.max(1, Math.round(lineLen * (p.length / 100)));
    const dragLen = 1 + Math.floor(rand() * maxLen);
    const start = Math.floor(rand() * Math.max(1, lineLen - 1));
    const rOff = Math.round((rand() - 0.5) * 2 * chroma);
    const bOff = Math.round((rand() - 0.5) * 2 * chroma);
    const srcPosR = clampInt(start + rOff, 0, lineLen - 1);
    const srcPosB = clampInt(start + bOff, 0, lineLen - 1);

    for (let j = 1; j <= dragLen && start + j < lineLen; j++) {
      const dstPos = start + j;
      let dstIdx, srcIdxR, srcIdxG, srcIdxB;
      if (vertical) {
        dstIdx = (dstPos * width + i) * 4;
        srcIdxR = (srcPosR * width + i) * 4;
        srcIdxG = (start * width + i) * 4;
        srcIdxB = (srcPosB * width + i) * 4;
      } else {
        dstIdx = (i * width + dstPos) * 4;
        srcIdxR = (i * width + srcPosR) * 4;
        srcIdxG = (i * width + start) * 4;
        srcIdxB = (i * width + srcPosB) * 4;
      }
      data[dstIdx] = src[srcIdxR];
      data[dstIdx + 1] = src[srcIdxG + 1];
      data[dstIdx + 2] = src[srcIdxB + 2];
      data[dstIdx + 3] = src[srcIdxG + 3];
    }
  }
};

/* ── Basic Adjustments (Helligkeit / Kontrast / Sättigung) ── */
Effects.basicAdjust = function (imageData, width, height, p) {
  const data = imageData.data;
  const brightness = p.brightness * 2.55;
  const contrastFactor = (259 * (p.contrast + 255)) / (255 * (259 - p.contrast));
  const satFactor = 1 + p.saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] + brightness, g = data[i + 1] + brightness, b = data[i + 2] + brightness;
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;
    data[i] = clamp(r, 0, 255); data[i + 1] = clamp(g, 0, 255); data[i + 2] = clamp(b, 0, 255);
  }
};

/* ── Tone Curve (Gradationskurve) ── */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

Effects.buildCurveLUT = function (points) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8ClampedArray(256);
  for (let x = 0; x < 256; x++) {
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].x < x) i++;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const span = p2.x - p1.x;
    const t = span === 0 ? 0 : clamp((x - p1.x) / span, 0, 1);
    lut[x] = clamp(Math.round(catmullRom(p0.y, p1.y, p2.y, p3.y, t)), 0, 255);
  }
  return lut;
};

Effects.curve = function (imageData, width, height, p) {
  const lut = Effects.buildCurveLUT(p.points);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]; data[i + 1] = lut[data[i + 1]]; data[i + 2] = lut[data[i + 2]];
  }
};

/* ── Color Overlay (Farbüberlagerung) ── */
function overlayBlendChannel(base, blend) {
  return base < 128 ? (2 * base * blend / 255) : (255 - 2 * (255 - base) * (255 - blend) / 255);
}

Effects.colorOverlay = function (imageData, width, height, p) {
  const data = imageData.data;
  const [orr, org, orb] = hexToRgb(p.color);
  const amt = clamp(p.opacity, 0, 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [nr, ng, nb] = blendChannels(r, g, b, orr, org, orb, p.blend);
    data[i] = clamp(r + (nr - r) * amt, 0, 255);
    data[i + 1] = clamp(g + (ng - g) * amt, 0, 255);
    data[i + 2] = clamp(b + (nb - b) * amt, 0, 255);
  }
};

function blendChannels(r, g, b, orr, org, orb, mode) {
  switch (mode) {
    case 'multiply': return [r * orr / 255, g * org / 255, b * orb / 255];
    case 'screen': return [
      255 - (255 - r) * (255 - orr) / 255,
      255 - (255 - g) * (255 - org) / 255,
      255 - (255 - b) * (255 - orb) / 255,
    ];
    case 'overlay': return [overlayBlendChannel(r, orr), overlayBlendChannel(g, org), overlayBlendChannel(b, orb)];
    case 'color': {
      const l = rgbToHsl(r, g, b)[2];
      const [h, s] = rgbToHsl(orr, org, orb);
      return hslToRgb(h, s, l);
    }
    default: return [orr, org, orb];
  }
}

/* ── Gradient Overlay (Verlaufsüberlagerung) ── */
Effects.gradientOverlay = function (imageData, width, height, p) {
  const data = imageData.data;
  const [r1, g1, b1] = hexToRgb(p.colorStart);
  const [r2, g2, b2] = hexToRgb(p.colorEnd);
  const amt = clamp(p.opacity, 0, 100) / 100;
  const rad = (p.angle || 0) * Math.PI / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);

  const corners = [[0, 0], [width, 0], [0, height], [width, height]];
  let min = Infinity, max = -Infinity;
  for (const [cx, cy] of corners) {
    const proj = cx * dx + cy * dy;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  const span = (max - min) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const t = clamp(((x * dx + y * dy) - min) / span, 0, 1);
      const orr = r1 + (r2 - r1) * t, org = g1 + (g2 - g1) * t, orb = b1 + (b2 - b1) * t;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const [nr, ng, nb] = blendChannels(r, g, b, orr, org, orb, p.blend);
      data[idx] = clamp(r + (nr - r) * amt, 0, 255);
      data[idx + 1] = clamp(g + (ng - g) * amt, 0, 255);
      data[idx + 2] = clamp(b + (nb - b) * amt, 0, 255);
    }
  }
};

/* ── Pixelation ── */
Effects.pixelate = function (imageData, width, height, p) {
  const src = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const bs = Math.max(2, Math.round(p.blockSize));
  const rand = mulberry32(p.seed || 1);
  const disp = clamp(p.displacement, 0, 100);

  for (let by = 0; by < height; by += bs) {
    for (let bx = 0; bx < width; bx += bs) {
      const bw = Math.min(bs, width - bx), bh = Math.min(bs, height - by);
      let sbx = bx, sby = by;
      if (disp > 0 && rand() * 100 < disp) {
        const maxShift = bs * 2;
        sbx = clampInt(bx + Math.round((rand() - 0.5) * 2 * maxShift), 0, width - bw);
        sby = clampInt(by + Math.round((rand() - 0.5) * 2 * maxShift), 0, height - bh);
      }
      let r = 0, g = 0, b = 0, count = 0;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const idx = ((sby + y) * width + (sbx + x)) * 4;
          r += src[idx]; g += src[idx + 1]; b += src[idx + 2]; count++;
        }
      }
      r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const idx = ((by + y) * width + (bx + x)) * 4;
          data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
        }
      }
    }
  }
};

/* ── Invert ── */
Effects.invert = function (imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2];
  }
};

/* ── JPEG Crunch (re-compression artifacts) ── */
Effects.jpegCrunch = async function (imageData, width, height, p) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  const quality = clamp(p.quality, 1, 100) / 100;
  const passes = Math.max(1, Math.round(p.passes));
  for (let i = 0; i < passes; i++) {
    const url = canvas.toDataURL('image/jpeg', quality);
    const img = await loadImage(url);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  }
  return ctx.getImageData(0, 0, width, height);
};
