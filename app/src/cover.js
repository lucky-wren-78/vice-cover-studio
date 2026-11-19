// Vice Cover Studio — the cover painter.
//
// One module owns every pixel of the exported cover: it takes a plain state
// object (layout, grade, caption, one photo slot per panel) and paints it
// onto any canvas at any size, so the on-screen preview and the exported PNG
// are the same drawing, only scaled. No network, no libraries: plain canvas.

export const LAYOUTS = {
  hero: 'Hero + strip',
  grid: 'Grid 2x2',
  full: 'Full-bleed single',
};

export const GRADES = {
  sunset: 'Sunset',
  neon: 'Neon Night',
  golden: 'Golden Hour',
};

export const EXPORT_SIZES = [
  { label: '1080 x 1080', w: 1080, h: 1080 },
  { label: '1080 x 1350', w: 1080, h: 1350 },
  { label: '1920 x 1080', w: 1920, h: 1080 },
];

// Panel rectangles as fractions of the cover, in draw order. `full` uses one
// panel; the other three slots stay idle in that layout.
export function panelRects(layout) {
  if (layout === 'grid') {
    return [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ];
  }
  if (layout === 'full') {
    return [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 },
    ];
  }
  // hero: one tall panel on top, three small ones along the foot.
  return [
    { x: 0, y: 0, w: 1, h: 0.64 },
    { x: 0, y: 0.64, w: 1 / 3, h: 0.36 },
    { x: 1 / 3, y: 0.64, w: 1 / 3, h: 0.36 },
    { x: 2 / 3, y: 0.64, w: 1 / 3, h: 0.36 },
  ];
}

// How many panels a layout actually shows.
export function visiblePanels(layout) {
  return layout === 'full' ? 1 : 4;
}

// Colour recipes per grade: a warm wash from the top, a deeper wash at the
// foot, the caption accent, and the scrim that keeps the lettering readable.
const GRADE_RECIPES = {
  sunset: {
    washTop: 'rgba(255, 122, 64, 0.16)',
    washBottom: 'rgba(214, 38, 130, 0.34)',
    duotone: 'rgba(255, 90, 120, 0.10)',
    accent: '#ffb347',
    scrim: 'rgba(24, 6, 34, 0.82)',
  },
  neon: {
    washTop: 'rgba(255, 45, 149, 0.20)',
    washBottom: 'rgba(0, 205, 255, 0.24)',
    duotone: 'rgba(0, 229, 255, 0.10)',
    accent: '#2de8ff',
    scrim: 'rgba(8, 4, 30, 0.82)',
  },
  golden: {
    washTop: 'rgba(255, 196, 66, 0.20)',
    washBottom: 'rgba(255, 110, 40, 0.30)',
    duotone: 'rgba(255, 180, 60, 0.10)',
    accent: '#ffd166',
    scrim: 'rgba(30, 14, 4, 0.82)',
  },
};

export function freshState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    title: 'Vice Nights',
    subtitle: 'Neon Shore',
    panels: [0, 1, 2, 3].map(() => ({
      image: null,
      zoom: 1,
      panX: 0,
      panY: 0,
    })),
  };
}

let grainTile = null;

// A small tile of random grey noise, reused for the film grain on every cover.
function grainPattern(ctx) {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 180;
  tile.height = 180;
  const tctx = tile.getContext('2d');
  const data = tctx.createImageData(180, 180);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 118 + Math.floor(Math.random() * 40) - 20;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  tctx.putImageData(data, 0, 0);
  grainTile = ctx.createPattern(tile, 'repeat');
  return grainTile;
}

// Draws one photo into one panel rectangle, cover-fit, with the panel's zoom
// and drag offset applied. An empty slot gets a dark placeholder gradient.
function paintPanel(ctx, rect, slot, w, h) {
  const px = rect.x * w;
  const py = rect.y * h;
  const pw = rect.w * w;
  const ph = rect.h * h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  if (slot.image) {
    const img = slot.image;
    const base = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
    const dw = img.naturalWidth * base * slot.zoom;
    const dh = img.naturalHeight * base * slot.zoom;
    // Pan, clamped so the photo always covers the panel: dragging can never
    // pull an empty edge into view.
    const wantX = px + (pw - dw) / 2 + slot.panX * pw;
    const wantY = py + (ph - dh) / 2 + slot.panY * ph;
    const ox = Math.min(px, Math.max(px + pw - dw, wantX));
    const oy = Math.min(py, Math.max(py + ph - dh, wantY));
    ctx.drawImage(img, ox, oy, dw, dh);
  } else {
    const fill = ctx.createLinearGradient(px, py, px, py + ph);
    fill.addColorStop(0, '#3a2340');
    fill.addColorStop(1, '#171021');
    ctx.fillStyle = fill;
    ctx.fillRect(px, py, pw, ph);
  }
  ctx.restore();
}

// The caption: a big display title with a dark outline, and a script-style
// subtitle glowing in the grade's accent colour.
function paintCaption(ctx, state, w, h, recipe) {
  const title = state.title.trim().toUpperCase();
  const sub = state.subtitle.trim();
  if (!title && !sub) return;

  const scrim = ctx.createLinearGradient(0, h * 0.52, 0, h);
  scrim.addColorStop(0, 'rgba(10, 4, 20, 0)');
  scrim.addColorStop(1, recipe.scrim);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, h * 0.52, w, h * 0.48);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let baseline = h - h * 0.055;

  if (sub) {
    ctx.font = `${Math.round(h * 0.048)}px Pacifico, cursive`;
    ctx.fillStyle = recipe.accent;
    ctx.shadowColor = recipe.accent;
    ctx.shadowBlur = h * 0.012;
    ctx.fillText(sub, w / 2, baseline);
    ctx.shadowBlur = 0;
    baseline -= h * 0.075;
  }
  if (title) {
    let size = Math.round(h * 0.115);
    ctx.font = `${size}px Anton, sans-serif`;
    while (ctx.measureText(title).width > w * 0.92 && size > 18) {
      size -= 2;
      ctx.font = `${size}px Anton, sans-serif`;
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.1);
    ctx.strokeStyle = 'rgba(18, 6, 28, 0.9)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.16;
    ctx.shadowOffsetY = size * 0.05;
    ctx.strokeText(title, w / 2, baseline);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, w / 2, baseline);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

// A small studio wordmark tucked in the top corner, in our own words.
function paintWordmark(ctx, w, h, recipe) {
  const size = Math.max(13, Math.round(h * 0.016));
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = size * 0.4;
  const x = w * 0.025;
  const y = h * 0.035;
  ctx.fillText('VICE COVER STUDIO', x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = recipe.accent;
  ctx.fillRect(x, y + size * 0.35, size * 3.2, Math.max(2, size * 0.16));
}

// Paints the whole cover described by `state` onto `canvas` at its own size.
export function paintCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const recipe = GRADE_RECIPES[state.grade] ?? GRADE_RECIPES.sunset;
  const rects = panelRects(state.layout);
  const shown = visiblePanels(state.layout);
  const gutter = Math.max(5, Math.round(w * 0.006));

  // Pale poster board shows through as the thin frame between panels.
  ctx.fillStyle = '#f2ede4';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < shown; i++) {
    const r = rects[i];
    const inset = {
      x: r.x + gutter / w,
      y: r.y + gutter / h,
      w: r.w - (2 * gutter) / w,
      h: r.h - (2 * gutter) / h,
    };
    // Keep the outer edge flush: panels touching the cover edge lose the
    // gutter on that side, so the frame reads as one border.
    if (r.x === 0) { inset.x = 0; inset.w += gutter / w; }
    if (r.y === 0) { inset.y = 0; inset.h += gutter / h; }
    if (r.x + r.w >= 1) inset.w += gutter / w;
    if (r.y + r.h >= 1) inset.h += gutter / h;
    paintPanel(ctx, inset, state.panels[i], w, h);
  }

  // Grade: a warm wash over everything, then a duotone-style tint.
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, recipe.washTop);
  wash.addColorStop(1, recipe.washBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = recipe.duotone;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Film grain, then a vignette to pull the eye to the middle.
  const grain = grainPattern(ctx);
  if (grain) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const vig = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.42,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  paintCaption(ctx, state, w, h, recipe);
  paintWordmark(ctx, w, h, recipe);
}
