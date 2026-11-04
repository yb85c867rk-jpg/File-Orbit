export function createEmbedHandshake({ onStatus = () => {}, onReady = () => {}, onTimeout = () => {}, loadTimeoutMs = 10000, readyTimeoutMs = 10000, timers = globalThis } = {}) {
  let state = 'idle';
  let timer = null;
  const clear = () => { if (timer !== null) { timers.clearTimeout(timer); timer = null; } };
  const arm = (ms) => { clear(); timer = timers.setTimeout(() => { timer = null; if (state === 'loaded' || state === 'destroyed') return; state = 'timeout'; onTimeout(); }, ms); };
  return {
    get state() { return state; },
    get timerActive() { return timer !== null; },
    load() { if (state !== 'idle') return false; state = 'loading-iframe'; onStatus('Viewer loaded; waiting for ready…'); arm(loadTimeoutMs); return true; },
    ready() {
      if (state === 'loaded' || state === 'loading-snapshot' || state === 'destroyed') return false;
      clear(); state = 'loading-snapshot'; onStatus('Viewer ready; sending validated snapshot…'); arm(readyTimeoutMs); onReady(); return true;
    },
    acknowledged() {
      if (state !== 'loading-snapshot') return false;
      clear(); state = 'loaded'; onStatus('Local read-only preview loaded', 'ready'); return true;
    },
    failed(message) {
      if (state === 'loaded' || state === 'destroyed') return false;
      clear(); state = 'error'; onStatus(message || 'Preview unavailable.', 'error'); return true;
    },
    lateError(message) { if (state === 'loaded') return false; return this.failed(message); },
    destroy() { clear(); state = 'destroyed'; }
  };
}
