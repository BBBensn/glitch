/* video-app.js — upload/prepare/mosh/render wiring for the video (datamosh) mode */

const API_BASE = '/api/glitch';

const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const editorArea = document.getElementById('editorArea');
const videoStage = document.getElementById('videoStage');
const prepStatus = document.getElementById('prepStatus');
const timeline = document.getElementById('timeline');
const preview = document.getElementById('preview');
const controlsEl = document.getElementById('controls');
const renderBtn = document.getElementById('renderBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dimText = document.getElementById('dimText');
const newVideoBtn = document.getElementById('newVideoBtn');

let parsed = null;
let renderedBlob = null;
let dragging = false;

const params = { cutPoint: 0.5, dupWindow: 0, dupCount: 0, noiseIntensity: 0, seed: 1 };

function setStatus(state, text) {
  statusDot.dataset.state = state;
  statusText.textContent = text;
}

function getCutFrameIndex() {
  if (!parsed) return 0;
  return clamp(Math.round(params.cutPoint * parsed.frames.length), 1, parsed.frames.length);
}

/* ── Upload & prepare ── */
function loadFile(file) {
  if (!file || !file.type.startsWith('video/')) return;
  editorArea.classList.add('has-video');
  videoStage.classList.add('preparing');
  prepStatus.textContent = 'Wird hochgeladen & vorbereitet…';
  prepStatus.style.display = 'block';
  timeline.style.display = 'none';
  preview.style.display = 'none';
  renderBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus('busy', 'verarbeite…');

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
      parsed = Datamosh.parse(buffer);
      prepStatus.style.display = 'none';
      timeline.style.display = 'block';
      renderBtn.disabled = false;
      dimText.textContent = `${parsed.frames.length} Frames`;
      buildControls();
      resizeTimeline();
      drawTimeline();
      setStatus('ready', 'bereit');
    })
    .catch(err => {
      prepStatus.textContent = `Fehler: ${err.message}`;
      setStatus('idle', 'fehler');
    });
}

fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });
uploadZone.addEventListener('click', () => fileInput.click());
newVideoBtn.addEventListener('click', () => fileInput.click());

['dragover', 'dragenter'].forEach(evt =>
  uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(evt =>
  uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); })
);
uploadZone.addEventListener('drop', e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

/* ── Controls ── */
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
    drawTimeline();
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
  body.style.marginTop = '0';
  body.style.paddingTop = '0';
  body.style.borderTop = 'none';

  body.appendChild(buildSlider('Wiederhol-Fenster (Frames)', 0, 30, 1, params.dupWindow, v => params.dupWindow = v));
  body.appendChild(buildSlider('Wiederholungen', 0, 20, 1, params.dupCount, v => params.dupCount = v));

  const noiseRow = buildSlider('Byte-Rauschen', 0, 100, 1, params.noiseIntensity, v => params.noiseIntensity = v);
  const diceBtn = document.createElement('button');
  diceBtn.className = 'icon-btn'; diceBtn.title = 'Neu würfeln'; diceBtn.textContent = '🎲';
  diceBtn.style.marginTop = '0.3rem';
  diceBtn.addEventListener('click', () => { params.seed = Math.floor(Math.random() * 1e9); });
  noiseRow.appendChild(diceBtn);
  body.appendChild(noiseRow);

  card.appendChild(body);
  controlsEl.appendChild(card);

  const hint = document.createElement('div');
  hint.className = 'timeline-hint';
  hint.textContent = 'Cut-Point per Drag auf der Timeline setzen — I-Frames danach werden entfernt.';
  controlsEl.appendChild(hint);
}

/* ── Timeline ── */
function resizeTimeline() {
  const rect = timeline.getBoundingClientRect();
  timeline.width = Math.max(200, Math.round(rect.width));
  timeline.height = 70;
}
window.addEventListener('resize', () => { resizeTimeline(); drawTimeline(); });

function drawTimeline() {
  if (!parsed) return;
  const ctx = timeline.getContext('2d');
  const W = timeline.width, H = timeline.height;
  ctx.clearRect(0, 0, W, H);
  const frames = parsed.frames;
  const cutIdx = getCutFrameIndex();
  const bw = W / frames.length;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const x = i * bw;
    let color;
    if (f.type === 0) color = (i > 0 && i >= cutIdx) ? 'rgba(255,0,81,0.35)' : '#00A6FB';
    else color = (i >= cutIdx && params.noiseIntensity > 0) ? '#e8724a' : '#33333f';
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, Math.max(1, bw - 0.5), H);
  }

  const markerX = (cutIdx / frames.length) * W;
  ctx.strokeStyle = '#FF0051';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(markerX, 0); ctx.lineTo(markerX, H); ctx.stroke();
}

function setCutFromEvent(clientX) {
  const rect = timeline.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  params.cutPoint = clamp(x / rect.width, 0.02, 1);
  drawTimeline();
}

timeline.addEventListener('mousedown', e => { dragging = true; setCutFromEvent(e.clientX); });
window.addEventListener('mousemove', e => { if (dragging) setCutFromEvent(e.clientX); });
window.addEventListener('mouseup', () => { dragging = false; });
timeline.addEventListener('touchstart', e => { dragging = true; setCutFromEvent(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
window.addEventListener('touchmove', e => { if (dragging) { setCutFromEvent(e.touches[0].clientX); e.preventDefault(); } }, { passive: false });
window.addEventListener('touchend', () => { dragging = false; });

/* ── Render ── */
renderBtn.addEventListener('click', () => {
  if (!parsed) return;
  renderBtn.disabled = true;
  renderBtn.textContent = 'Rendert…';
  setStatus('busy', 'rendert…');

  const moshed = Datamosh.mosh(parsed, {
    cutPoint: getCutFrameIndex(),
    dupWindow: params.dupWindow,
    dupCount: params.dupCount,
    noiseIntensity: params.noiseIntensity,
    seed: params.seed,
  });

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
      renderBtn.disabled = false;
      renderBtn.textContent = 'Vorschau rendern';
    });
});

downloadBtn.addEventListener('click', () => {
  if (!renderedBlob) return;
  const url = URL.createObjectURL(renderedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glitch-mosh-${Date.now()}.mp4`;
  a.click();
  URL.revokeObjectURL(url);
});

setStatus('idle', 'bereit');
