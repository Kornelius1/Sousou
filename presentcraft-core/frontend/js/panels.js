const LIMITS = {
  library: { min: 200, max: 480, def: 240 },
  props:   { min: 240, max: 520, def: 280 },
};
const SORTER_MIN = 400;
const COLLAPSED_W = 0;   // sama dengan --lib: 0px / --props: 0px di CSS
const KEY = 'presentcraft.layout';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function initPanels() {
  const ws = document.getElementById('workspace');
  const props = document.getElementById('props');

  const clampW = (v, lim, def) =>
    Math.min(lim.max, Math.max(lim.min, +v || def));

  const saved = load();
  const state = {
    library: clampW(saved.library, LIMITS.library, LIMITS.library.def),
    props: clampW(saved.props, LIMITS.props, LIMITS.props.def),
    libCollapsed: !!saved.libCollapsed,
    propsCollapsed: !!saved.propsCollapsed,
  };

  const tabs = {};   // { left: button, right: button }

  const apply = (persist = true) => {
    ws.style.setProperty('--lib-w', state.library + 'px');
    ws.style.setProperty('--props-w', state.props + 'px');
    ws.classList.toggle('lib-collapsed', state.libCollapsed);
    ws.classList.toggle('props-collapsed', state.propsCollapsed);
    tabs.left.textContent  = state.libCollapsed   ? '›' : '‹';
    tabs.right.textContent = state.propsCollapsed ? '‹' : '›';
    if (persist) save(state);
  };

  // jepit lebar saat window mengecil / panel dibuka
  const clamp = () => {
    const l = state.libCollapsed ? COLLAPSED_W : state.library;
    const p = state.propsCollapsed ? COLLAPSED_W : state.props;
    let over = l + p + SORTER_MIN - ws.clientWidth;
    if (over > 0 && !state.propsCollapsed) {
      const cut = Math.min(over, state.props - LIMITS.props.min);
      state.props -= cut; over -= cut;
    }
    if (over > 0 && !state.libCollapsed) {
      const cut = Math.min(over, state.library - LIMITS.library.min);
      state.library -= cut;
    }
    apply(false);
  };

  const makeSplitter = (side) => {
    const s = document.createElement('div');
    s.className = 'splitter';
    s.dataset.side = side;
    s.setAttribute('role', 'separator');
    s.setAttribute('aria-orientation', 'vertical');
    ws.insertBefore(s, props);

    const key  = side === 'left' ? 'libCollapsed' : 'propsCollapsed';
    const wKey = side === 'left' ? 'library' : 'props';
    const lim  = side === 'left' ? LIMITS.library : LIMITS.props;

    // tombol lipat / buka (gaya .split-tab dari CSS)
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'split-tab';
    tab.title = 'Lipat / buka panel';
    tab.setAttribute('aria-label', 'Lipat / buka panel');
    tab.addEventListener('pointerdown', (e) => e.stopPropagation());
    tab.addEventListener('click', () => {
      state[key] = !state[key];
      apply();
      clamp();
    });
    s.appendChild(tab);
    tabs[side] = tab;

    // drag untuk mengubah lebar
    s.addEventListener('pointerdown', (e) => {
      if (state[key]) return;
      e.preventDefault();
      s.setPointerCapture(e.pointerId);
      s.classList.add('dragging');
      document.body.classList.add('resizing');

      const startX = e.clientX;
      const startW = state[wKey];

      const move = (ev) => {
        const dx = ev.clientX - startX;
        const w = side === 'left' ? startW + dx : startW - dx;

        const otherCollapsed = side === 'left' ? state.propsCollapsed : state.libCollapsed;
        const otherW = side === 'left' ? state.props : state.library;
        const other = otherCollapsed ? COLLAPSED_W : otherW;
        const maxByRoom = ws.clientWidth - other - SORTER_MIN;

        state[wKey] = Math.max(lim.min, Math.min(w, lim.max, maxByRoom));
        apply(false);
      };
      const up = () => {
        s.classList.remove('dragging');
        document.body.classList.remove('resizing');
        s.removeEventListener('pointermove', move);
        s.removeEventListener('pointerup', up);
        s.removeEventListener('pointercancel', up);
        s.removeEventListener('lostpointercapture', up);
        save(state);
      };
      s.addEventListener('pointermove', move);
      s.addEventListener('pointerup', up);
      s.addEventListener('pointercancel', up);
      s.addEventListener('lostpointercapture', up);
    });

    // double-click = reset ke lebar default
    s.addEventListener('dblclick', (e) => {
      if (e.target === tab || state[key]) return;
      state[wKey] = lim.def;
      apply();
      clamp();
    });
  };

  makeSplitter('left');
  makeSplitter('right');

  window.addEventListener('resize', clamp);

  apply();
  clamp();
}