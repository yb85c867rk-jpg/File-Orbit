/**
 * One owned node-drag gesture boundary on the live canvas.
 * Background pointer events are left to the accepted pan/zoom controller.
 */
export function createNodeDragGesture({
  canvas,
  hitAt,
  isEnabled = () => true,
  threshold = 4,
  onStart = () => {},
  onMove = () => {},
  onDrop = () => {},
  onCancel = () => {}
}) {
  if (!canvas || typeof canvas.addEventListener !== 'function') {
    throw new Error('canvas with addEventListener is required');
  }
  let active = null;
  let suppressClick = false;
  let suppressTimer = null;
  let destroyed = false;
  const handlers = {
    pointerdown: (event) => {
      if (destroyed || !isEnabled() || event.button !== 0 || event.pointerType !== 'mouse' || event.isPrimary === false) return;
      const hit = hitAt(event);
      if (!hit || !hit.id) return;
      active = { id: hit.id, pointerId: event.pointerId, sx: event.clientX, sy: event.clientY, x: event.clientX, y: event.clientY, dragging: false, hit };
      if (typeof canvas.setPointerCapture === 'function') {
        try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
      }
      onStart({ id: hit.id, event, hit });
      event.stopPropagation();
    },
    pointermove: (event) => {
      if (!active || event.pointerId !== active.pointerId) return;
      active.x = event.clientX;
      active.y = event.clientY;
      if (!active.dragging) {
        if (Math.hypot(active.x - active.sx, active.y - active.sy) < threshold) return;
        active.dragging = true;
      }
      onMove({ id: active.id, event, hitAt: hitAt(event) });
      event.preventDefault();
      event.stopPropagation();
    },
    pointerup: (event) => {
      if (!active || event.pointerId !== active.pointerId) return;
      const wasDragging = active.dragging;
      const id = active.id;
      release();
      if (wasDragging) {
        armClickSuppression();
        onDrop({ id, event, hitAt: hitAt(event) });
      } else {
        onCancel({ id, reason: 'below-threshold' });
      }
      event.stopPropagation();
    },
    pointercancel: (event) => {
      if (!active) return;
      const id = active.id;
      const wasDragging = active.dragging;
      release();
      if (wasDragging) armClickSuppression();
      onCancel({ id, reason: 'pointercancel', wasDragging });
      event.stopPropagation();
    },
    lostpointercapture: (event) => {
      if (!active) return;
      const id = active.id;
      const wasDragging = active.dragging;
      release();
      if (wasDragging) armClickSuppression();
      onCancel({ id, reason: 'lost-capture', wasDragging });
    },
    click: (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  };
  for (const [name, handler] of Object.entries(handlers)) {
    canvas.addEventListener(name, handler, name === 'click');
  }
  function armClickSuppression() {
    suppressClick = true;
    if (suppressTimer !== null) clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => { suppressClick = false; suppressTimer = null; }, 0);
  }
  function release() {
    if (!active) return;
    if (typeof canvas.releasePointerCapture === 'function') {
      try { canvas.releasePointerCapture(active.pointerId); } catch { /* optional */ }
    }
    active = null;
  }
  return {
    get dragging() { return active !== null && active.dragging; },
    get clickSuppressed() { return suppressClick; },
    get sourceId() { return active?.id || null; },
    cancel(reason = 'cancelled') {
      if (!active) return false;
      const id = active.id;
      release();
      onCancel({ id, reason });
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      release();
      if (suppressTimer !== null) { clearTimeout(suppressTimer); suppressTimer = null; }
      for (const [name, handler] of Object.entries(handlers)) {
        canvas.removeEventListener(name, handler, name === 'click');
      }
    }
  };
}





