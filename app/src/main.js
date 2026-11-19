// Vice Cover Studio — the editor wiring.
//
// Owns the page state, the control panel, dragging on the preview to crop
// each panel, and the PNG export. The painting itself lives in cover.js;
// this file only decides *what* to paint and *when*.
import { EXPORT_SIZES, freshState, paintCover, panelRects, visiblePanels } from './cover.js';
import { buildShotState, runCoverShot, runEditorShot } from './shots.js';

const stage = document.getElementById('stage');
const titleInput = document.getElementById('titleInput');
const subtitleInput = document.getElementById('subtitleInput');
const statusBox = document.getElementById('status');
const panelList = document.getElementById('panelList');
const activeLabel = document.getElementById('activePanel');

const state = freshState();
let activePanel = 0;
let dragStart = null;

function say(message) {
  statusBox.textContent = message;
}

function repaint() {
  paintCover(stage, state);
}

function loadPhoto(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

async function putPhotoInPanel(index, source) {
  try {
    const img = typeof source === 'string' ? await loadPhoto(source) : source;
    state.panels[index].image = img;
    repaint();
    say(`Panel ${index + 1} photo updated.`);
  } catch {
    say('That photo could not be read — try another file.');
  }
}

async function fillAllPanels(source) {
  try {
    const img = typeof source === 'string' ? await loadPhoto(source) : source;
    state.panels.forEach((slot) => { slot.image = img; });
    repaint();
    say('Same photo placed in every panel.');
  } catch {
    say('That photo could not be read — try another file.');
  }
}

// One control row per panel: upload, two samples, zoom, and "use for all".
function buildPanelRows() {
  panelList.innerHTML = '';
  state.panels.forEach((slot, i) => {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.dataset.panel = String(i);

    const head = document.createElement('div');
    head.className = 'panel-head';
    const name = document.createElement('span');
    name.textContent = `Panel ${i + 1}`;
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'mini-btn';
    pick.textContent = 'Select';
    pick.addEventListener('click', () => selectPanel(i));
    head.append(name, pick);
    row.append(head);

    const fileBtn = document.createElement('button');
    fileBtn.type = 'button';
    fileBtn.className = 'row-btn';
    fileBtn.textContent = 'Upload a photo…';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      await putPhotoInPanel(i, URL.createObjectURL(file));
      fileInput.value = '';
    });
    fileBtn.addEventListener('click', () => fileInput.click());
    row.append(fileBtn, fileInput);

    const sampleRow = document.createElement('div');
    sampleRow.className = 'sample-row';
    for (const sample of ['pier', 'boulevard']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mini-btn';
      b.textContent = `Sample: ${sample}`;
      b.addEventListener('click', () => putPhotoInPanel(i, `samples/${sample}.jpg`));
      sampleRow.append(b);
    }
    row.append(sampleRow);

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'row-btn';
    allBtn.textContent = 'Use this photo for all panels';
    allBtn.addEventListener('click', () => {
      if (!state.panels[i].image) { say(`Panel ${i + 1} has no photo yet.`); return; }
      fillAllPanels(state.panels[i].image);
    });
    row.append(allBtn);

    const zoomWrap = document.createElement('label');
    zoomWrap.className = 'zoom-wrap';
    const zoomText = document.createElement('span');
    zoomText.textContent = `Zoom ${slot.zoom.toFixed(2)}×`;
    const zoom = document.createElement('input');
    zoom.type = 'range';
    zoom.min = '1';
    zoom.max = '2.5';
    zoom.step = '0.01';
    zoom.value = String(slot.zoom);
    zoom.setAttribute('aria-label', `Zoom for panel ${i + 1}`);
    zoom.addEventListener('input', () => {
      state.panels[i].zoom = Number(zoom.value);
      zoomText.textContent = `Zoom ${Number(zoom.value).toFixed(2)}×`;
      repaint();
    });
    zoomWrap.append(zoomText, zoom);
    row.append(zoomWrap);

    panelList.append(row);
  });
  refreshPanelRows();
}

function refreshPanelRows() {
  const rows = panelList.querySelectorAll('.panel-row');
  rows.forEach((row, i) => {
    const idle = state.layout === 'full' && i > 0;
    row.classList.toggle('is-active', i === activePanel);
    row.classList.toggle('is-idle', idle);
  });
  activeLabel.textContent = `Editing panel ${activePanel + 1} — drag the photo on the preview to move it.`;
}

function selectPanel(i) {
  activePanel = i;
  refreshPanelRows();
}

// Dragging the preview pans the photo inside the panel under the pointer;
// a plain click just selects that panel.
function panelAt(clientX, clientY) {
  const box = stage.getBoundingClientRect();
  const fx = (clientX - box.left) / box.width;
  const fy = (clientY - box.top) / box.height;
  const rects = panelRects(state.layout);
  for (let i = 0; i < visiblePanels(state.layout); i++) {
    const r = rects[i];
    if (fx >= r.x && fx < r.x + r.w && fy >= r.y && fy < r.y + r.h) return { index: i, fx, fy, box };
  }
  return null;
}

stage.addEventListener('pointerdown', (event) => {
  const hit = panelAt(event.clientX, event.clientY);
  if (!hit) return;
  selectPanel(hit.index);
  stage.setPointerCapture(event.pointerId);
  dragStart = {
    index: hit.index,
    x: hit.fx,
    y: hit.fy,
    panX: state.panels[hit.index].panX,
    panY: state.panels[hit.index].panY,
    box: hit.box,
  };
});

stage.addEventListener('pointermove', (event) => {
  if (!dragStart) return;
  const box = stage.getBoundingClientRect();
  const fx = (event.clientX - box.left) / box.width;
  const fy = (event.clientY - box.top) / box.height;
  const slot = state.panels[dragStart.index];
  const rects = panelRects(state.layout);
  const r = rects[dragStart.index];
  slot.panX = clampPan(dragStart.panX + (fx - dragStart.x) / r.w);
  slot.panY = clampPan(dragStart.panY + (fy - dragStart.y) / r.h);
  repaint();
});

function clampPan(v) {
  return Math.max(-0.45, Math.min(0.45, v));
}

stage.addEventListener('pointerup', () => { dragStart = null; });
stage.addEventListener('pointercancel', () => { dragStart = null; });

// Caption inputs.
titleInput.addEventListener('input', () => { state.title = titleInput.value; repaint(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; repaint(); });

// Layout and grade switchers.
document.querySelectorAll('[data-layout]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.layout = btn.dataset.layout;
    document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('is-on', b === btn));
    if (state.layout === 'full' && activePanel > 0) activePanel = 0;
    refreshPanelRows();
    repaint();
  });
});
document.querySelectorAll('[data-grade]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.grade = btn.dataset.grade;
    document.querySelectorAll('[data-grade]').forEach((b) => b.classList.toggle('is-on', b === btn));
    repaint();
  });
});

// Preview size follows the chosen export size, so the preview shows the
// real aspect of the cover being made.
document.querySelectorAll('[data-preview-size]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [w, h] = btn.dataset.previewSize.split('x').map(Number);
    stage.width = w;
    stage.height = h;
    document.querySelectorAll('[data-preview-size]').forEach((b) => b.classList.toggle('is-on', b === btn));
    repaint();
  });
});

// Export: paint the state fresh at the requested size and download the PNG.
export function exportPng(w, h) {
  return new Promise((resolve, reject) => {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    paintCover(off, state);
    off.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('export produced no image'));
    }, 'image/png');
  });
}

document.querySelectorAll('[data-export]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const [w, h] = btn.dataset.export.split('x').map(Number);
    btn.disabled = true;
    try {
      const blob = await exportPng(w, h);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vice-cover-${w}x${h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      say(`Exported vice-cover-${w}x${h}.png (${Math.round(blob.size / 1024)} KB).`);
    } catch {
      say('Export failed — try again.');
    } finally {
      btn.disabled = false;
    }
  });
});

// Global sample shortcuts: one click fills every panel with a sample photo.
document.querySelectorAll('[data-sample-all]').forEach((btn) => {
  btn.addEventListener('click', () => fillAllPanels(`samples/${btn.dataset.sampleAll}.jpg`));
});

// Test hook for the headless checks: export sizes and the live state.
window.__vice = { state, exportPng, paintCover };

// Boot: default sample in every panel, then honour ?shot= scenes.
buildPanelRows();
repaint();
// The display fonts arrive after first paint; redraw once they are in so
// the title renders in Anton, not a fallback.
document.fonts.ready.then(repaint);
const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot === 'cover') {
  document.body.classList.add('shot-cover');
  runCoverShot(stage, query).then((shotState) => {
    Object.assign(state, shotState);
    syncControls();
  });
} else if (shot === 'editor') {
  runEditorShot(stage, query).then((shotState) => {
    Object.assign(state, shotState);
    syncControls();
  });
} else {
  fillAllPanels('samples/pier.jpg');
}

function syncControls() {
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('is-on', b.dataset.layout === state.layout));
  document.querySelectorAll('[data-grade]').forEach((b) => b.classList.toggle('is-on', b.dataset.grade === state.grade));
  buildPanelRows();
  repaint();
}
