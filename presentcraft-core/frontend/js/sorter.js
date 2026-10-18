// Panel tengah: grid slide, load bundel, navigasi slide.
import { $ } from './utils.js';
import { state } from './state.js';
import { emit } from './events.js';
import { invoke, openDialog } from './tauri.js';
import { emitPayload, toPayload, setBlanked, emitBlank, cancelScheduledEmit } from './audience.js';

const SR = window.SlideRenderer;
const grid = $('slide-grid');

export function renderThumb(i) {
  const c = state.cards[i];
  if (c) SR.renderThumbnail(c.thumb, toPayload(state.slides[i]));
}

export function refreshThumbBackgrounds() {
  for (const c of state.cards) {
    if (c.thumb._bg) SR.renderBackground(c.thumb._bg, state.showBgInThumbs ? state.bg : null, { preview: true });
  }
}

function makeCard(slide, i) {
  const card = document.createElement('div');
  card.className = 'card';
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const cap = document.createElement('div');
  cap.className = 'cap';
  if (slide.group_color) cap.style.borderLeftColor = slide.group_color;
  cap.textContent = `${slide.slide_number}${slide.group_name ? ' · ' + slide.group_name : ''}`;
  card.append(thumb, cap);
  card.addEventListener('click', () => showSlide(i));
  state.cards[i] = { card, thumb };
  return card;
}

export function showSlide(i) {
  if (i < 0 || i >= state.slides.length) return;
  const changed = i !== state.activeIndex;
  state.activeIndex = i;
  setBlanked(false);
  state.cards.forEach((c, idx) => c.card.classList.toggle('active', idx === i));
  state.cards[i].card.scrollIntoView({ block: 'nearest' });
  emit('slide:shown', changed); // properties: rebuild layer; preview: render ulang
  emitPayload(toPayload(state.slides[i]));
}

export function toggleBlank() {
  if (!state.blanked) return emitBlank();
  if (state.activeIndex >= 0) showSlide(state.activeIndex);
  else setBlanked(false);
}

function renderWarnings(warnings) {
  const slot = $('warn-slot');
  slot.replaceChildren();
  if (!warnings || warnings.length === 0) return;
  const d = document.createElement('details');
  d.className = 'warnings';
  const sum = document.createElement('summary');
  sum.textContent = `${warnings.length} peringatan saat memuat`;
  const ul = document.createElement('ul');
  warnings.forEach((w) => {
    const li = document.createElement('li');
    li.textContent = w;
    ul.appendChild(li);
  });
  d.append(sum, ul);
  slot.appendChild(d);
}

function showMessage(text, color) {
  grid.replaceChildren();
  const p = document.createElement('p');
  p.className = 'empty';
  p.style.color = color;
  p.textContent = text;
  grid.appendChild(p);
}

export async function importFile() {
  const filePath = await openDialog({
    multiple: false,
    filters: [{ name: 'ProPresenter', extensions: ['probundle', 'zip', 'pro'] }],
  });
  if (!filePath) return;

  showMessage('Mengekstrak dan memuat bundel...', '#03dac6');
  $('warn-slot').replaceChildren();

  try {
    const result = await invoke('load_presentation_bundle', { filePath });
    state.slides = (result && result.slides) || [];
    const warnings = (result && result.warnings) || [];

    state.cards = [];
    state.activeIndex = -1;
    state.selectedLayer = -1;
    cancelScheduledEmit();
    $('slide-count').textContent = state.slides.length ? `(${state.slides.length})` : '';
    renderWarnings(warnings);
    emit('slides:loaded'); // library, properties, preview menyegarkan diri

    if (state.slides.length === 0) {
      showMessage('Tidak ada slide ditemukan di file ini.', '#ffb74d');
      return;
    }

    grid.replaceChildren();
    state.slides.forEach((slide, i) => grid.appendChild(makeCard(slide, i)));
    state.slides.forEach((_, i) => renderThumb(i)); // setelah masuk DOM agar lebar terukur
    refreshThumbBackgrounds();
  } catch (error) {
    showMessage('Gagal memuat: ' + String(error), '#ff6b6b');
  }
}

export function initSorter() {
  $('zoom').addEventListener('input', (e) => grid.style.setProperty('--thumb', e.target.value + 'px'));
}