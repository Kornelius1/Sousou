// Panel tengah: grid slide, load bundel, navigasi slide.
import { $ } from './utils.js';
import { state } from './state.js';
import { emit, on } from './bus.js';
import { invoke, openDialog } from './tauri.js';
import { emitPayload, toPayload, setBlanked, emitBlank, cancelScheduledEmit } from './audience.js';

const SR = window.SlideRenderer;
const grid = $('slide-grid');

export function createBlankSlide(slideNumber = 1) {
  return {
    slide_number: slideNumber,
    group_name: null,
    group_color: null,
    layers: [],          
  };
}

export function initBlankDeck() {
  applySlides([createBlankSlide()], [], '');
}

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
  card.addEventListener('click', () => {
    showSlide(i);
    card.focus(); 
  });

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
  if (state.slides.length === 0) {
    state.slides = [createBlankSlide()];   // fallback: selalu ada minimal satu slide
  }
  state.bundleName = bundleName || '';
  state.cards = [];
  state.activeIndex = -1;
  state.selectedLayer = -1;
  cancelScheduledEmit();

  $('slide-count').textContent = `(${state.slides.length})`;
  renderWarnings(warnings || []);

  grid.replaceChildren();
  state.slides.forEach((slide, i) => grid.appendChild(makeCard(slide, i)));
  state.slides.forEach((_, i) => renderThumb(i));
  refreshThumbBackgrounds();

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

    const currentIdx = state.activeIndex < 0 ? 0 : state.activeIndex;
    const cards = Array.from(grid.querySelectorAll('.card'));
    const currentCard = cards[currentIdx];

    if (!currentCard) return;

    const curRect = currentCard.getBoundingClientRect();
    let targetIdx = currentIdx;

    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();

      let bestMatch = -1;
      let minDistance = Infinity;

      cards.forEach((card, idx) => {
        if (idx === currentIdx) return;
        const rect = card.getBoundingClientRect();

        let isValid = false;
        let distance = Infinity;

        // Validasi arah dan hitung jarak geometris terdekat
        if (e.key === 'ArrowRight') {
          // Harus berada di sebelah kanan dan sejajar secara vertikal
          isValid = rect.left >= curRect.left + curRect.width / 2 && Math.abs(rect.top - curRect.top) < curRect.height;
          distance = Math.hypot(rect.left - curRect.left, rect.top - curRect.top);
        } else if (e.key === 'ArrowLeft') {
          // Harus berada di sebelah kiri dan sejajar secara vertikal
          isValid = rect.left <= curRect.left - rect.width / 2 && Math.abs(rect.top - curRect.top) < curRect.height;
          distance = Math.hypot(curRect.left - rect.left, curRect.top - rect.top);
        } else if (e.key === 'ArrowDown') {
          // Harus berada di bawah secara vertikal
          isValid = rect.top >= curRect.top + curRect.height / 2;
          // Berikan bobot lebih besar pada selisih vertikal agar pindah baris lebih natural
          distance = Math.abs(rect.top - curRect.top) * 2 + Math.abs(rect.left - curRect.left);
        } else if (e.key === 'ArrowUp') {
          // Harus berada di atas secara vertikal
          isValid = rect.top <= curRect.top - rect.height / 2;
          distance = Math.abs(curRect.top - rect.top) * 2 + Math.abs(rect.left - curRect.left);
        }

        if (isValid && distance < minDistance) {
          minDistance = distance;
          bestMatch = idx;
        }
      });

      // Jika ada kartu terdekat yang valid di arah tersebut, pindahkan fokus/pilihan
      if (bestMatch !== -1) {
        targetIdx = bestMatch;
      } else {
        // Fallback perilaku linier jika berada di ujung grid
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          targetIdx = Math.min(state.slides.length - 1, currentIdx + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          targetIdx = Math.max(0, currentIdx - 1);
        }
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIdx = state.slides.length - 1;
    }

    if (targetIdx !== state.activeIndex) {
      showSlide(targetIdx);
      state.cards[targetIdx]?.card.focus({ preventScroll: true });
    }
  });

  on('background-changed', () => refreshThumbBackgrounds());
}

export function showGroupSlides(g) {
  const items = g ? g.items.filter((it) => it.kind === 'slide') : [];
  const slides = items.map((it, i) => ({
    ...createBlankSlide(i + 1),
    group_name: g.name,
    itemId: it.id,
    groupId: g.id,
    label: it.label,
  }));
  applySlides(slides.length ? slides : [createBlankSlide()], [], g ? g.name : '');
}