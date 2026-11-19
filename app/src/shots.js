// Fixed scenes for screenshots: ?shot=cover paints the cover alone at the
// requested export size, ?shot=editor shows the editor with a sample photo
// already loaded. Query knobs: layout, grade, photo (sample name), caption,
// subtitle, size (WxH, cover only). window.__shotReady flips once painted.
import { EXPORT_SIZES, freshState, paintCover } from './cover.js';

function sampleUrl(name) {
  const safe = /^[a-z]+$/.test(name) ? name : 'pier';
  return `samples/${safe}.jpg`;
}

function loadPhoto(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function readSize(query) {
  const raw = query.get('size') ?? '';
  const found = EXPORT_SIZES.find((s) => `${s.w}x${s.h}` === raw);
  return found ?? EXPORT_SIZES[2];
}

// Builds the state for a shot, then hands it back with the photo applied to
// every panel (each panel cropped a little differently, so one photo still
// reads as a multi-panel poster).
export async function buildShotState(query) {
  const state = freshState();
  state.layout = ['hero', 'grid', 'full'].includes(query.get('layout'))
    ? query.get('layout')
    : 'hero';
  state.grade = ['sunset', 'neon', 'golden'].includes(query.get('grade'))
    ? query.get('grade')
    : 'sunset';
  state.title = query.get('caption') ?? 'Vice Nights';
  state.subtitle = query.get('subtitle') ?? 'Neon Shore';
  const photo = await loadPhoto(sampleUrl(query.get('photo') ?? 'pier'));
  const framings = [
    { zoom: 1, panX: 0, panY: 0.45 },
    { zoom: 1.7, panX: -0.18, panY: 0.08 },
    { zoom: 1.7, panX: 0.16, panY: -0.06 },
    { zoom: 1.9, panX: 0, panY: 0.12 },
  ];
  state.panels = state.panels.map((slot, i) => ({
    image: photo,
    zoom: framings[i].zoom,
    panX: framings[i].panX,
    panY: framings[i].panY,
  }));
  return state;
}

// Cover-only scene: size the canvas to the export size and paint it, so the
// screenshot is the app's own drawing at that size.
export async function runCoverShot(canvas, query) {
  const size = readSize(query);
  canvas.width = size.w;
  canvas.height = size.h;
  const state = await buildShotState(query);
  await document.fonts.load('16px Anton');
  await document.fonts.load('16px Pacifico');
  paintCover(canvas, state);
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  window.__shotReady = true;
  return state;
}

// Editor scene: paint the state into the editor's own preview canvas.
export async function runEditorShot(canvas, query) {
  const state = await buildShotState(query);
  await document.fonts.load('16px Anton');
  await document.fonts.load('16px Pacifico');
  paintCover(canvas, state);
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  window.__shotReady = true;
  return state;
}
