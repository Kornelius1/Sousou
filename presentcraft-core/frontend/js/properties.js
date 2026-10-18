// Panel Properties: edit layer (transform + teks) pada slide aktif.
import { $, baseName, clamp, round } from './utils.js';
import { state, curLayer } from './state.js';
import { on } from './events.js';
import { scheduleEmit } from './audience.js';
import { renderThumb, refreshThumbBackgrounds } from './sorter.js';
import { renderPreviewSoon } from './preview.js';

const SR = window.SlideRenderer;

function layerLabel(l, k) {
  let detail = '';
  if (l.kind === 'text') detail = (l.text || '').replace(/\s+/g, ' ').slice(0, 20);
  else if (l.path) detail = baseName(l.path);
  else if (l.kind === 'color') detail = l.color || '';
  return `${k + 1}. ${l.kind}${detail ? ' — ' + detail : ''}`;
}

function fillProps() {
  const slide = state.slides[state.activeIndex];
  const has = !!slide && (slide.layers || []).length > 0;
  $('props-empty').hidden = has;
  $('props-body').hidden = !has;
  $('props-empty').textContent = slide ? 'Slide ini tidak punya layer.' : 'Pilih sebuah slide.';
  if (!has) return;
  fillFields();
}

function rebuildLayerSelect(want) {
  const slide = state.slides[state.activeIndex];
  const sel = $('p-layer');
  sel.replaceChildren();
  const layers = (slide && slide.layers) || [];
  layers.forEach((l, k) => {
    const o = document.createElement('option');
    o.value = String(k);
    o.textContent = layerLabel(l, k);
    sel.appendChild(o);
  });
  const firstText = layers.findIndex((l) => l.kind === 'text');
  state.selectedLayer = layers.length ? (want != null ? want : firstText >= 0 ? firstText : 0) : -1;
  sel.value = String(state.selectedLayer);
  fillProps();
}

function fillFields() {
  const l = curLayer();
  if (!l) return;
  $('p-opacity').value = l.opacity;
  $('p-opacity-v').textContent = Math.round(l.opacity * 100) + '%';
  $('p-rotation').value = round(l.rotation || 0);
  $('p-x').value = round(l.rect.x);
  $('p-y').value = round(l.rect.y);
  $('p-w').value = round(l.rect.w);
  $('p-h').value = round(l.rect.h);

  const isText = l.kind === 'text';
  $('text-props').hidden = !isText;
  if (!isText) return;
  const st = { ...SR.TEXT_DEFAULTS, ...(l.style || {}) };
  $('p-font').value = st.fontFamily;
  $('p-size').value = st.fontSize;
  $('p-color').value = st.color;
  $('p-bold').classList.toggle('on', !!st.bold);
  $('p-italic').classList.toggle('on', !!st.italic);
  document.querySelectorAll('[data-align]').forEach((b) => b.classList.toggle('on', b.dataset.align === st.align));
  document.querySelectorAll('[data-valign]').forEach((b) => b.classList.toggle('on', b.dataset.valign === st.valign));
}

// Setiap perubahan: thumbnail (langsung), preview (ditunda 150 ms), audience (ditunda 250 ms).
function touched() {
  renderThumb(state.activeIndex);
  refreshThumbBackgrounds();
  renderPreviewSoon();
  scheduleEmit(state.activeIndex);
}

function bind(id, fn) {
  $(id).addEventListener('input', (e) => {
    const l = curLayer();
    if (!l) return;
    const v = e.target.type === 'number' || e.target.type === 'range' ? e.target.valueAsNumber : e.target.value;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    fn(l, v);
    touched();
  });
}
const style = (l) => (l.style = l.style || {});

function toggleStyle(key, btnId) {
  $(btnId).addEventListener('click', () => {
    const l = curLayer();
    if (!l) return;
    const st = style(l);
    st[key] = !st[key];
    fillFields();
    touched();
  });
}

export function initProperties() {
  bind('p-opacity', (l, v) => { l.opacity = clamp(v, 0, 1); $('p-opacity-v').textContent = Math.round(l.opacity * 100) + '%'; });
  bind('p-rotation', (l, v) => { l.rotation = v; });
  bind('p-x', (l, v) => { l.rect.x = v; });
  bind('p-y', (l, v) => { l.rect.y = v; });
  bind('p-w', (l, v) => { l.rect.w = Math.max(0.1, v); });
  bind('p-h', (l, v) => { l.rect.h = Math.max(0.1, v); });
  bind('p-font', (l, v) => { style(l).fontFamily = v; });
  bind('p-size', (l, v) => { style(l).fontSize = Math.max(1, v); });
  bind('p-color', (l, v) => { style(l).color = v; });
  toggleStyle('bold', 'p-bold');
  toggleStyle('italic', 'p-italic');

  $('props').addEventListener('click', (e) => {
    const b = e.target.closest('[data-align],[data-valign]');
    const l = curLayer();
    if (!b || !l) return;
    if (b.dataset.align) style(l).align = b.dataset.align;
    if (b.dataset.valign) style(l).valign = b.dataset.valign;
    fillFields();
    touched();
  });

  $('p-layer').addEventListener('change', (e) => {
    state.selectedLayer = Number(e.target.value);
    fillFields();
  });

  on('slides:loaded', fillProps);
  on('slide:shown', (changed) => { if (changed) rebuildLayerSelect(); });
  on('layer:added', (index) => { rebuildLayerSelect(index); touched(); });
}