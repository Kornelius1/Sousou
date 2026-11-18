// Layer media satu slide penuh, bentuknya sama dengan addMediaLayer di library.js.
export function buildMediaLayer(it) {
  return {
    kind: it.kind,                     
    z: 0,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    opacity: it.opacity ?? 1,
    path: it.kind === "input" ? null : it.src,
    input: it.kind === "input" ? { ...it.input } : undefined,
    status: 'OK',
    inner: null,
    scale: it.scale === 'fit' ? 'SCALE_BEHAVIOR_FIT' : 'SCALE_BEHAVIOR_FILL',
    muted: it.mute ?? true,
    looped: it.loop ?? true,
    stop_on_clear: null,
    color: null,
    text: null,
  };
}