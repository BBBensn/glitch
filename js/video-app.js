/* video-app.js — multi-clip upload/trim/mosh/render wiring for the video mode.
   Datamoshing works best merging two (or more) clips: each clip is trimmed
   with in/out points, and a cut-point per clip decides from where its
   I-frames get dropped — for clip 1 that melts partway through itself, for
   later clips it makes them inherit the previous clip's stale reference
   from the moment they start (the classic two-video morph).

   Clips are edited one at a time: a compact strip lists every clip, click
   selects it and its full controls (trim/cut-point, canvas fit, color,
   datamosh params, glitch filters) render into a single detail panel below
   — mirrors the photo mode's "layer list + one active layer's controls"
   pattern. Edits auto-render (debounced) instead of requiring an explicit
   button click; a manual "Jetzt aktualisieren" button forces it immediately. */

const API_BASE = '/api/glitch';
const PROXY_LONG_EDGE = 640; // working/editing resolution cap once a canvas is set — export re-prepares at full quality

const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const addVideoBtn = document.getElementById('addVideoBtn');
const clipStripEl = document.getElementById('clipStrip');
const clipDetailEl = document.getElementById('clipDetail');
const preview = document.getElementById('preview');
const cleanBtn = document.getElementById('cleanBtn');
const renderBtn = document.getElementById('renderBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dimText = document.getElementById('dimText');

let clips = [];
let uidCounter = 1;
let renderedBlob = null;
let activeClipId = null;
let activeClipDrag = null; // { clip, target: 'in'|'out'|'cut', canvas, isFirst }
let renderGeneration = 0;
let autoRenderTimer = null;

/* 0 = not yet established — the first clip's own aspect ratio (read back
   from the server via X-Video-Width/Height headers) seeds this, exactly
   like the photo mode's "first image defines the canvas" behavior. Stored
   at proxy resolution (long edge <= PROXY_LONG_EDGE); export scales it up
   proportionally to the chosen export quality. */
const canvasCfg = { w: 0, h: 0, bg: '#000000' };

function defaultClipColor() {
  return { brightness: 0, contrast: 0, saturation: 0, hue: 0, invert: false, bw: false };
}

function defaultClipDatamosh() {
  return { dupWindow: 0, dupCount: 0, noiseIntensity: 0, seed: 1 };
}

function defaultClipGlitch() {
  return {
    rgbShift: { enabled: false, amount: 8 },
    noise: { enabled: false, strength: 20 },
    pixelate: { enabled: false, blockSize: 8 },
    scanlines: { enabled: false, intensity: 40 },
  };
}

function defaultClipFit() {
  return { mode: 'cover', panX: 0, panY: 0 };
}

function setStatus(state, text) {
  statusDot.dataset.state = state;
  statusText.textContent = text;
}

function evenRound(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

/* ── Upload & prepare ──
   Shared by the initial upload and any later re-prepare (canvas/fit
   changes bake into the moshable proxy itself, so changing them requires
   a fresh /prepare call, not just a re-render). */
function prepareClip(clip) {
  const form = new FormData();
  form.append('video', clip.file);
  if (canvasCfg.w > 0 && canvasCfg.h > 0) {
    form.append('canvasW', canvasCfg.w);
    form.append('canvasH', canvasCfg.h);
    form.append('fitMode', clip.fit.mode);
    form.append('panX', clip.fit.panX);
    form.append('panY', clip.fit.panY);
    form.append('bg', canvasCfg.bg);
  }
  return fetch(`${API_BASE}/prepare`, { method: 'POST', body: form })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      if (canvasCfg.w === 0) {
        const w = parseInt(res.headers.get('X-Video-Width'), 10);
        const h = parseInt(res.headers.get('X-Video-Height'), 10);
        if (w && h) { canvasCfg.w = w; canvasCfg.h = h; }
      }
      return res.arrayBuffer();
    })
    .then(buffer => {
      clip.parsed = Datamosh.parse(buffer);
      clip.error = null;
    });
}

function reprepareClipInPlace(clip) {
  return prepareClip(clip).then(() => {
    const n = clip.parsed.frames.length;
    clip.inFrame = clamp(clip.inFrame, 0, n - 1);
    clip.outFrame = clamp(clip.outFrame, clip.inFrame + 1, n - 1);
    clip.cutPoint = clamp(clip.cutPoint, 0, n);
    clip.needsReprepare = false;
  });
}

function createClip(file) {
  const clip = {
    uid: uidCounter++, name: file.name, file, parsed: null, error: null, needsReprepare: false,
    ...defaultClipColor(), ...defaultClipDatamosh(), ...defaultClipGlitch(),
    fit: defaultClipFit(),
  };
  clips.push(clip);
  if (activeClipId === null) activeClipId = clip.uid;
  return clip;
}

function runPrepareForClip(clip, isFirstOverall) {
  return prepareClip(clip)
    .then(() => {
      clip.inFrame = 0;
      clip.outFrame = clip.parsed.frames.length - 1;
      clip.cutPoint = isFirstOverall ? clip.outFrame + 1 : 0; // clip 1: clean by default; later clips: instant morph
    })
    .catch(err => { clip.error = err.message; })
    .finally(() => {
      renderClipStrip();
      renderClipDetail();
      updateButtons();
    });
}

/* Every clip's initial /prepare call is chained through this single
   promise, across every addFiles() call for the whole session — not just
   within one batch. Without this, two clips uploaded together (or in
   quick succession) could have their /prepare responses race, and
   whichever happens to answer first would seed the shared canvas — for
   any clip other than the true first one, which would then itself get
   proxied at ITS OWN native aspect ratio (its request went out before
   the canvas was seeded), reintroducing the exact mixed-resolution merge
   bug the canvas system exists to fix. */
let uploadChain = Promise.resolve();

function addFiles(fileList) {
  const files = [...fileList].filter(f => f && f.type.startsWith('video/'));
  if (files.length === 0) return;
  const wasFirstBatch = clips.length === 0;
  const newClips = files.map(f => createClip(f));
  renderClipStrip();
  renderClipDetail();
  updateButtons();

  newClips.forEach((clip, i) => {
    const isFirstOverall = wasFirstBatch && i === 0;
    uploadChain = uploadChain.then(() => runPrepareForClip(clip, isFirstOverall)).then(scheduleAutoRender);
  });
}

fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
uploadZone.addEventListener('click', () => fileInput.click());
addVideoBtn.addEventListener('click', () => fileInput.click());

['dragover', 'dragenter'].forEach(evt =>
  uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(evt =>
  uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); })
);
uploadZone.addEventListener('drop', e => addFiles(e.dataTransfer.files));

function updateButtons() {
  const validCount = clips.filter(c => c.parsed).length;
  renderBtn.disabled = validCount === 0;
  cleanBtn.disabled = validCount === 0;
  exportBtn.disabled = validCount === 0;
  uploadZone.style.display = clips.length === 0 ? 'block' : 'none';
  dimText.textContent = validCount > 0 ? `${validCount} Clip${validCount > 1 ? 's' : ''}` : '';
}

/* ── Clip strip (compact selector) ── */
function renderClipStrip() {
  clipStripEl.innerHTML = '';
  clips.forEach((clip, index) => {
    const item = document.createElement('div');
    item.className = 'clip-strip-item' + (clip.uid === activeClipId ? ' active' : '');
    item.addEventListener('click', () => { activeClipId = clip.uid; renderClipStrip(); renderClipDetail(); });

    const title = document.createElement('div');
    title.className = 'clip-strip-title';
    title.textContent = `${index + 1}. ${clip.name}`;
    item.appendChild(title);

    const info = document.createElement('div');
    info.className = 'clip-strip-info';
    if (clip.error) info.textContent = 'Fehler';
    else if (!clip.parsed) info.textContent = 'Wird vorbereitet…';
    else info.textContent = `${clip.parsed.frames.length}f`;
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'clip-strip-actions';
    const up = document.createElement('button');
    up.className = 'icon-btn'; up.title = 'Nach oben'; up.textContent = '↑'; up.disabled = index === 0;
    up.addEventListener('click', e => {
      e.stopPropagation();
      [clips[index - 1], clips[index]] = [clips[index], clips[index - 1]];
      renderClipStrip(); renderClipDetail(); scheduleAutoRender();
    });
    actions.appendChild(up);
    const down = document.createElement('button');
    down.className = 'icon-btn'; down.title = 'Nach unten'; down.textContent = '↓'; down.disabled = index === clips.length - 1;
    down.addEventListener('click', e => {
      e.stopPropagation();
      [clips[index + 1], clips[index]] = [clips[index], clips[index + 1]];
      renderClipStrip(); renderClipDetail(); scheduleAutoRender();
    });
    actions.appendChild(down);
    const remove = document.createElement('button');
    remove.className = 'icon-btn danger'; remove.title = 'Entfernen'; remove.textContent = '✕';
    remove.addEventListener('click', e => {
      e.stopPropagation();
      clips = clips.filter(c => c.uid !== clip.uid);
      if (activeClipId === clip.uid) activeClipId = clips.length ? clips[0].uid : null;
      renderClipStrip(); renderClipDetail(); updateButtons(); scheduleAutoRender();
    });
    actions.appendChild(remove);
    item.appendChild(actions);

    clipStripEl.appendChild(item);
  });
}

/* ── Clip detail panel (the currently active clip's full controls) ── */
function buildSlider(label, min, max, step, value, onInput) {
  const row = document.createElement('div');
  row.className = 'param-row';
  const labelRow = document.createElement('div');
  labelRow.className = 'param-label-row';
  const lbl = document.createElement('span'); lbl.className = 'param-label'; lbl.textContent = label;
  const val = document.createElement('span'); val.className = 'param-value'; val.textContent = value;
  labelRow.append(lbl, val);
  const input = document.createElement('input');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = v;
    onInput(v);
  });
  row.append(labelRow, input);
  return row;
}

function buildGlitchRow(label, sublabel, fx, key, min, max, step) {
  const wrap = document.createElement('div');
  wrap.className = 'param-row';
  const checkboxLabel = document.createElement('label');
  checkboxLabel.className = 'param-checkbox';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = fx.enabled;
  checkbox.addEventListener('change', () => { fx.enabled = checkbox.checked; scheduleAutoRender(); });
  checkboxLabel.append(checkbox, document.createTextNode(label));
  wrap.appendChild(checkboxLabel);
  wrap.appendChild(buildSlider(sublabel, min, max, step, fx[key], v => { fx[key] = v; scheduleAutoRender(); }));
  return wrap;
}

function addSectionTitle(container, text) {
  const title = document.createElement('div');
  title.className = 'clip-detail-title';
  title.textContent = text;
  container.appendChild(title);
}

function renderClipDetail() {
  clipDetailEl.innerHTML = '';
  const clip = clips.find(c => c.uid === activeClipId);
  if (!clip) {
    const empty = document.createElement('div');
    empty.className = 'stack-empty';
    empty.textContent = 'Kein Clip ausgewählt.';
    clipDetailEl.appendChild(empty);
    return;
  }
  if (clip.error) {
    const status = document.createElement('div');
    status.className = 'clip-status error';
    status.textContent = `Fehler: ${clip.error}`;
    clipDetailEl.appendChild(status);
    return;
  }
  if (!clip.parsed) {
    const status = document.createElement('div');
    status.className = 'clip-status';
    status.textContent = 'Wird vorbereitet…';
    clipDetailEl.appendChild(status);
    return;
  }

  const isFirst = clips[0] === clip;

  const timelineCanvas = document.createElement('canvas');
  timelineCanvas.className = 'timeline clip-timeline';
  clipDetailEl.appendChild(timelineCanvas);
  const legend = document.createElement('div');
  legend.className = 'timeline-legend';
  legend.innerHTML = '<span><i class="legend-dot legend-i"></i> I-Frame</span>' +
    '<span><i class="legend-dot legend-p"></i> P-Frame</span>' +
    '<span><i class="legend-dot legend-drop"></i> wird entfernt</span>' +
    '<span><i class="legend-dot legend-trim"></i> In/Out</span>';
  clipDetailEl.appendChild(legend);
  clip.canvas = timelineCanvas;
  wireClipTimeline(clip, isFirst);

  /* Zuschnitt */
  const fitSection = document.createElement('div');
  fitSection.className = 'clip-detail-section';
  addSectionTitle(fitSection, 'Zuschnitt');
  const fitSelect = document.createElement('select');
  for (const [val, text] of [['cover', 'Füllen (Cover)'], ['contain', 'Einpassen (Contain)'], ['stretch', 'Strecken']]) {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = text;
    if (val === clip.fit.mode) opt.selected = true;
    fitSelect.appendChild(opt);
  }
  fitSelect.addEventListener('change', () => {
    clip.fit.mode = fitSelect.value;
    clip.needsReprepare = true;
    renderClipDetail();
    scheduleAutoRender();
  });
  fitSection.appendChild(fitSelect);
  if (clip.fit.mode === 'cover') {
    fitSection.appendChild(buildSlider('Versatz X', -100, 100, 1, Math.round(clip.fit.panX * 100), v => {
      clip.fit.panX = v / 100; clip.needsReprepare = true; scheduleAutoRender();
    }));
    fitSection.appendChild(buildSlider('Versatz Y', -100, 100, 1, Math.round(clip.fit.panY * 100), v => {
      clip.fit.panY = v / 100; clip.needsReprepare = true; scheduleAutoRender();
    }));
  }
  clipDetailEl.appendChild(fitSection);

  /* Farbe */
  const colorSection = document.createElement('div');
  colorSection.className = 'clip-detail-section';
  addSectionTitle(colorSection, 'Farbe');
  colorSection.appendChild(buildSlider('Helligkeit', -100, 100, 1, clip.brightness, v => { clip.brightness = v; scheduleAutoRender(); }));
  colorSection.appendChild(buildSlider('Kontrast', -100, 100, 1, clip.contrast, v => { clip.contrast = v; scheduleAutoRender(); }));
  colorSection.appendChild(buildSlider('Sättigung', -100, 100, 1, clip.saturation, v => { clip.saturation = v; scheduleAutoRender(); }));
  colorSection.appendChild(buildSlider('Farbton', -180, 180, 1, clip.hue, v => { clip.hue = v; scheduleAutoRender(); }));

  const invertRow = document.createElement('label');
  invertRow.className = 'param-checkbox';
  const invertInput = document.createElement('input');
  invertInput.type = 'checkbox';
  invertInput.checked = clip.invert;
  invertInput.addEventListener('change', () => { clip.invert = invertInput.checked; scheduleAutoRender(); });
  invertRow.append(invertInput, document.createTextNode('Invertieren'));
  colorSection.appendChild(invertRow);

  const bwRow = document.createElement('label');
  bwRow.className = 'param-checkbox';
  const bwInput = document.createElement('input');
  bwInput.type = 'checkbox';
  bwInput.checked = clip.bw;
  bwInput.addEventListener('change', () => { clip.bw = bwInput.checked; scheduleAutoRender(); });
  bwRow.append(bwInput, document.createTextNode('Schwarz/Weiß'));
  colorSection.appendChild(bwRow);

  const applyAllColorBtn = document.createElement('button');
  applyAllColorBtn.className = 'btn small-btn';
  applyAllColorBtn.textContent = 'Farbe auf alle Clips anwenden';
  applyAllColorBtn.addEventListener('click', () => {
    const { brightness, contrast, saturation, hue, invert, bw } = clip;
    clips.forEach(c => { if (c !== clip) Object.assign(c, { brightness, contrast, saturation, hue, invert, bw }); });
    scheduleAutoRender();
  });
  colorSection.appendChild(applyAllColorBtn);
  clipDetailEl.appendChild(colorSection);

  /* Datamosh */
  const moshSection = document.createElement('div');
  moshSection.className = 'clip-detail-section';
  addSectionTitle(moshSection, 'Datamosh');
  moshSection.appendChild(buildSlider('Wiederhol-Fenster (Frames)', 0, 30, 1, clip.dupWindow, v => { clip.dupWindow = v; scheduleAutoRender(); }));
  moshSection.appendChild(buildSlider('Wiederholungen', 0, 20, 1, clip.dupCount, v => { clip.dupCount = v; scheduleAutoRender(); }));
  const noiseRow = buildSlider('Byte-Rauschen', 0, 100, 1, clip.noiseIntensity, v => { clip.noiseIntensity = v; scheduleAutoRender(); });
  const moshDice = document.createElement('button');
  moshDice.className = 'icon-btn'; moshDice.title = 'Neu würfeln'; moshDice.textContent = '🎲';
  moshDice.style.marginTop = '0.3rem';
  moshDice.addEventListener('click', () => { clip.seed = Math.floor(Math.random() * 1e9); scheduleAutoRender(); });
  noiseRow.appendChild(moshDice);
  moshSection.appendChild(noiseRow);
  clipDetailEl.appendChild(moshSection);

  /* Glitch-Filter */
  const glitchSection = document.createElement('div');
  glitchSection.className = 'clip-detail-section';
  addSectionTitle(glitchSection, 'Glitch-Filter');
  glitchSection.appendChild(buildGlitchRow('RGB-Shift', 'Betrag', clip.rgbShift, 'amount', 0, 20, 1));
  glitchSection.appendChild(buildGlitchRow('Noise', 'Stärke', clip.noise, 'strength', 0, 100, 1));
  glitchSection.appendChild(buildGlitchRow('Pixelate', 'Blockgröße', clip.pixelate, 'blockSize', 2, 40, 1));
  glitchSection.appendChild(buildGlitchRow('Scanlines', 'Intensität', clip.scanlines, 'intensity', 0, 100, 1));
  clipDetailEl.appendChild(glitchSection);

  const hint = document.createElement('div');
  hint.className = 'timeline-hint';
  hint.textContent = 'Cut-Point (rote Linie) und In/Out (orange) direkt auf der Timeline ziehen. Ab dem Cut-Point werden I-Frames dieses Clips entfernt — beim ersten Clip für einen internen Melt, bei späteren Clips für den Morph-Übergang vom vorigen Clip.';
  clipDetailEl.appendChild(hint);
}

function snappedStart(clip, isFirst) {
  if (!isFirst) return clip.inFrame;
  const frames = clip.parsed.frames;
  let s = clip.inFrame;
  while (s > 0 && frames[s].type !== 0) s--;
  return s;
}

function drawClipTimeline(clip, isFirst) {
  const canvasEl = clip.canvas;
  const ctx = canvasEl.getContext('2d');
  const W = canvasEl.width, H = canvasEl.height;
  ctx.clearRect(0, 0, W, H);
  const frames = clip.parsed.frames;
  const bw = W / frames.length;
  const start = snappedStart(clip, isFirst);

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const inRange = i >= clip.inFrame && i <= clip.outFrame;
    let color;
    if (!inRange) {
      color = 'rgba(255,255,255,0.05)';
    } else if (f.type === 0) {
      const willDrop = i >= clip.cutPoint && !(isFirst && i === start);
      color = willDrop ? 'rgba(255,0,81,0.4)' : '#00A6FB';
    } else {
      color = '#33333f';
    }
    ctx.fillStyle = color;
    ctx.fillRect(i * bw, 0, Math.max(1, bw - 0.5), H);
  }

  const cutX = clamp(clip.cutPoint, 0, frames.length) / frames.length * W;
  ctx.strokeStyle = '#FF0051';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cutX, 0); ctx.lineTo(cutX, H); ctx.stroke();

  const inX = clip.inFrame / frames.length * W;
  const outX = (clip.outFrame + 1) / frames.length * W;
  ctx.fillStyle = '#e8724a';
  ctx.fillRect(Math.max(0, inX - 1), 0, 2, H);
  ctx.fillRect(Math.min(W - 2, outX - 1), 0, 2, H);
}

function frameFromX(canvasEl, clientX, frameCount) {
  const rect = canvasEl.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  return clamp(Math.round((x / rect.width) * frameCount), 0, frameCount - 1);
}

function wireClipTimeline(clip, isFirst) {
  const canvasEl = clip.canvas;
  const rect = canvasEl.getBoundingClientRect();
  canvasEl.width = Math.max(200, Math.round(rect.width));
  canvasEl.height = 50;

  canvasEl.addEventListener('mousedown', e => startClipDrag(clip, isFirst, canvasEl, e.clientX));
  canvasEl.addEventListener('touchstart', e => {
    startClipDrag(clip, isFirst, canvasEl, e.touches[0].clientX);
    e.preventDefault();
  }, { passive: false });

  drawClipTimeline(clip, isFirst);
}

function startClipDrag(clip, isFirst, canvasEl, clientX) {
  clearTimeout(autoRenderTimer); // don't let a debounced reprepare swap clip.parsed mid-drag
  const frames = clip.parsed.frames;
  const rect = canvasEl.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvasEl.width / rect.width);
  const inX = clip.inFrame / frames.length * canvasEl.width;
  const outX = (clip.outFrame + 1) / frames.length * canvasEl.width;
  const cutX = clamp(clip.cutPoint, 0, frames.length) / frames.length * canvasEl.width;
  const dIn = Math.abs(x - inX), dOut = Math.abs(x - outX), dCut = Math.abs(x - cutX);
  const min = Math.min(dIn, dOut, dCut);
  const target = min === dCut ? 'cut' : (min === dIn ? 'in' : 'out');
  activeClipDrag = { clip, target, canvas: canvasEl, isFirst };
  moveClipDrag(clientX);
}

function moveClipDrag(clientX) {
  if (!activeClipDrag) return;
  const { clip, target, canvas: canvasEl, isFirst } = activeClipDrag;
  const f = frameFromX(canvasEl, clientX, clip.parsed.frames.length);
  if (target === 'in') {
    clip.inFrame = clamp(f, 0, clip.outFrame - 1);
    if (clip.cutPoint < clip.inFrame) clip.cutPoint = clip.inFrame;
  } else if (target === 'out') {
    clip.outFrame = clamp(f, clip.inFrame + 1, clip.parsed.frames.length - 1);
  } else {
    clip.cutPoint = clamp(f, clip.inFrame, clip.outFrame + 1);
  }
  drawClipTimeline(clip, isFirst);
}

document.addEventListener('mousemove', e => moveClipDrag(e.clientX));
document.addEventListener('mouseup', () => {
  if (activeClipDrag) scheduleAutoRender();
  activeClipDrag = null;
});
document.addEventListener('touchmove', e => {
  if (activeClipDrag) { moveClipDrag(e.touches[0].clientX); e.preventDefault(); }
}, { passive: false });
document.addEventListener('touchend', () => {
  if (activeClipDrag) scheduleAutoRender();
  activeClipDrag = null;
});

window.addEventListener('resize', () => {
  const clip = clips.find(c => c.uid === activeClipId);
  if (clip && clip.parsed) wireClipTimeline(clip, clips[0] === clip);
});

/* ── Leinwand (canvas) modal ── */
const canvasModal = document.getElementById('canvasModal');
document.getElementById('canvasBtn').addEventListener('click', () => {
  const widthInput = document.getElementById('canvasWidthInput');
  const heightInput = document.getElementById('canvasHeightInput');
  widthInput.value = canvasCfg.w || 1080;
  heightInput.value = canvasCfg.h || 1920;
  document.getElementById('canvasBgColor').value = canvasCfg.bg;
  canvasModal.classList.add('open');
});
document.getElementById('closeCanvasModalBtn').addEventListener('click', () => canvasModal.classList.remove('open'));
canvasModal.addEventListener('click', e => { if (e.target === canvasModal) canvasModal.classList.remove('open'); });

function setCanvasPreset(w, h) {
  document.getElementById('canvasWidthInput').value = w;
  document.getElementById('canvasHeightInput').value = h;
}
document.getElementById('presetPortraitBtn').addEventListener('click', () => setCanvasPreset(1080, 1920));
document.getElementById('presetSquareBtn').addEventListener('click', () => setCanvasPreset(1080, 1080));
document.getElementById('presetLandscapeBtn').addEventListener('click', () => setCanvasPreset(1920, 1080));

document.getElementById('applyCanvasBtn').addEventListener('click', () => {
  const w = clamp(parseInt(document.getElementById('canvasWidthInput').value, 10) || 1080, 16, 1920);
  const h = clamp(parseInt(document.getElementById('canvasHeightInput').value, 10) || 1920, 16, 1920);
  const scale = Math.min(1, PROXY_LONG_EDGE / Math.max(w, h));
  canvasCfg.w = evenRound(w * scale);
  canvasCfg.h = evenRound(h * scale);
  canvasCfg.bg = document.getElementById('canvasBgColor').value;
  canvasModal.classList.remove('open');
  clips.forEach(c => { if (c.parsed) c.needsReprepare = true; });
  renderClipDetail();
  scheduleAutoRender();
});

/* Maps mergeResult.segments (frame ranges in the merged/moshed output) to
   each source clip's own color grading + glitch filters, for the server's
   per-segment ffmpeg filter_complex. colorClips must be indexable the same
   way the clips were passed into Datamosh.mergeAndMosh (i.e. clip i's
   settings live at colorClips[i]) — the reprepared clips used for export
   don't carry these fields themselves, so callers pass the original clip
   objects here. */
function buildSegmentsPayload(colorClips, mergeResult) {
  return mergeResult.segments.map(seg => {
    const c = colorClips[seg.clipIndex];
    return {
      start: seg.start, end: seg.end,
      brightness: c.brightness, contrast: c.contrast, saturation: c.saturation,
      hue: c.hue, invert: c.invert, bw: c.bw,
      rgbShift: c.rgbShift, noise: c.noise, pixelate: c.pixelate, scanlines: c.scanlines,
    };
  });
}

/* ── Render ── */
function doRender(clean, generation) {
  const validClips = clips.filter(c => c.parsed);
  if (validClips.length === 0) return Promise.resolve();

  const clipsForMerge = validClips.map(c => ({
    parsed: c.parsed,
    inFrame: c.inFrame,
    outFrame: c.outFrame,
    cutPoint: clean ? c.outFrame + 1 : c.cutPoint,
    dupWindow: clean ? 0 : c.dupWindow,
    dupCount: clean ? 0 : c.dupCount,
    noiseIntensity: clean ? 0 : c.noiseIntensity,
    seed: c.seed,
  }));

  let mergeResult;
  try {
    mergeResult = Datamosh.mergeAndMosh(clipsForMerge);
  } catch (err) {
    alert(`Fehler beim Zusammenbauen: ${err.message}`);
    return Promise.resolve();
  }

  setStatus('busy', 'rendert…');

  const form = new FormData();
  form.append('video', new Blob([mergeResult.bytes], { type: 'video/x-msvideo' }), 'moshed.avi');
  form.append('segments', JSON.stringify(buildSegmentsPayload(validClips, mergeResult)));

  return fetch(`${API_BASE}/render`, { method: 'POST', body: form })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.blob();
    })
    .then(blob => {
      if (generation !== undefined && generation !== renderGeneration) return; // superseded by a newer edit
      renderedBlob = blob;
      preview.src = URL.createObjectURL(blob);
      preview.style.display = 'block';
      preview.play().catch(() => {});
      downloadBtn.disabled = false;
      setStatus('ready', 'bereit');
    })
    .catch(err => {
      if (generation !== undefined && generation !== renderGeneration) return;
      setStatus('ready', 'bereit');
      console.error('Rendern fehlgeschlagen:', err.message);
    });
}

/* ── Auto-render: debounced, with a generation counter so a stale response
   from a superseded request can never overwrite a newer one's result. ── */
function scheduleAutoRender() {
  clearTimeout(autoRenderTimer);
  autoRenderTimer = setTimeout(runAutoRender, 700);
}

async function runAutoRender() {
  const myGen = ++renderGeneration;
  const dirty = clips.filter(c => c.needsReprepare && c.parsed);
  if (dirty.length) setStatus('busy', 'bereite vor…');
  for (const c of dirty) {
    if (myGen !== renderGeneration) return; // superseded before we even got to render
    try {
      await reprepareClipInPlace(c);
    } catch (err) {
      c.error = err.message;
      renderClipStrip();
      renderClipDetail();
      return;
    }
  }
  if (dirty.length) { renderClipStrip(); renderClipDetail(); }
  if (myGen !== renderGeneration) return;
  await doRender(false, myGen);
}

cleanBtn.addEventListener('click', () => {
  cleanBtn.disabled = true;
  doRender(true).finally(() => { cleanBtn.disabled = clips.filter(c => c.parsed).length === 0; });
});
renderBtn.addEventListener('click', () => { clearTimeout(autoRenderTimer); runAutoRender(); });

downloadBtn.addEventListener('click', () => {
  if (!renderedBlob) return;
  const url = URL.createObjectURL(renderedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glitch-mosh-${Date.now()}.mp4`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ── High-quality export (re-prepares each clip at the export resolution,
   scaled up from the canvas's proxy size while keeping its aspect ratio —
   re-applies the same trim/cut-point/mosh/fit decisions, frame indices
   stay valid since fps/GOP don't depend on resolution) ── */
const qualitySelect = document.getElementById('qualitySelect');
const exportBtn = document.getElementById('exportBtn');

function reprepareClipForExport(clip, w, h) {
  const form = new FormData();
  form.append('video', clip.file);
  form.append('canvasW', w);
  form.append('canvasH', h);
  form.append('fitMode', clip.fit.mode);
  form.append('panX', clip.fit.panX);
  form.append('panY', clip.fit.panY);
  form.append('bg', canvasCfg.bg);
  return fetch(`${API_BASE}/prepare`, { method: 'POST', body: form })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(`${clip.name}: ${err.error || `HTTP ${res.status}`}`);
      }
      return res.arrayBuffer();
    })
    .then(buffer => {
      const parsed = Datamosh.parse(buffer);
      const n = parsed.frames.length;
      return {
        parsed,
        inFrame: clamp(clip.inFrame, 0, n - 1),
        outFrame: clamp(clip.outFrame, 1, n - 1),
        cutPoint: clamp(clip.cutPoint, 0, n),
        dupWindow: clip.dupWindow, dupCount: clip.dupCount,
        noiseIntensity: clip.noiseIntensity, seed: clip.seed,
      };
    });
}

exportBtn.addEventListener('click', () => {
  const validClips = clips.filter(c => c.parsed && c.file);
  if (validClips.length === 0 || canvasCfg.w === 0) return;
  const targetLongEdge = parseInt(qualitySelect.value, 10);
  const scale = targetLongEdge / Math.max(canvasCfg.w, canvasCfg.h);
  const w = evenRound(canvasCfg.w * scale);
  const h = evenRound(canvasCfg.h * scale);

  const originalText = exportBtn.textContent;
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exportiert…';
  setStatus('busy', 'exportiert…');

  Promise.all(validClips.map(c => reprepareClipForExport(c, w, h)))
    .then(clipsForMerge => {
      const mergeResult = Datamosh.mergeAndMosh(clipsForMerge);
      const form = new FormData();
      form.append('video', new Blob([mergeResult.bytes], { type: 'video/x-msvideo' }), 'moshed.avi');
      form.append('segments', JSON.stringify(buildSegmentsPayload(validClips, mergeResult)));
      form.append('quality', 'high');
      return fetch(`${API_BASE}/render`, { method: 'POST', body: form });
    })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.blob();
    })
    .then(blob => {
      renderedBlob = blob;
      preview.src = URL.createObjectURL(blob);
      preview.style.display = 'block';
      downloadBtn.disabled = false;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glitch-mosh-${w}x${h}-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('ready', 'bereit');
    })
    .catch(err => {
      alert(`Export fehlgeschlagen: ${err.message}`);
      setStatus('ready', 'bereit');
    })
    .finally(() => {
      exportBtn.disabled = clips.filter(c => c.parsed).length === 0;
      exportBtn.textContent = originalText;
    });
});

/* ── Info modal ── */
const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const closeInfoBtn = document.getElementById('closeInfoBtn');

infoBtn.addEventListener('click', () => infoModal.classList.add('open'));
closeInfoBtn.addEventListener('click', () => infoModal.classList.remove('open'));
infoModal.addEventListener('click', e => { if (e.target === infoModal) infoModal.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') infoModal.classList.remove('open'); });

renderClipStrip();
renderClipDetail();
updateButtons();
setStatus('idle', 'bereit');
