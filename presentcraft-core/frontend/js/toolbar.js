import { $ } from './utils.js';
import { state } from './state.js';
import { showSlide, toggleBlank } from './sorter/sorter.js';
import { importFile } from "./sorter/bundle-import.js";
import { closeMenus } from './menu.js';
import { openBible } from './bible.js';

export function initToolbar() {
  $('tb-bible').addEventListener('click', openBible);
  $('tb-blank').addEventListener('click', toggleBlank);
}

export function initShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (document.querySelector(".ed-root")) return;
    if (e.key === 'Escape') closeMenus();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      importFile();
      return;
    }
    if (e.defaultPrevented) return;  
    if (e.target.closest('input, select, button, textarea')) return;
    if (state.slides.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      showSlide(state.activeIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      showSlide(state.activeIndex - 1);
    } else if (e.key === 'b' || e.key === 'B') {
      toggleBlank();
    }
  });
}