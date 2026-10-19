// State bersama. Semua modul membaca/menulis lewat objek ini.
export const state = {
  slides: [],
  cards: [],            // [{ card, thumb }]
  activeIndex: -1,
  selectedLayer: -1,
  blanked: false,
  bg: null,
  showBgInThumbs: false,
  bundleMedia: [],      // [{ path, kind }]
  groups: [],
  selectedGroup: null,
  selectedItem: null,
  bundleName: '',
  mediaGroups: [],
  selectedMediaGroup: null,
  selectedMediaItem: null,
};

export const curLayer = () => {
  const s = state.slides[state.activeIndex];
  return s && s.layers ? s.layers[state.selectedLayer] : undefined;
};