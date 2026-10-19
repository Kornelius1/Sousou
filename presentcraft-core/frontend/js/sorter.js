// Panel tengah: grid slide, load bundel, navigasi slide.
import { $ } from './utils.js';
import { state } from './state.js';
import { emit, on } from './bus.js';
import { invoke, openDialog } from './tauri.js';
import { emitPayload, toPayload, setBlanked, emitBlank, cancelScheduledEmit } from './audience.js';

const SR = window.SlideRenderer;
const grid = $('slide-grid');

export function renderThumb(i) {
  const c = state.cards[i];
  if (c && state.slides[i]) SR.renderThumbnail(c.thumb, toPayload(state.slides[i]));
}

export function refreshThumbBackgrounds() {
  for (const c of state.cards) {
    if (c && c.thumb && c.thumb._bg) {
      SR.renderBackground(c.thumb._bg, state.showBgInThumbs ? state.bg : null, { preview: true });
    }
  }
}

function reorderSlides(fromIdx, toIdx) {
  const [movedSlide] = state.slides.splice(fromIdx, 1);
  state.slides.splice(toIdx, 0, movedSlide);

  if (state.activeIndex === fromIdx) {
    state.activeIndex = toIdx;
  } else if (state.activeIndex > fromIdx && state.activeIndex <= toIdx) {
    state.activeIndex--;
  } else if (state.activeIndex < fromIdx && state.activeIndex >= toIdx) {
    state.activeIndex++;
  }

  applySlides(state.slides, [], state.bundleName);
  if (state.activeIndex >= 0) {
    showSlide(state.activeIndex);
  }
}

// Fitur Auto-Scroll saat menyeberang tepi grid
function handleAutoScroll(e) {
  const rect = grid.getBoundingClientRect();
  const threshold = 50; // Jarak zona scroll dari tepi atas/bawah (px)
  const speed = 12;     // Kecepatan scroll

  if (e.clientY < rect.top + threshold) {
    grid.scrollTop -= speed;
  } else if (e.clientY > rect.bottom - threshold) {
    grid.scrollTop += speed;
  }
}

function makeCard(slide, i) {
  const card = document.createElement('div');
  card.className = 'card';
  card.tabIndex = 0;
  card.draggable = true;
  card.dataset.index = i;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';

  const cap = document.createElement('div');
  cap.className = 'cap';
  if (slide.group_color) cap.style.borderLeftColor = slide.group_color;
  
  const groupTag = slide.group_name ? ` · ${slide.group_name}` : '';
  cap.textContent = `${slide.slide_number}${groupTag}`;

  card.append(thumb, cap);
  card.addEventListener('click', () => showSlide(i));

  // Event Drag and Drop
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(i));
    card.classList.add('dragging');
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    handleAutoScroll(e); // Pemicu auto-scroll
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const srcIdx = Number(e.dataTransfer.getData('text/plain'));
    const dstIdx = i;
    if (!Number.isNaN(srcIdx) && srcIdx !== dstIdx) {
      reorderSlides(srcIdx, dstIdx);
    }
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  state.cards[i] = { card, thumb };
  return card;
}

export function showSlide(i) {
  if (i < 0 || i >= state.slides.length) return;
  const changed = i !== state.activeIndex;
  state.activeIndex = i;
  setBlanked(false);

  state.cards.forEach((c, idx) => {
    if (c && c.card) c.card.classList.toggle('active', idx === i);
  });

  const activeCard = state.cards[i]?.card;
  if (activeCard) {
    activeCard.scrollIntoView({ block: 'nearest' });
  }

  emit('slide:shown', changed);
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
    const name = filePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    applySlides(result?.slides || [], result?.warnings || [], name);
  } catch (error) {
    console.error(error);
    showMessage(`Gagal memuat: ${String(error)}`, '#ff6b6b');
  }
}

export function applySlides(slides, warnings, bundleName) {
  state.slides = slides || [];
  state.bundleName = bundleName || '';
  state.cards = [];
  state.activeIndex = -1;
  state.selectedLayer = -1;
  cancelScheduledEmit();

  $('slide-count').textContent = state.slides.length ? `(${state.slides.length})` : '';
  renderWarnings(warnings || []);

  if (state.slides.length === 0) {
    showMessage('Tidak ada slide ditemukan di file ini.', '#ffb74d');
  } else {
    grid.replaceChildren();
    state.slides.forEach((slide, i) => grid.appendChild(makeCard(slide, i)));
    state.slides.forEach((_, i) => renderThumb(i));
    refreshThumbBackgrounds();
  }

  emit('slides:loaded');
}

export function initSorter() {
  const zoomInput = $('zoom');
  if (zoomInput) {
    zoomInput.addEventListener('input', (e) => {
      grid.style.setProperty('--thumb', `${e.target.value}px`);
    });
  }

  grid.addEventListener('keydown', (e) => {
    if (!state.slides.length) return;

    const current = state.activeIndex < 0 ? 0 : state.activeIndex;
    let target = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      target = Math.min(state.slides.length - 1, current + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      target = Math.max(0, current - 1);
    } else if (e.key === 'Home') {
      target = 0;
    } else if (e.key === 'End') {
      target = state.slides.length - 1;
    }

    if (target !== -1 && target !== state.activeIndex) {
      e.preventDefault();
      showSlide(target);
    }
  });

  on('background-changed', () => refreshThumbBackgrounds());
}