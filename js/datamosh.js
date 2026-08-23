/* datamosh.js — AVI/MPEG-4 frame-level parsing and byte manipulation.
   Real datamoshing: read the raw codec bitstream, drop/duplicate/corrupt
   frame chunks, reassemble the container. No decode, no re-encode —
   that part happens server-side via ffmpeg (see server/app.py). */

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

function dmMulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t |= 0; t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function dmReadFourCC(bytes, pos) {
  return String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
}

function dmStrToBytes(str) {
  return new Uint8Array([...str].map(c => c.charCodeAt(0)));
}

function dmVopType(bytes, offset, size) {
  const end = offset + size - 4;
  for (let i = offset; i < end; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1 && bytes[i + 3] === 0xB6) {
      return (bytes[i + 4] >> 6) & 0x3; // 0=I, 1=P, 2=B, 3=S
    }
  }
  return -1;
}

const Datamosh = {};

/* Parse an AVI file into { headerBytes, frames: [{offset,size,type}] }.
   headerBytes is everything before the 'movi' LIST — kept byte-for-byte
   so the rebuilt file preserves the original codec/format headers. */
Datamosh.parse = function (arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (dmReadFourCC(bytes, 0) !== 'RIFF' || dmReadFourCC(bytes, 8) !== 'AVI ') {
    throw new Error('Keine gültige AVI-Datei erhalten.');
  }

  let pos = 12;
  let moviStart = -1, moviSize = 0;
  while (pos + 8 <= bytes.length) {
    const fourcc = dmReadFourCC(bytes, pos);
    const size = view.getUint32(pos + 4, true);
    if (fourcc === 'LIST' && dmReadFourCC(bytes, pos + 8) === 'movi') {
      moviStart = pos; moviSize = size;
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (moviStart < 0) throw new Error('Kein movi-Chunk gefunden.');

  const headerBytes = bytes.slice(0, moviStart);
  const frames = [];
  let p = moviStart + 12;
  const moviEnd = moviStart + 8 + moviSize;
  while (p + 8 <= moviEnd) {
    const fourcc = dmReadFourCC(bytes, p);
    const size = view.getUint32(p + 4, true);
    if (fourcc === '00dc') {
      const offset = p + 8;
      frames.push({ offset, size, type: dmVopType(bytes, offset, size) });
    }
    p += 8 + size + (size % 2);
  }
  if (frames.length === 0) throw new Error('Keine Videoframes gefunden.');

  return { bytes, headerBytes, frames };
};

function dmAssemble(headerBytes, frameChunks) {
  let total = 4; // 'movi'
  for (const c of frameChunks) total += 8 + c.length + (c.length % 2);

  const moviBody = new Uint8Array(total);
  moviBody.set(dmStrToBytes('movi'), 0);
  let off = 4;
  const dcTag = dmStrToBytes('00dc');
  for (const c of frameChunks) {
    moviBody.set(dcTag, off);
    new DataView(moviBody.buffer).setUint32(off + 4, c.length, true);
    moviBody.set(c, off + 8);
    off += 8 + c.length;
    if (c.length % 2) { moviBody[off] = 0; off += 1; }
  }

  const out = new Uint8Array(headerBytes.length + 8 + moviBody.length);
  out.set(headerBytes, 0);
  out.set(dmStrToBytes('LIST'), headerBytes.length);
  new DataView(out.buffer).setUint32(headerBytes.length + 4, moviBody.length, true);
  out.set(moviBody, headerBytes.length + 8);
  new DataView(out.buffer).setUint32(4, out.length - 8, true); // RIFF size

  return out;
}

/* The actual mosh: drop I-frames from cutPoint onward (classic "remove the
   keyframe" smear), optionally repeat the P-frame window right before the
   cut (freeze/drag), optionally corrupt bytes in P-frames after the cut. */
Datamosh.mosh = function (parsed, opts) {
  const frames = parsed.frames;
  const cutPoint = opts.cutPoint;

  let sequence = [];
  for (let i = 0; i < frames.length; i++) {
    if (i > 0 && frames[i].type === 0 && i >= cutPoint) continue; // drop I-frame
    sequence.push(i);
  }

  if (opts.dupCount > 0 && opts.dupWindow > 0) {
    const windowStart = Math.max(0, cutPoint - opts.dupWindow);
    const windowEnd = Math.max(0, cutPoint - 1);
    const windowIdx = sequence.filter(i => i >= windowStart && i <= windowEnd);
    if (windowIdx.length > 0) {
      const insertAt = sequence.indexOf(windowEnd) + 1;
      const repeated = [];
      for (let r = 0; r < opts.dupCount; r++) repeated.push(...windowIdx);
      sequence = [...sequence.slice(0, insertAt), ...repeated, ...sequence.slice(insertAt)];
    }
  }

  const rand = dmMulberry32(opts.seed || 1);
  const prob = clamp(opts.noiseIntensity, 0, 100) / 100 * 0.15;
  const chunks = [];
  for (const idx of sequence) {
    const f = frames[idx];
    let data = parsed.bytes.slice(f.offset, f.offset + f.size);
    if (prob > 0 && f.type === 1 && idx >= cutPoint) {
      for (let b = 16; b < data.length; b++) {
        if (rand() < prob) data[b] = (rand() * 256) | 0;
      }
    }
    chunks.push(data);
  }

  return dmAssemble(parsed.headerBytes, chunks);
};
