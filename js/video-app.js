/* video-app.js — multi-clip upload/trim/mosh/render wiring for the video mode.
   Datamoshing works best merging two (or more) clips: each clip is trimmed
   with in/out points, and a cut-point per clip decides from where its
   I-frames get dropped — for clip 1 that melts partway through itself, for
   later clips it makes them inherit the previous clip's stale reference
   from the moment they start (the classic two-video morph). */

const API_BASE = '/api/glitch';

const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const addVideoBtn = document.getElementById('addVideoBtn');
const clipListEl = document.getElementById('clipList');
const preview = document.getElementById('preview');
const controlsEl = document.getElementById('controls');
const cleanBtn = document.getElementById('cleanBtn');
const renderBtn = document.getElementById('renderBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dimText = document.getElementById('dimText');

let clips = [];
let uidCounter = 1;
let renderedBlob = null;
let activeClipDrag = null; // { clip, target: 'in'|'out'|'cut', canvas, isFirst, draw }
const globalParams = { dupWindow: 0, dupCount: 0, noiseIntensity: 0, seed: 1 };

function setStatus(state, text) {
  statusDot.dataset.state = state;
  statusText.textContent = text;
}

/* ── Upload & prepare ── */
function addClip(file) {
  if (!file || !file.type.startsWith('video/')) return;
  const wasFirst = clips.length === 0;
  const clip = { uid: uidCounter++, name: file.name, parsed: null, error: null };
  clips.push(clip);
  renderClipList();
  updateButtons();

  const form = new FormData();
  form.append('video', file);

  fetch(`${API_BASE}/prepare`, { method: 'POST', body: form })
    .then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.arrayBuffer();
    })
    .then(buffer => {
      const parsed = Datamosh.parse(buffer);
      clip.parsed = parsed;
      clip.inFrame = 0;
      clip.outFrame = parsed.frames.length - 1;
      clip.cutPoint = wasFirst ? clip.outFrame + 1 : 0; // clip 1: clean by default; later clips: instant morph
      renderClipList();
      updateButtons();
    })
    .catch(err => {
      clip.error = err.message;
      renderClipList();
    });
}

function addFiles(fileList) {
  for (const f of fileList) addClip(f);
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
  uploadZone.style.display = clips.length === 0 ? 'block' : 'none';
  dimText.textContent = validCount > 0 ? `${validCount} Clip${validCount > 1 ? 's' : ''}` : '';
}

/* ── Clip list & per-clip timeline ── */
function renderClipList() {
  clipListEl.innerHTML = '';
  clips.forEach((clip, index) => {
    const card = document.createElement('div');
    card.className = 'clip-card';

    const header = document.createElement('div');
    header.className = 'clip-header';
    const title = document.createElement('div');
    title.className = 'clip-title';
    title.textContent = `${index + 1}. ${clip.name}`;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'clip-actions';
    if (clip.parsed) {
      const info = document.createElement('span');
      info.className = 'clip-info';
      info.textContent = `${clip.parsed.frames.length}f`;
      actions.appendChild(info);
    }
    const up = document.createElement('button');
    up.className = 'icon-btn'; up.title = 'Nach oben'; up.textContent = '↑'; up.disabled = index === 0;
    up.addEventListener('click', () => { [clips[index - 1], clips[index]] = [clips[index], clips[index - 1]]; renderClipList(); });
    actions.appendChild(up);
    const down = document.createElement('button');
    down.className = 'icon-btn'; down.title = 'Nach unten'; down.textContent = '↓'; down.disabled = index === clips.length - 1;
    down.addEventListener('click', () => { [clips[index + 1], clips[index]] = [clips[index], clips[index + 1]]; renderClipList(); });
    actions.appendChild(down);
    const remove = document.createElement('button');
    remove.className = 'icon-btn danger'; remove.title = 'Entfernen'; remove.textContent = '✕';
    remove.addEventListener('click', () => { clips = clips.filter(c => c.uid !== clip.uid); renderClipList(); updateButtons(); });
    actions.appendChild(remove);
    header.appendChild(actions);
    card.appendChild(header);

    if (clip.error) {
      const status = document.createElement('div');
      status.className = 'clip-status error';
      status.textContent = `Fehler: ${clip.error}`;
      card.appendChild(status);
    } else if (!clip.parsed) {
      const status = document.createElement('div');
      status.className = 'clip-status';
      status.textContent = 'Wird vorbereitet…';
      card.appendChild(status);
    } else {
      const canvas = document.createElement('canvas');
      canvas.className = 'timeline clip-timeline';
      card.appendChild(canvas);
      const legend = document.createElement('div');
      legend.className = 'timeline-legend';
      legend.innerHTML = '<span><i class="legend-dot legend-i"></i> I-Frame</span>' +
        '<span><i class="legend-dot legend-p"></i> P-Frame</span>' +
        '<span><i class="legend-dot legend-drop"></i> wird entfernt</span>' +
        '<span><i class="legend-dot legend-trim"></i> In/Out</span>';
      card.appendChild(legend);
      clip.canvas = canvas;
    }

    clipListEl.appendChild(card);
  });

  clips.forEach((clip, index) => {
    if (clip.parsed) wireClipTimeline(clip, index === 0);
  });
}

function snappedStart(clip, isFirst) {
  if (!isFirst) return clip.inFrame;
  const frames = clip.parsed.frames;
  let s = clip.inFrame;
  while (s > 0 && frames[s].type !== 0) s--;
  return s;
}

function drawClipTimeline(clip, isFirst) {
  const canvas = clip.canvas;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
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

function frameFromX(canvas, clientX, frameCount) {
  const rect = canvas.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  return clamp(Math.round((x / rect.width) * frameCount), 0, frameCount - 1);
}

function wireClipTimeline(clip, isFirst) {
  const canvas = clip.canvas;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(200, Math.round(rect.width));
  canvas.height = 50;

  canvas.addEventListener('mousedown', e => startClipDrag(clip, isFirst, canvas, e.clientX));
  canvas.addEventListener('touchstart', e => {
    startClipDrag(clip, isFirst, canvas, e.touches[0].clientX);
    e.preventDefault();
  }, { passive: false });

  drawClipTimeline(clip, isFirst);
}

function startClipDrag(clip, isFirst, canvas, clientX) {
  const frames = clip.parsed.frames;
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const inX = clip.inFrame / frames.length * canvas.width;
  const outX = (clip.outFrame + 1) / frames.length * canvas.width;
  const cutX = clamp(clip.cutPoint, 0, frames.length) / frames.length * canvas.width;
  const dIn = Math.abs(x - inX), dOut = Math.abs(x - outX), dCut = Math.abs(x - cutX);
  const min = Math.min(dIn, dOut, dCut);
  const target = min === dCut ? 'cut' : (min === dIn ? 'in' : 'out');
  activeClipDrag = { clip, target, canvas, isFirst };
  moveClipDrag(clientX);
}

function moveClipDrag(clientX) {
  if (!activeClipDrag) return;
  const { clip, target, canvas, isFirst } = activeClipDrag;
  const f = frameFromX(canvas, clientX, clip.parsed.frames.length);
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
document.addEventListener('mouseup', () => { activeClipDrag = null; });
document.addEventListener('touchmove', e => {
  if (activeClipDrag) { moveClipDrag(e.touches[0].clientX); e.preventDefault(); }
}, { passive: false });
document.addEventListener('touchend', () => { activeClipDrag = null; });

window.addEventListener('resize', () => {
  clips.forEach((clip, index) => { if (clip.parsed) wireClipTimeline(clip, index === 0); });
});

/* ── Global controls ── */
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

function buildControls() {
  controlsEl.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'effect-card';
  card.style.setProperty('--accent', '#FF0051');

  const body = document.createElement('div');
  body.className = 'effect-body';
  body.style.marginTop = '0'; body.style.paddingTop = '0'; body.style.borderTop = 'none';

  body.appendChild(buildSlider('Wiederhol-Fenster (Frames)', 0, 30, 1, globalParams.dupWindow, v => globalParams.dupWindow = v));
  body.appendChild(buildSlider('Wiederholungen', 0, 20, 1, globalParams.dupCount, v => globalParams.dupCount = v));

  const noiseRow = buildSlider('Byte-Rauschen', 0, 100, 1, globalParams.noiseIntensity, v => globalParams.noiseIntensity = v);
  const diceBtn = document.createElement('button');
  diceBtn.className = 'icon-btn'; diceBtn.title = 'Neu würfeln'; diceBtn.textContent = '🎲';
  diceBtn.style.marginTop = '0.3rem';
  diceBtn.addEventListener('click', () => { globalParams.seed = Math.floor(Math.random() * 1e9); });
  noiseRow.appendChild(diceBtn);
  body.appendChild(noiseRow);

  card.appendChild(body);
  controlsEl.appendChild(card);

  const hint = document.createElement('div');
  hint.className = 'timeline-hint';
  hint.textContent = 'Pro Clip: Cut-Point (rote Linie) und In/Out (orange) direkt auf dessen Timeline ziehen. Ab dem Cut-Point werden I-Frames dieses Clips entfernt — beim ersten Clip für einen internen Melt, bei späteren Clips für den Morph-Übergang vom vorigen Clip.';
  controlsEl.appendChild(hint);
}

/* ── Render ── */
function doRender(clean) {
  const validClips = clips.filter(c => c.parsed);
  if (validClips.length === 0) return;

  const opts = clean
    ? { dupWindow: 0, dupCount: 0, noiseIntensity: 0, seed: 1 }
    : { ...globalParams };

  const clipsForMerge = validClips.map(c => ({
    parsed: c.parsed,
    inFrame: c.inFrame,
    outFrame: c.outFrame,
    cutPoint: clean ? c.outFrame + 1 : c.cutPoint,
  }));

  let moshed;
  try {
    moshed = Datamosh.mergeAndMosh(clipsForMerge, opts);
  } catch (err) {
    alert(`Fehler beim Zusammenbauen: ${err.message}`);
    return;
  }

  const btn = clean ? cleanBtn : renderBtn;
  const otherBtn = clean ? renderBtn : cleanBtn;
  const originalText = btn.textContent;
  btn.disabled = true; otherBtn.disabled = true;
  btn.textContent = 'Rendert…';
  setStatus('busy', 'rendert…');

  const form = new FormData();
  form.append('video', new Blob([moshed], { type: 'video/x-msvideo' }), 'moshed.avi');

  fetch(`${API_BASE}/render`, { method: 'POST', body: form })
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
      preview.play().catch(() => {});
      downloadBtn.disabled = false;
      setStatus('ready', 'bereit');
    })
    .catch(err => {
      alert(`Rendern fehlgeschlagen: ${err.message}`);
      setStatus('ready', 'bereit');
    })
    .finally(() => {
      btn.disabled = false; otherBtn.disabled = clips.filter(c => c.parsed).length === 0;
      btn.textContent = originalText;
    });
}

cleanBtn.addEventListener('click', () => doRender(true));
renderBtn.addEventListener('click', () => doRender(false));

downloadBtn.addEventListener('click', () => {
  if (!renderedBlob) return;
  const url = URL.createObjectURL(renderedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glitch-mosh-${Date.now()}.mp4`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ── Info modal ── */
const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const closeInfoBtn = document.getElementById('closeInfoBtn');

infoBtn.addEventListener('click', () => infoModal.classList.add('open'));
closeInfoBtn.addEventListener('click', () => infoModal.classList.remove('open'));
infoModal.addEventListener('click', e => { if (e.target === infoModal) infoModal.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') infoModal.classList.remove('open'); });

buildControls();
updateButtons();
setStatus('idle', 'bereit');
