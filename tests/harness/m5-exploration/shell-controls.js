export const THEME_DARK = 'dark';
export const THEME_LIGHT = 'light';

export function createActionButtonsController({ buttons, onAction, onUnavailable }) {
  if (!Array.isArray(buttons)) throw new Error('action controls require a button list');
  const onClick = (event) => {
    const button = event.currentTarget;
    const action = button?.dataset.action;
    if (!action) return;
    const label = button.dataset.label || button.getAttribute('aria-label') || action;
    if (button.dataset.available === 'false') { onUnavailable?.({ action, label, button }); return; }
    onAction?.({ action, label, button });
  };
  for (const button of buttons) button.addEventListener('click', onClick);
  return { destroy() { for (const button of buttons) button.removeEventListener('click', onClick); } };
}

export function createPopupMenu({ document, button, menu, placement = 'below', onOpen = () => {}, onClose = () => {} }) {
  if (!document || !button || !menu) throw new Error('popup menu requires document, button, and menu');
  let open = false;
  let listening = false;
  const view = (document.defaultView && typeof document.defaultView.addEventListener === 'function') ? document.defaultView : (globalThis.window || null);
  const contains = (event) => Boolean(menu.contains?.(event.target) || button.contains?.(event.target));
  const viewportSize = () => ({
    width: Number(document.documentElement?.clientWidth) || Number(view?.innerWidth) || 1024,
    height: Number(document.documentElement?.clientHeight) || Number(view?.innerHeight) || 768
  });
  const triggerVisible = () => {
    if (!button || button.hidden || button.isConnected === false) return false;
    try {
      const style = view?.getComputedStyle?.(button);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    } catch {}
    return true;
  };
  const onViewportChange = () => {
    if (!open) return;
    if (!triggerVisible()) { close({ restoreFocus: false }); return; }
    clamp();
  };
  const removeViewportListeners = () => {
    if (!listening) return;
    listening = false;
    view?.removeEventListener?.('resize', onViewportChange);
    view?.removeEventListener?.('orientationchange', onViewportChange);
    view?.visualViewport?.removeEventListener?.('resize', onViewportChange);
    document.removeEventListener?.('fullscreenchange', onViewportChange);
  };
  const addViewportListeners = () => {
    if (listening) return;
    listening = true;
    view?.addEventListener?.('resize', onViewportChange);
    view?.addEventListener?.('orientationchange', onViewportChange);
    view?.visualViewport?.addEventListener?.('resize', onViewportChange);
    document.addEventListener?.('fullscreenchange', onViewportChange);
  };
  const clamp = () => {
    menu.style.position = 'fixed';
    const { width, height } = viewportSize();
    const availableWidth = Math.max(0, width - 16);
    const availableHeight = Math.max(0, height - 16);
    menu.style.maxWidth = `${availableWidth}px`;
    menu.style.maxHeight = `${availableHeight}px`;
    menu.style.overflowY = 'auto';
    const scrollTop = Number.isFinite(menu.scrollTop) ? menu.scrollTop : 0;
    const rect = menu.getBoundingClientRect?.() || { width: 0, height: 0 };
    const buttonRect = button.getBoundingClientRect?.() || { left: 8, bottom: 40, right: 40, top: 8 };
    const side = typeof placement === 'function' ? placement() : placement;
    const railRect = side === 'right' ? button.closest?.('#nav-rail')?.getBoundingClientRect?.() : null;
    const preferredLeft = side === 'right' ? Math.max(buttonRect.right, railRect?.right || 0) + 6 : buttonRect.left;
    const preferredTop = side === 'right' ? buttonRect.top : buttonRect.bottom + 4;
    const left = Math.min(Math.max(8, preferredLeft), Math.max(8, width - rect.width - 8));
    const top = Math.min(Math.max(8, preferredTop), Math.max(8, height - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    if (Number.isFinite(menu.scrollTop)) menu.scrollTop = scrollTop;
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false; menu.hidden = true; button.setAttribute('aria-expanded', 'false');
    removeViewportListeners();
    if (restoreFocus && triggerVisible()) button.focus?.();
    onClose();
  };
  const show = () => {
    if (open || !triggerVisible()) return;
    open = true; menu.hidden = false; button.setAttribute('aria-expanded', 'true');
    clamp();
    addViewportListeners();
    const first = menu.querySelector?.('button:not([disabled])');
    first?.focus?.();
    onOpen();
  };
  const toggle = () => { if (open) close(); else show(); };
  const onDocumentPointer = (event) => { if (open && !contains(event)) close(); };
  const onKey = (event) => { if (event.key === 'Escape' && open) { event.preventDefault?.(); close(); } };
  button.addEventListener('click', toggle);
  document.addEventListener('pointerdown', onDocumentPointer);
  document.addEventListener('keydown', onKey);
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  return { show, close, toggle, get open() { return open; },
    destroy() {
      if (open) close({ restoreFocus: false });
      removeViewportListeners();
      button.removeEventListener('click', toggle);
      document.removeEventListener('pointerdown', onDocumentPointer);
      document.removeEventListener('keydown', onKey);
    } };
}
function updateControlPresentation(button, label) {
  const presentation = button.dataset.presentation || (button.querySelector?.('svg') ? 'icon' : 'text');
  button.dataset.label = label;
  button.setAttribute('title', label);
  if (presentation === 'icon') return;
  const span = button.querySelector?.('[data-control-label]');
  if (span) span.textContent = label; else button.textContent = label;
}
export function createThemeController({ document, button, initial = THEME_DARK, onChange = () => {} }) {
  if (!document || !button) throw new Error('theme controller requires document and button');
  let theme = initial === THEME_LIGHT ? THEME_LIGHT : THEME_DARK;
  const render = () => {
    document.documentElement?.setAttribute('data-theme', theme);
    const next = theme === THEME_DARK ? 'Light' : 'Dark';
    updateControlPresentation(button, `Theme: ${next}`);
    button.setAttribute('aria-label', `Switch to ${next.toLowerCase()} theme`);
    button.setAttribute('aria-pressed', String(theme === THEME_LIGHT));
    onChange(theme);
  };
  const toggle = () => { theme = theme === THEME_DARK ? THEME_LIGHT : THEME_DARK; render(); };
  button.addEventListener('click', toggle);
  render();
  return {
    get theme() { return theme; },
    toggle,
    setTheme(value) { theme = value === THEME_LIGHT ? THEME_LIGHT : THEME_DARK; render(); },
    destroy() { button.removeEventListener('click', toggle); }
  };
}

export function createFullscreenController({ document, element, button, onStatus = () => {}, onState = () => {} }) {
  if (!document || !element || !button) throw new Error('fullscreen controller requires document, element, and button');
  const supported = Boolean(document.fullscreenEnabled && typeof element.requestFullscreen === 'function');
  let active = Boolean(document.fullscreenElement);
  const render = () => {
    document.documentElement?.toggleAttribute('data-fullscreen', active);
    updateControlPresentation(button, active ? 'Exit Fullscreen' : 'Fullscreen');
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    button.dataset.tooltip = active ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-pressed', String(active));
    button.dataset.available = supported ? 'true' : 'false';
    if (!supported) {
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('title', 'Fullscreen is not supported by this browser.');
    } else {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('aria-disabled');
      button.setAttribute('title', active ? 'Exit fullscreen' : 'Enter fullscreen');
    }
    onState({ active, supported });
  };
  const change = () => { active = Boolean(document.fullscreenElement); render(); onStatus(active ? 'Fullscreen entered.' : 'Fullscreen exited.'); };
  const onClick = async () => {
    if (!supported) { onStatus('Fullscreen is not supported by this browser.'); return; }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element.requestFullscreen();
      active = Boolean(document.fullscreenElement);
      render();
    } catch (error) {
      render();
      onStatus(`Fullscreen request failed: ${String(error?.message || error)}`);
    }
  };
  button.addEventListener('click', onClick);
  document.addEventListener('fullscreenchange', change);
  render();
  return {
    get supported() { return supported; }, get active() { return active; }, toggle: onClick,
    destroy() { button.removeEventListener('click', onClick); document.removeEventListener('fullscreenchange', change); }
  };
}

export function themedCanvasScene(scene, theme) {
  if (theme !== THEME_LIGHT || !scene?.presentation) return scene;
  const nodes = new Map();
  for (const [id, node] of scene.nodes) {
    if (node.kind !== 'folder') { nodes.set(id, node); continue; }
    const root = scene.rootId ? id === scene.rootId : node.depth === 0;
    nodes.set(id, Object.freeze({
      ...node,
      fill: root ? '#0f172a' : '#64748b',
      stroke: root ? '#0f172a' : '#94a3b8'
    }));
  }
  return Object.freeze({
    ...scene,
    nodes,
    presentation: Object.freeze({
      ...scene.presentation,
      background: '#f8fafc',
      edgeStroke: '#94a3b8',
      rootFill: '#0f172a',
      rootStroke: '#0f172a',
      folderFill: '#64748b',
      folderStroke: '#94a3b8'
    })
  });
}
export function createHistoryToolbarController({ undoButton, redoButton, getHistory, getBlockedReason = () => null, run }) {
  if (!undoButton || !redoButton || typeof getHistory !== 'function' || typeof run !== 'function') {
    throw new Error('history toolbar controller requires buttons, getHistory, and run');
  }
  const sync = () => {
    const history = getHistory();
    const blocked = Boolean(getBlockedReason());
    const undoEntry = history?.undo?.at(-1) || null;
    const redoEntry = history?.redo?.at(-1) || null;
    undoButton.disabled = Boolean(blocked || !undoEntry);
    redoButton.disabled = Boolean(blocked || !redoEntry);
    if (undoButton.dataset.presentation !== 'icon') undoButton.textContent = 'Undo';
    if (redoButton.dataset.presentation !== 'icon') redoButton.textContent = 'Redo';
    const undoLabel = undoEntry ? `Undo: ${undoEntry.action}` : 'Undo';
    const redoLabel = redoEntry ? `Redo: ${redoEntry.action}` : 'Redo';
    undoButton.setAttribute('aria-label', undoLabel);
    redoButton.setAttribute('aria-label', redoLabel);
    undoButton.setAttribute('title', undoLabel);
    redoButton.setAttribute('title', redoLabel);
    undoButton.dataset.tooltip = undoLabel;
    redoButton.dataset.tooltip = redoLabel;
  };
  const onUndo = () => run('undo');
  const onRedo = () => run('redo');
  undoButton.addEventListener('click', onUndo);
  redoButton.addEventListener('click', onRedo);
  return { sync, destroy() { undoButton.removeEventListener('click', onUndo); redoButton.removeEventListener('click', onRedo); } };
}
export function createInteractionOwnership({ recoveryFailed = false } = {}) {
  let creationOwned = false;
  let failed = Boolean(recoveryFailed);
  return {
    get creationOwned() { return creationOwned; },
    get recoveryFailed() { return failed; },
    blocked() { return creationOwned || failed; },
    beginCreation() { creationOwned = true; return creationOwned; },
    releaseCreation() { if (!creationOwned) return false; creationOwned = false; return true; },
    markRecoveryFailure() { failed = true; },
    clearRecoveryFailure() { failed = false; },
    reset() { creationOwned = false; failed = false; }
  };
}
export function isFocusableElement(element, document = globalThis.document) {
  if (!element || typeof element.focus !== 'function' || element.disabled) return false;
  if (element.isConnected === false) return false;
  for (let node = element; node; node = node.parentElement || node.parent) {
    if (node.hidden || node.style?.display === 'none' || node.style?.visibility === 'hidden') return false;
    let computed = null;
    try { computed = node.ownerDocument?.defaultView?.getComputedStyle?.(node) || document?.defaultView?.getComputedStyle?.(node) || null; } catch {}
    if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) return false;
  }
  return true;
}

export function resolveFocusFallback({ document, candidates = [], fallback = null }) {
  for (const candidate of candidates) if (isFocusableElement(candidate, document)) return candidate;
  return isFocusableElement(fallback, document) ? fallback : null;
}
export function createTooltipController({ document, tooltip, buttons, view = null, margin = 8, enabled = () => true, touchDelay = 1500 }) {
  if (!document || !tooltip || !Array.isArray(buttons)) throw new Error('tooltip controller requires tooltip, buttons, and document');
  const viewport = view || document.defaultView || globalThis.window || null;
  const touch = Number(viewport?.navigator?.maxTouchPoints) > 0;
  let current = null;
  let timer = null;
  let token = 0;
  const isEnabled = () => { try { return Boolean(enabled()); } catch { return false; } };
  const textFor = (button) => button?.dataset?.tooltip || button?.getAttribute?.('aria-label') || button?.getAttribute?.('title') || '';
  const clearTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const hide = () => { token += 1; clearTimer(); current = null; tooltip.hidden = true; tooltip.textContent = ''; };
  const place = () => {
    if (!current || tooltip.hidden) return;
    const rect = current.getBoundingClientRect?.() || { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    const tip = tooltip.getBoundingClientRect?.() || { width: 0, height: 0 };
    const width = Number(viewport?.innerWidth) || Number(document.documentElement?.clientWidth) || 0;
    const height = Number(viewport?.innerHeight) || Number(document.documentElement?.clientHeight) || 0;
    const left = Math.min(Math.max(margin, rect.left + (rect.width - tip.width) / 2), Math.max(margin, width - tip.width - margin));
    let top = rect.bottom + 6;
    if (height && top + tip.height > height - margin) top = Math.max(margin, rect.top - tip.height - 6);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };
  const show = (button) => {
    if (!isEnabled()) { hide(); return; }
    const text = textFor(button);
    if (!text) return;
    token += 1;
    clearTimer();
    current = button; tooltip.textContent = text; tooltip.hidden = false; place();
    if (touch) {
      const shown = token;
      timer = setTimeout(() => {
        if (shown !== token || current !== button) return;
        hide();
      }, Math.max(0, Number(touchDelay) || 1500));
    }
  };
  const onLeave = () => hide();
  const onFocus = (event) => show(event.currentTarget || event.target);
  const listeners = [];
  for (const button of buttons) {
    const enter = () => show(button);
    button.addEventListener('pointerenter', enter);
    button.addEventListener('pointerleave', onLeave);
    button.addEventListener('focus', onFocus);
    button.addEventListener('blur', onLeave);
    listeners.push([button, enter, onLeave, onFocus]);
  }
  const onOutsidePointer = (event) => {
    if (!touch || !current) return;
    const target = event?.target;
    if (target === current || current.contains?.(target)) return;
    hide();
  };
  const onOrientation = () => hide();
  const reposition = () => place();
  viewport?.addEventListener?.('resize', reposition);
  viewport?.addEventListener?.('orientationchange', onOrientation);
  document.addEventListener?.('pointerdown', onOutsidePointer, true);
  document.addEventListener?.('scroll', reposition, true);
  return { show, hide, place, isEnabled, get isTouch() { return touch; }, setEnabled(value) { if (!value) hide(); }, destroy() { hide(); for (const [button, enter, leave, focus] of listeners) { button.removeEventListener('pointerenter', enter); button.removeEventListener('pointerleave', leave); button.removeEventListener('focus', focus); button.removeEventListener('blur', leave); } viewport?.removeEventListener?.('resize', reposition); viewport?.removeEventListener?.('orientationchange', onOrientation); document.removeEventListener?.('pointerdown', onOutsidePointer, true); document.removeEventListener?.('scroll', reposition, true); } };
}
