/* app.js — UI wiring, canvas pipeline, effect stack management */

const MAX_DIM = 1600;

const EFFECT_DEFS = [
  {
    id: 'basicAdjust', label: 'Grundkorrektur', color: '#facc15',
    apply: Effects.basicAdjust,
    params: [
      { key: 'brightness', label: 'Helligkeit', type: 'range', min: -100, max: 100, step: 1, default: 0 },
      { key: 'contrast', label: 'Kontrast', type: 'range', min: -100, max: 100, step: 1, default: 0 },
      { key: 'saturation', label: 'Sättigung', type: 'range', min: -100, max: 100, step: 1, default: 0 },
    ],
  },
  {
    id: 'curve', label: 'Gradationskurve', color: '#a78bfa',
    apply: Effects.curve,
    params: [
      { key: 'points', label: 'Kurve', type: 'curve', default: [{ x: 0, y: 0 }, { x: 255, y: 255 }] },
    ],
  },
  {
    id: 'colorOverlay', label: 'Farbüberlagerung', color: '#fb7185',
    apply: Effects.colorOverlay,
    params: [
      { key: 'color', label: 'Farbe', type: 'color', default: '#ff0051' },
      { key: 'blend', label: 'Modus', type: 'select', default: 'normal',
        options: [['normal', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ multiplizieren'],
                  ['overlay', 'Ineinanderkopieren'], ['color', 'Farbton']] },
      { key: 'opacity', label: 'Deckkraft', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    ],
  },
  {
    id: 'gradientOverlay', label: 'Verlaufsüberlagerung', color: '#c026d3',
    apply: Effects.gradientOverlay,
    params: [
      { key: 'colorStart', label: 'Farbe 1', type: 'color', default: '#00A6FB' },
      { key: 'colorEnd', label: 'Farbe 2', type: 'color', default: '#FF0051' },
      { key: 'angle', label: 'Winkel (°)', type: 'range', min: 0, max: 360, step: 1, default: 45 },
      { key: 'blend', label: 'Modus', type: 'select', default: 'normal',
        options: [['normal', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ multiplizieren'],
                  ['overlay', 'Ineinanderkopieren'], ['color', 'Farbton']] },
      { key: 'opacity', label: 'Deckkraft', type: 'range', min: 0, max: 100, step: 1, default: 50 },
    ],
  },
  {
    id: 'pixelate', label: 'Pixelation', color: '#2dd4bf',
    apply: Effects.pixelate,
    params: [
      { key: 'blockSize', label: 'Blockgröße (px)', type: 'range', min: 2, max: 100, step: 1, default: 20, scalesWithResolution: true },
      { key: 'displacement', label: 'Displacement', type: 'range', min: 0, max: 100, step: 1, default: 0 },
      { key: 'seed', label: '', type: 'seed', default: 1 },
    ],
  },
  {
    id: 'pixelsort', label: 'Pixel Sort', color: '#00A6FB',
    apply: Effects.pixelSort,
    params: [
      { key: 'direction', label: 'Richtung', type: 'select', default: 'horizontal',
        options: [['horizontal', 'Horizontal'], ['vertical', 'Vertikal']] },
      { key: 'sortBy', label: 'Sortieren nach', type: 'select', default: 'brightness',
        options: [['brightness', 'Helligkeit'], ['hue', 'Farbton'], ['saturation', 'Sättigung'],
                  ['red', 'Rot'], ['green', 'Grün'], ['blue', 'Blau']] },
      { key: 'low', label: 'Schwelle min', type: 'range', min: 0, max: 255, step: 1, default: 60 },
      { key: 'high', label: 'Schwelle max', type: 'range', min: 0, max: 255, step: 1, default: 200 },
      { key: 'reverse', label: 'Umkehren', type: 'checkbox', default: false },
    ],
  },
  {
    id: 'dither', label: 'Dithering', color: '#FF0051',
    apply: Effects.dither,
    params: [
      { key: 'algorithm', label: 'Algorithmus', type: 'select', default: 'floyd-steinberg',
        options: [['floyd-steinberg', 'Floyd–Steinberg'], ['atkinson', 'Atkinson'],
                  ['bayer', 'Bayer (Ordered)'], ['random', 'Random Threshold']] },
      { key: 'levels', label: 'Stufen pro Kanal', type: 'range', min: 2, max: 8, step: 1, default: 2 },
      { key: 'grayscale', label: 'Graustufen', type: 'checkbox', default: true },
      { key: 'seed', label: '', type: 'seed', default: 1 },
    ],
  },
  {
    id: 'rgbshift', label: 'RGB Shift', color: '#6622cc',
    apply: Effects.rgbShift,
    params: [
      { key: 'amount', label: 'Stärke (px)', type: 'range', min: 0, max: 60, step: 1, default: 8, scalesWithResolution: true },
      { key: 'angle', label: 'Winkel (°)', type: 'range', min: 0, max: 360, step: 1, default: 0 },
    ],
  },
  {
    id: 'scanlines', label: 'Scanlines', color: '#00d4d4',
    apply: Effects.scanlines,
    params: [
      { key: 'spacing', label: 'Abstand (px)', type: 'range', min: 2, max: 20, step: 1, default: 4, scalesWithResolution: true },
      { key: 'thickness', label: 'Dicke (px)', type: 'range', min: 1, max: 10, step: 1, default: 1, scalesWithResolution: true },
      { key: 'opacity', label: 'Deckkraft', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    ],
  },
  {
    id: 'noise', label: 'Noise', color: '#e8724a',
    apply: Effects.noise,
    params: [
      { key: 'amount', label: 'Stärke', type: 'range', min: 0, max: 100, step: 1, default: 25 },
      { key: 'colored', label: 'Farbig', type: 'checkbox', default: false },
      { key: 'seed', label: '', type: 'seed', default: 1 },
    ],
  },
  {
    id: 'blockglitch', label: 'Block Glitch', color: '#f96f5d',
    apply: Effects.blockGlitch,
    params: [
      { key: 'blockSize', label: 'Blockgröße (px)', type: 'range', min: 2, max: 100, step: 1, default: 16, scalesWithResolution: true },
      { key: 'intensity', label: 'Intensität', type: 'range', min: 0, max: 100, step: 1, default: 30 },
      { key: 'maxShift', label: 'Max. Versatz (px)', type: 'range', min: 1, max: 200, step: 1, default: 40, scalesWithResolution: true },
      { key: 'seed', label: '', type: 'seed', default: 1 },
    ],
  },
  {
    id: 'posterize', label: 'Posterize', color: '#e5b181',
    apply: Effects.posterize,
    params: [
      { key: 'levels', label: 'Farbstufen', type: 'range', min: 2, max: 16, step: 1, default: 4 },
    ],
  },
  {
    id: 'wave', label: 'Wave Distortion', color: '#4ade80',
    apply: Effects.wave,
    params: [
      { key: 'direction', label: 'Richtung', type: 'select', default: 'horizontal',
        options: [['horizontal', 'Horizontal'], ['vertical', 'Vertikal']] },
      { key: 'amplitude', label: 'Amplitude (px)', type: 'range', min: 1, max: 100, step: 1, default: 15, scalesWithResolution: true },
      { key: 'frequency', label: 'Frequenz', type: 'range', min: 0.01, max: 0.3, step: 0.01, default: 0.05 },
    ],
  },
  {
    id: 'jpegcrunch', label: 'JPEG Crunch', color: '#C9B6BE',
    apply: Effects.jpegCrunch,
    params: [
      { key: 'quality', label: 'Qualität', type: 'range', min: 1, max: 100, step: 1, default: 10 },
      { key: 'passes', label: 'Durchläufe', type: 'range', min: 1, max: 5, step: 1, default: 2 },
    ],
  },
  {
    id: 'invert', label: 'Invert', color: '#666660',
    apply: Effects.invert,
    params: [],
  },
];

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const editorArea = document.getElementById('editorArea');
const canvasStage = document.getElementById('canvasStage');
const effectStackEl = document.getElementById('effectStack');
const addEffectSelect = document.getElementById('addEffectSelect');
const layerListEl = document.getElementById('layerList');
const activeLayerLabel = document.getElementById('activeLayerLabel');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dimText = document.getElementById('dimText');

const EXPORT_MAX_DIM = 4000;

const BLEND_MODES = [
  ['source-over', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ multiplizieren'],
  ['overlay', 'Ineinanderkopieren'], ['darken', 'Abdunkeln'], ['lighten', 'Aufhellen'],
  ['color-dodge', 'Farbig abwedeln'], ['color-burn', 'Farbig nachbelichten'],
  ['hard-light', 'Hartes Licht'], ['soft-light', 'Weiches Licht'],
  ['difference', 'Differenz'], ['exclusion', 'Ausschluss'],
  ['hue', 'Farbton'], ['saturation', 'Sättigung'], ['color', 'Farbe'], ['luminosity', 'Luminanz'],
];

let canvasW = 0, canvasH = 0, canvasBg = 'white';
let layers = []; // bottom -> top
let activeLayerId = null;
let uidCounter = 1;
let isRendering = false, pending = false;
let layerDrag = null; // { layer, offsetX, offsetY } — dragging a layer's position on the canvas

function setStatus(state, text) {
  statusDot.dataset.state = state;
  statusText.textContent = text;
}

function getActiveLayer() {
  return layers.find(l => l.uid === activeLayerId) || null;
}

function markActiveLayerDirty() {
  const layer = getActiveLayer();
  if (layer) layer.dirty = true;
}

function defaultParams(def) {
  const p = {};
  for (const param of def.params) {
    p[param.key] = Array.isArray(param.default) ? param.default.map(pt => ({ ...pt })) : param.default;
  }
  return p;
}

function populateAddEffectSelect() {
  addEffectSelect.innerHTML = '<option value="">+ Effekt hinzufügen</option>';
  for (const def of EFFECT_DEFS) {
    const opt = document.createElement('option');
    opt.value = def.id;
    opt.textContent = def.label;
    addEffectSelect.appendChild(opt);
  }
}

addEffectSelect.addEventListener('change', () => {
  const defId = addEffectSelect.value;
  const layer = getActiveLayer();
  if (!defId || !layer) return;
  const def = EFFECT_DEFS.find(d => d.id === defId);
  layer.stack.push({ uid: uidCounter++, defId, params: defaultParams(def), enabled: true });
  addEffectSelect.value = '';
  layer.dirty = true;
  renderStackUI();
  scheduleRender();
});

/* ── Layers panel ── */
function renderLayerList() {
  layerListEl.innerHTML = '';
  layers.forEach((layer, index) => {
    const card = document.createElement('div');
    card.className = 'layer-card';
    if (layer.uid === activeLayerId) card.classList.add('active');
    if (!layer.visible) card.classList.add('hidden-layer');

    const header = document.createElement('div');
    header.className = 'layer-header';

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Ziehen zum Umsortieren';
    handle.textContent = '⠿';
    handle.draggable = true;
    handle.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(layer.uid));
      card.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => card.classList.remove('dragging'));
    header.appendChild(handle);

    const visBtn = document.createElement('button');
    visBtn.className = 'icon-btn'; visBtn.title = layer.visible ? 'Ausblenden' : 'Einblenden';
    visBtn.textContent = layer.visible ? '👁' : '🚫';
    visBtn.addEventListener('click', e => { e.stopPropagation(); layer.visible = !layer.visible; renderLayerList(); scheduleRender(); });
    header.appendChild(visBtn);

    const title = document.createElement('div');
    title.className = 'layer-title';
    title.textContent = layer.name;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'layer-actions';
    const up = document.createElement('button');
    up.className = 'icon-btn'; up.title = 'Nach oben'; up.textContent = '↑'; up.disabled = index === layers.length - 1;
    up.addEventListener('click', e => { e.stopPropagation(); [layers[index + 1], layers[index]] = [layers[index], layers[index + 1]]; renderLayerList(); scheduleRender(); });
    actions.appendChild(up);
    const down = document.createElement('button');
    down.className = 'icon-btn'; down.title = 'Nach unten'; down.textContent = '↓'; down.disabled = index === 0;
    down.addEventListener('click', e => { e.stopPropagation(); [layers[index - 1], layers[index]] = [layers[index], layers[index - 1]]; renderLayerList(); scheduleRender(); });
    actions.appendChild(down);
    const remove = document.createElement('button');
    remove.className = 'icon-btn danger'; remove.title = 'Entfernen'; remove.textContent = '✕';
    remove.addEventListener('click', e => {
      e.stopPropagation();
      layers = layers.filter(l => l.uid !== layer.uid);
      if (activeLayerId === layer.uid) activeLayerId = layers.length ? layers[layers.length - 1].uid : null;
      renderLayerList(); renderStackUI(); scheduleRender();
    });
    actions.appendChild(remove);
    header.appendChild(actions);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'layer-body';

    const blendSelect = document.createElement('select');
    for (const [val, text] of BLEND_MODES) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = text;
      if (val === layer.blendMode) opt.selected = true;
      blendSelect.appendChild(opt);
    }
    blendSelect.addEventListener('click', e => e.stopPropagation());
    blendSelect.addEventListener('change', () => { layer.blendMode = blendSelect.value; scheduleRender(); });
    body.appendChild(blendSelect);

    body.appendChild(buildInlineSlider('Deckkraft', 0, 100, 1, layer.opacity, v => { layer.opacity = v; scheduleRender(); }));
    body.appendChild(buildInlineSlider('Größe', 10, 300, 1, Math.round(layer.scalePct), v => { resizeLayer(layer, v); scheduleRender(); }));

    card.appendChild(body);

    card.addEventListener('click', () => { activeLayerId = layer.uid; renderLayerList(); renderStackUI(); });

    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggedUid = Number(e.dataTransfer.getData('text/plain'));
      const fromIndex = layers.findIndex(l => l.uid === draggedUid);
      const toIndex = layers.findIndex(l => l.uid === layer.uid);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const [moved] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, moved);
      renderLayerList();
      scheduleRender();
    });

    layerListEl.appendChild(card);
  });

  const active = getActiveLayer();
  activeLayerLabel.textContent = active ? active.name : '–';
}

function buildInlineSlider(label, min, max, step, value, onInput) {
  const row = document.createElement('div');
  row.className = 'param-row';
  const labelRow = document.createElement('div');
  labelRow.className = 'param-label-row';
  const lbl = document.createElement('span'); lbl.className = 'param-label'; lbl.textContent = label;
  const val = document.createElement('span'); val.className = 'param-value'; val.textContent = value;
  labelRow.append(lbl, val);
  const input = document.createElement('input');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = Math.round(v);
    onInput(v);
  });
  row.append(labelRow, input);
  return row;
}

function resizeLayer(layer, scalePct) {
  const scale = scalePct / 100;
  const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
  const w = layer.baseW * scale, h = layer.baseH * scale;
  layer.w = w; layer.h = h;
  layer.x = cx - w / 2; layer.y = cy - h / 2;
  layer.scalePct = scalePct;
}

/* ── Effect stack (of the active layer) ── */
function renderStackUI() {
  effectStackEl.innerHTML = '';
  const layer = getActiveLayer();
  if (!layer) {
    const empty = document.createElement('div');
    empty.className = 'stack-empty';
    empty.textContent = 'Keine Ebene ausgewählt.';
    effectStackEl.appendChild(empty);
    return;
  }
  const fxStack = layer.stack;
  if (fxStack.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stack-empty';
    empty.textContent = 'Noch keine Effekte — oben hinzufügen.';
    effectStackEl.appendChild(empty);
    return;
  }

  fxStack.forEach((fx, index) => {
    const def = EFFECT_DEFS.find(d => d.id === fx.defId);
    const card = document.createElement('div');
    card.className = 'effect-card';
    card.style.setProperty('--accent', def.color);
    if (!fx.enabled) card.classList.add('disabled');

    const header = document.createElement('div');
    header.className = 'effect-header';

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Ziehen zum Umsortieren';
    handle.textContent = '⠿';
    handle.draggable = true;
    handle.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(fx.uid));
      card.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => card.classList.remove('dragging'));
    header.appendChild(handle);

    const title = document.createElement('div');
    title.className = 'effect-title';
    title.innerHTML = `<span class="effect-dot"></span>${def.label}`;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'effect-actions';

    const hasSeed = def.params.some(p => p.type === 'seed');
    if (hasSeed) {
      const dice = document.createElement('button');
      dice.className = 'icon-btn'; dice.title = 'Neu würfeln'; dice.textContent = '🎲';
      dice.addEventListener('click', () => {
        for (const p of def.params) if (p.type === 'seed') fx.params[p.key] = Math.floor(Math.random() * 1e9);
        markActiveLayerDirty(); scheduleRender();
      });
      actions.appendChild(dice);
    }

    const up = document.createElement('button');
    up.className = 'icon-btn'; up.title = 'Nach oben'; up.textContent = '↑';
    up.disabled = index === 0;
    up.addEventListener('click', () => { [fxStack[index - 1], fxStack[index]] = [fxStack[index], fxStack[index - 1]]; markActiveLayerDirty(); renderStackUI(); scheduleRender(); });
    actions.appendChild(up);

    const down = document.createElement('button');
    down.className = 'icon-btn'; down.title = 'Nach unten'; down.textContent = '↓';
    down.disabled = index === fxStack.length - 1;
    down.addEventListener('click', () => { [fxStack[index + 1], fxStack[index]] = [fxStack[index], fxStack[index + 1]]; markActiveLayerDirty(); renderStackUI(); scheduleRender(); });
    actions.appendChild(down);

    const toggle = document.createElement('button');
    toggle.className = 'icon-btn'; toggle.title = fx.enabled ? 'Deaktivieren' : 'Aktivieren';
    toggle.textContent = fx.enabled ? '⏵' : '⏸';
    toggle.addEventListener('click', () => { fx.enabled = !fx.enabled; markActiveLayerDirty(); renderStackUI(); scheduleRender(); });
    actions.appendChild(toggle);

    const remove = document.createElement('button');
    remove.className = 'icon-btn danger'; remove.title = 'Entfernen'; remove.textContent = '✕';
    remove.addEventListener('click', () => { layer.stack = layer.stack.filter(l => l.uid !== fx.uid); markActiveLayerDirty(); renderStackUI(); scheduleRender(); });
    actions.appendChild(remove);

    header.appendChild(actions);
    card.appendChild(header);

    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const draggedUid = Number(e.dataTransfer.getData('text/plain'));
      const fromIndex = fxStack.findIndex(l => l.uid === draggedUid);
      const toIndex = fxStack.findIndex(l => l.uid === fx.uid);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      const [moved] = fxStack.splice(fromIndex, 1);
      fxStack.splice(toIndex, 0, moved);
      markActiveLayerDirty();
      renderStackUI();
      scheduleRender();
    });

    const body = document.createElement('div');
    body.className = 'effect-body';
    for (const param of def.params) {
      if (param.type === 'seed') continue;
      body.appendChild(buildParamControl(fx, param));
    }
    if (body.children.length > 0) card.appendChild(body);

    effectStackEl.appendChild(card);
  });
}

function buildParamControl(fx, param) {
  const row = document.createElement('div');
  row.className = 'param-row';

  if (param.type === 'checkbox') {
    const label = document.createElement('label');
    label.className = 'param-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = fx.params[param.key];
    input.addEventListener('change', () => { fx.params[param.key] = input.checked; markActiveLayerDirty(); scheduleRender(); });
    label.appendChild(input);
    label.appendChild(document.createTextNode(param.label));
    row.appendChild(label);
    return row;
  }

  if (param.type === 'select') {
    const label = document.createElement('label');
    label.className = 'param-label';
    label.textContent = param.label;
    const select = document.createElement('select');
    for (const [val, text] of param.options) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = text;
      if (val === fx.params[param.key]) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => { fx.params[param.key] = select.value; markActiveLayerDirty(); scheduleRender(); });
    row.appendChild(label);
    row.appendChild(select);
    return row;
  }

  if (param.type === 'color') {
    const label = document.createElement('label');
    label.className = 'param-label';
    label.textContent = param.label;
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'param-color';
    input.value = fx.params[param.key];
    input.addEventListener('input', () => { fx.params[param.key] = input.value; markActiveLayerDirty(); scheduleRender(); });
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  if (param.type === 'curve') {
    return buildCurveControl(fx, param);
  }

  // range
  const labelRow = document.createElement('div');
  labelRow.className = 'param-label-row';
  const label = document.createElement('span');
  label.className = 'param-label';
  label.textContent = param.label;
  const value = document.createElement('span');
  value.className = 'param-value';
  value.textContent = fx.params[param.key];
  labelRow.appendChild(label);
  labelRow.appendChild(value);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = param.min; input.max = param.max; input.step = param.step;
  input.value = fx.params[param.key];
  input.addEventListener('input', () => {
    fx.params[param.key] = parseFloat(input.value);
    value.textContent = input.value;
    markActiveLayerDirty();
    scheduleRender();
  });

  row.appendChild(labelRow);
  row.appendChild(input);
  return row;
}

const CURVE_SIZE = 200;
let curveDrag = null; // { pts, index, canvas, minX, maxX }

function curveEventXY(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cx = clamp((clientX - rect.left) * (CURVE_SIZE / rect.width), 0, CURVE_SIZE);
  const cy = clamp((clientY - rect.top) * (CURVE_SIZE / rect.height), 0, CURVE_SIZE);
  return [cx, cy];
}
function curveToCanvasXY(px, py) { return [px / 255 * CURVE_SIZE, CURVE_SIZE - py / 255 * CURVE_SIZE]; }
function curveToDataXY(cx, cy) {
  return [clamp(Math.round(cx / CURVE_SIZE * 255), 0, 255), clamp(Math.round((CURVE_SIZE - cy) / CURVE_SIZE * 255), 0, 255)];
}

function drawCurve(canvas, pts) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, CURVE_SIZE, CURVE_SIZE);
  c.strokeStyle = 'rgba(255,255,255,0.07)';
  c.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const p = i * CURVE_SIZE / 4;
    c.beginPath(); c.moveTo(p, 0); c.lineTo(p, CURVE_SIZE); c.stroke();
    c.beginPath(); c.moveTo(0, p); c.lineTo(CURVE_SIZE, p); c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.beginPath(); c.moveTo(0, CURVE_SIZE); c.lineTo(CURVE_SIZE, 0); c.stroke();

  const lut = Effects.buildCurveLUT(pts);
  c.strokeStyle = '#00A6FB';
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x < 256; x++) {
    const [cx, cy] = curveToCanvasXY(x, lut[x]);
    if (x === 0) c.moveTo(cx, cy); else c.lineTo(cx, cy);
  }
  c.stroke();

  c.fillStyle = '#00A6FB';
  for (const pt of pts) {
    const [cx, cy] = curveToCanvasXY(pt.x, pt.y);
    c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
  }
}

function nearestCurvePoint(pts, cx, cy) {
  let nearest = -1, nearestDist = Infinity;
  pts.forEach((pt, i) => {
    const [px, py] = curveToCanvasXY(pt.x, pt.y);
    const d = Math.hypot(px - cx, py - cy);
    if (d < nearestDist) { nearestDist = d; nearest = i; }
  });
  return [nearest, nearestDist];
}

function buildCurveControl(fx, param) {
  const wrap = document.createElement('div');
  wrap.className = 'curve-wrap';

  const canvas = document.createElement('canvas');
  canvas.width = CURVE_SIZE; canvas.height = CURVE_SIZE;
  canvas.className = 'curve-canvas';
  wrap.appendChild(canvas);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-ghost curve-reset';
  resetBtn.textContent = 'Kurve zurücksetzen';
  resetBtn.addEventListener('click', () => {
    fx.params[param.key] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    drawCurve(canvas, fx.params[param.key]);
    markActiveLayerDirty();
    scheduleRender();
  });
  wrap.appendChild(resetBtn);

  canvas.addEventListener('mousedown', e => startCurveDrag(fx, param, canvas, e.clientX, e.clientY));
  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    startCurveDrag(fx, param, canvas, t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('dblclick', e => {
    const [cx, cy] = curveEventXY(canvas, e.clientX, e.clientY);
    const pts = fx.params[param.key];
    if (pts.length <= 2) return;
    const [nearest, dist] = nearestCurvePoint(pts, cx, cy);
    if (dist < 12 && nearest !== 0 && nearest !== pts.length - 1) {
      pts.splice(nearest, 1);
      drawCurve(canvas, pts);
      markActiveLayerDirty();
      scheduleRender();
    }
  });

  drawCurve(canvas, fx.params[param.key]);
  return wrap;
}

function startCurveDrag(fx, param, canvas, clientX, clientY) {
  const pts = fx.params[param.key];
  const [cx, cy] = curveEventXY(canvas, clientX, clientY);
  const [nearest, dist] = nearestCurvePoint(pts, cx, cy);
  if (dist < 12) {
    curveDrag = { pts, index: nearest, canvas };
  } else {
    const [dx, dy] = curveToDataXY(cx, cy);
    pts.push({ x: dx, y: dy });
    pts.sort((a, b) => a.x - b.x);
    const index = pts.findIndex(p => p.x === dx && p.y === dy);
    curveDrag = { pts, index, canvas };
    drawCurve(canvas, pts);
    markActiveLayerDirty();
    scheduleRender();
  }
}

function moveCurveDrag(clientX, clientY) {
  if (!curveDrag) return;
  const { pts, index, canvas } = curveDrag;
  const [cx, cy] = curveEventXY(canvas, clientX, clientY);
  const [dx, dy] = curveToDataXY(cx, cy);
  pts[index].y = dy;
  if (index !== 0 && index !== pts.length - 1) {
    pts[index].x = clamp(dx, pts[index - 1].x + 1, pts[index + 1].x - 1);
  }
  drawCurve(canvas, pts);
  markActiveLayerDirty();
  scheduleRender();
}

document.addEventListener('mousemove', e => moveCurveDrag(e.clientX, e.clientY));
document.addEventListener('mouseup', () => { curveDrag = null; });
document.addEventListener('touchmove', e => {
  if (!curveDrag) return;
  const t = e.touches[0];
  moveCurveDrag(t.clientX, t.clientY);
  e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => { curveDrag = null; });

/* ── Compositing pipeline ── */
async function renderLayerCanvas(layer) {
  if (layer.renderedCanvas && !layer.dirty) return layer.renderedCanvas;
  const c = document.createElement('canvas');
  c.width = layer.workW; c.height = layer.workH;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(layer.img, 0, 0, layer.workW, layer.workH);
  let imgData = cx.getImageData(0, 0, layer.workW, layer.workH);
  for (const fx of layer.stack) {
    if (!fx.enabled) continue;
    const def = EFFECT_DEFS.find(d => d.id === fx.defId);
    const result = await def.apply(imgData, layer.workW, layer.workH, fx.params);
    if (result) imgData = result;
  }
  cx.putImageData(imgData, 0, 0);
  layer.renderedCanvas = c;
  layer.dirty = false;
  return c;
}

async function renderComposite() {
  if (canvasW === 0) return;
  setStatus('busy', 'verarbeite…');
  if (canvas.width !== canvasW) canvas.width = canvasW;
  if (canvas.height !== canvasH) canvas.height = canvasH;
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (canvasBg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvasW, canvasH); }
  else if (canvasBg === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvasW, canvasH); }

  for (const layer of layers) {
    if (!layer.visible) continue;
    const layerCanvas = await renderLayerCanvas(layer);
    ctx.save();
    ctx.globalAlpha = clamp(layer.opacity, 0, 100) / 100;
    ctx.globalCompositeOperation = layer.blendMode;
    ctx.drawImage(layerCanvas, layer.x, layer.y, layer.w, layer.h);
    ctx.restore();
  }
  setStatus('ready', 'bereit');
}

async function scheduleRender() {
  if (isRendering) { pending = true; return; }
  isRendering = true;
  await renderComposite();
  isRendering = false;
  if (pending) { pending = false; scheduleRender(); }
}

/* ── Layer creation ── */
function fitLayerToCanvas(natW, natH) {
  const scale = Math.min(canvasW / natW, canvasH / natH);
  const w = natW * scale, h = natH * scale;
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
}

function addImageLayer(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  loadImage(url).then(img => {
    URL.revokeObjectURL(url);
    let workW = img.naturalWidth, workH = img.naturalHeight;
    if (Math.max(workW, workH) > MAX_DIM) {
      const scale = MAX_DIM / Math.max(workW, workH);
      workW = Math.round(workW * scale); workH = Math.round(workH * scale);
    }

    let x, y, w, h;
    if (canvasW === 0) {
      canvasW = workW; canvasH = workH; canvasBg = 'white';
      x = 0; y = 0; w = workW; h = workH;
    } else {
      ({ x, y, w, h } = fitLayerToCanvas(workW, workH));
    }

    const layer = {
      uid: uidCounter++, name: file.name || `Ebene ${layers.length + 1}`,
      img, workW, workH, x, y, w, h, baseW: w, baseH: h, scalePct: 100,
      blendMode: 'source-over', opacity: 100, visible: true, stack: [], dirty: true,
    };
    layers.push(layer);
    activeLayerId = layer.uid;
    dimText.textContent = `${canvasW}×${canvasH}px`;
    editorArea.classList.add('has-image');
    canvas.classList.add('layer-draggable');
    renderLayerList();
    renderStackUI();
    scheduleRender();
  });
}

function addImageLayers(fileList) {
  for (const f of fileList) addImageLayer(f);
}

fileInput.addEventListener('change', () => { addImageLayers(fileInput.files); fileInput.value = ''; });
uploadZone.addEventListener('click', () => fileInput.click());
document.getElementById('addImageBtn').addEventListener('click', () => fileInput.click());

['dragover', 'dragenter'].forEach(evt =>
  uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(evt =>
  uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); })
);
uploadZone.addEventListener('drop', e => addImageLayers(e.dataTransfer.files));

document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) { addImageLayer(item.getAsFile()); break; }
  }
});

/* ── Neue Leinwand ── */
const canvasModal = document.getElementById('canvasModal');
document.getElementById('newCanvasBtn').addEventListener('click', () => canvasModal.classList.add('open'));
document.getElementById('closeCanvasModalBtn').addEventListener('click', () => canvasModal.classList.remove('open'));
canvasModal.addEventListener('click', e => { if (e.target === canvasModal) canvasModal.classList.remove('open'); });

document.getElementById('createCanvasBtn').addEventListener('click', () => {
  const w = clamp(parseInt(document.getElementById('canvasWidthInput').value, 10) || 1200, 16, 4000);
  const h = clamp(parseInt(document.getElementById('canvasHeightInput').value, 10) || 800, 16, 4000);
  canvasW = w; canvasH = h;
  canvasBg = document.getElementById('canvasBgSelect').value;
  layers = [];
  activeLayerId = null;
  dimText.textContent = `${w}×${h}px`;
  editorArea.classList.add('has-image');
  canvas.classList.remove('layer-draggable');
  canvasModal.classList.remove('open');
  renderLayerList();
  renderStackUI();
  scheduleRender();
});

/* ── Drag-to-move the active layer directly on the canvas ── */
function canvasPointFromEvent(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return [(clientX - rect.left) * (canvas.width / rect.width), (clientY - rect.top) * (canvas.height / rect.height)];
}

function startLayerDrag(clientX, clientY) {
  const layer = getActiveLayer();
  if (!layer) return;
  const [px, py] = canvasPointFromEvent(clientX, clientY);
  if (px >= layer.x && px <= layer.x + layer.w && py >= layer.y && py <= layer.y + layer.h) {
    layerDrag = { layer, offsetX: px - layer.x, offsetY: py - layer.y };
  }
}
function moveLayerDrag(clientX, clientY) {
  if (!layerDrag) return;
  const [px, py] = canvasPointFromEvent(clientX, clientY);
  layerDrag.layer.x = px - layerDrag.offsetX;
  layerDrag.layer.y = py - layerDrag.offsetY;
  scheduleRender();
}

canvas.addEventListener('mousedown', e => startLayerDrag(e.clientX, e.clientY));
document.addEventListener('mousemove', e => moveLayerDrag(e.clientX, e.clientY));
document.addEventListener('mouseup', () => { layerDrag = null; });
canvas.addEventListener('touchstart', e => { startLayerDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
document.addEventListener('touchmove', e => {
  if (layerDrag) { moveLayerDrag(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
}, { passive: false });
document.addEventListener('touchend', () => { layerDrag = null; });

document.getElementById('resetBtn').addEventListener('click', () => {
  const layer = getActiveLayer();
  if (!layer) return;
  layer.stack = [];
  layer.dirty = true;
  renderStackUI();
  scheduleRender();
});

document.getElementById('randomBtn').addEventListener('click', () => {
  const layer = getActiveLayer();
  if (!layer) return;
  const pool = [...EFFECT_DEFS];
  const count = 2 + Math.floor(Math.random() * 3);
  layer.stack = [];
  for (let i = 0; i < count; i++) {
    const def = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const params = defaultParams(def);
    for (const param of def.params) {
      if (param.type === 'range') {
        const span = param.max - param.min;
        params[param.key] = param.min + Math.random() * span;
        if (Number.isInteger(param.step)) params[param.key] = Math.round(params[param.key]);
      } else if (param.type === 'checkbox') {
        params[param.key] = Math.random() > 0.5;
      } else if (param.type === 'seed') {
        params[param.key] = Math.floor(Math.random() * 1e9);
      }
    }
    layer.stack.push({ uid: uidCounter++, defId: def.id, params, enabled: true });
  }
  layer.dirty = true;
  renderStackUI();
  scheduleRender();
});

/* ── Full-resolution export (composites all layers, scales pixel-space params) ── */
function scaleParams(def, params, factor) {
  if (factor === 1) return params;
  const out = { ...params };
  for (const p of def.params) {
    if (p.scalesWithResolution && typeof out[p.key] === 'number') {
      out[p.key] = out[p.key] * factor;
    }
  }
  return out;
}

async function renderLayerAtScale(layer, factor) {
  const w = Math.max(1, Math.round(layer.workW * factor));
  const h = Math.max(1, Math.round(layer.workH * factor));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(layer.img, 0, 0, w, h);
  let imgData = cx.getImageData(0, 0, w, h);
  for (const fx of layer.stack) {
    if (!fx.enabled) continue;
    const def = EFFECT_DEFS.find(d => d.id === fx.defId);
    const params = scaleParams(def, fx.params, factor);
    const result = await def.apply(imgData, w, h, params);
    if (result) imgData = result;
  }
  cx.putImageData(imgData, 0, 0);
  return c;
}

async function renderCompositeAtResolution(exportW, exportH) {
  const c = document.createElement('canvas');
  c.width = exportW; c.height = exportH;
  const cx = c.getContext('2d');
  if (canvasBg === 'white') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, exportW, exportH); }
  else if (canvasBg === 'black') { cx.fillStyle = '#000'; cx.fillRect(0, 0, exportW, exportH); }
  const factor = exportW / canvasW;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const layerCanvas = await renderLayerAtScale(layer, factor);
    cx.save();
    cx.globalAlpha = clamp(layer.opacity, 0, 100) / 100;
    cx.globalCompositeOperation = layer.blendMode;
    cx.drawImage(layerCanvas, layer.x * factor, layer.y * factor, layer.w * factor, layer.h * factor);
    cx.restore();
  }
  return c;
}

document.getElementById('downloadBtn').addEventListener('click', async () => {
  if (canvasW === 0) return;
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exportiert…';
  setStatus('busy', 'exportiert in voller Qualität…');

  try {
    let exportW = canvasW, exportH = canvasH;
    if (Math.max(canvasW, canvasH) < EXPORT_MAX_DIM) {
      const scale = EXPORT_MAX_DIM / Math.max(canvasW, canvasH);
      exportW = Math.round(canvasW * scale); exportH = Math.round(canvasH * scale);
    }
    const exportCanvas = await renderCompositeAtResolution(exportW, exportH);
    exportCanvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glitch-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    setStatus('ready', 'bereit');
  }
});

populateAddEffectSelect();
renderLayerList();
renderStackUI();
setStatus('idle', 'bereit');
