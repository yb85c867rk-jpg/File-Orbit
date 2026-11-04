/*
 * FileOrbit V2 — T2 minimal harness instrumentation.
 *
 * Scope (deliberately narrow):
 *   - EventTarget.addEventListener / removeEventListener
 *   - window.setTimeout / clearTimeout, setInterval / clearInterval
 *   - window.requestAnimationFrame / cancelAnimationFrame
 *
 * NOT instrumented (deferred until correctness of broad wrapping can be tested):
 *   document.createElement / appendChild / getElementById, observer constructors,
 *   URL.createObjectURL / revokeObjectURL.
 *
 * Retention rules:
 *   - Ledger records hold primitives only. Released records never keep a DOM node,
 *     callback, observer, AbortSignal or visualization instance.
 *   - Active listeners are tracked in a WeakMap keyed by the event target, so the
 *     instrumentation itself does not keep a target alive.
 *   - release() drops callback/wrapper/signal references and removes the entry.
 *
 * Native semantics preserved: listener identity for removeEventListener, capture,
 * once, AbortSignal, return value, `this`, argument order and exception propagation.
 *
 * This file must load BEFORE jit.js so JIT's own window/canvas listeners are observed.
 */
(function () {
  'use strict';

  var RECORD_LIMIT = 2000;

  var state = {
    installedAt: Date.now(),
    seq: 0,
    records: [],
    active: { listener: 0, timeout: 0, interval: 0, raf: 0 },
    totals: { adds: 0, removes: 0, timeouts: 0, intervals: 0, rafs: 0 },
    unsupported: {},
    finalization: typeof FinalizationRegistry === 'function'
  };

  var finReg = state.finalization
    ? new FinalizationRegistry(function (recordId) { markReleased(recordId, 'target-collected'); })
    : null;

  var registry = typeof WeakMap === 'function' ? new WeakMap() : null;
  var nativeAdd = EventTarget.prototype.addEventListener;
  var nativeRemove = EventTarget.prototype.removeEventListener;

  function countUnsupported(key) {
    state.unsupported[key] = (state.unsupported[key] || 0) + 1;
  }

  function describeTarget(target) {
    try {
      if (target === window) return { tag: 'window', id: 'window' };
      if (target === document) return { tag: 'document', id: 'document' };
      if (target && target.nodeType) {
        return { tag: String(target.tagName || 'node').toLowerCase(), id: String(target.id || '') };
      }
      var name = (target && target.constructor && target.constructor.name) || 'object';
      return { tag: String(name).toLowerCase(), id: String((target && target.id) || '') };
    } catch (e) {
      return { tag: 'unknown', id: '' };
    }
  }

  function pushRecord(record) {
    state.records.push(record);
    if (state.records.length > RECORD_LIMIT) state.records.shift();
  }

  function markReleased(recordId, reason) {
    var rec = null;
    for (var i = state.records.length - 1; i >= 0; i--) {
      if (state.records[i].id === recordId) { rec = state.records[i]; break; }
    }
    if (!rec || rec.status !== 'active') return;
    rec.status = 'released';
    rec.releasedAt = Date.now();
    rec.releaseReason = String(reason);
    if (state.active[rec.kind] > 0) state.active[rec.kind]--;
  }

  function releaseEntry(entry, reason) {
    if (!entry || entry.released) return;
    entry.released = true;
    markReleased(entry.id, reason);

    if (entry.abortCleanup) {
      try { entry.abortCleanup(); } catch (e) { /* bookkeeping only */ }
      entry.abortCleanup = null;
    }
    entry.fn = null;
    entry.wrapper = null;
    entry.signal = null;

    if (entry.list) {
      var idx = entry.list.indexOf(entry);
      if (idx >= 0) entry.list.splice(idx, 1);
      entry.list = null;
    }
    if (finReg && entry.token) {
      try { finReg.unregister(entry.token); } catch (e) { /* bookkeeping only */ }
      entry.token = null;
    }
  }

  function normalizeCapture(options) {
    if (typeof options === 'boolean') return options;
    if (options && typeof options === 'object') return !!options.capture;
    return false;
  }

  function unsupportedOptions(options) {
    if (options == null || typeof options === 'boolean') return false;
    if (typeof options !== 'object') return true;
    for (var key in options) {
      if (key !== 'capture' && key !== 'once' && key !== 'passive' && key !== 'signal') return true;
    }
    return false;
  }

  // --- EventTarget -----------------------------------------------------------

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    state.totals.adds++;

    if (!registry || typeof listener !== 'function') {
      countUnsupported(typeof listener === 'object' && listener ? 'handleEvent-or-object' : 'non-function');
      return nativeAdd.apply(this, arguments);
    }
    if (unsupportedOptions(options)) {
      countUnsupported('options');
      return nativeAdd.apply(this, arguments);
    }

    var capture = normalizeCapture(options);
    var once = !!(options && typeof options === 'object' && options.once);
    var passive = (options && typeof options === 'object' && 'passive' in options)
      ? options.passive : null;
    var signal = (options && typeof options === 'object') ? options.signal : null;
    var desc = describeTarget(this);
    var id = ++state.seq;

    var entry = {
      id: id,
      type: String(type),
      capture: capture,
      once: once,
      passive: passive,
      fn: listener,
      wrapper: null,
      signal: null,
      abortCleanup: null,
      released: false,
      list: null,
      token: null
    };

    var wrapper = function () {
      if (entry.once) releaseEntry(entry, 'once-fired');
      var fn = entry.fn;
      if (typeof fn !== 'function') return undefined;
      return fn.apply(this, arguments);
    };
    entry.wrapper = wrapper;

    try {
      var list = registry.get(this);
      if (!list) { list = []; registry.set(this, list); }
      entry.list = list;
      list.push(entry);
      entry.token = entry;
      if (finReg) finReg.register(this, id, entry);
      pushRecord({
        id: id, kind: 'listener', status: 'active', owner: 'harness',
        type: String(type), capture: capture, once: once, passive: passive,
        targetTag: desc.tag, targetId: desc.id,
        createdAt: Date.now(), releasedAt: null, releaseReason: null
      });
      state.active.listener++;
      if (signal && typeof signal.addEventListener === 'function') {
        entry.signal = signal;
        var onAbort = function () { releaseEntry(entry, 'signal-abort'); };
        entry.abortCleanup = function () {
          try { nativeRemove.call(signal, 'abort', onAbort, false); } catch (e) { /* bookkeeping */ }
        };
        // Register with the native API so abort bookkeeping is not instrumented.
        nativeAdd.call(signal, 'abort', onAbort, { once: true });
      }
    } catch (e) {
      countUnsupported('bookkeeping-exception');
    }

    try {
      return nativeAdd.call(this, type, wrapper, options);
    } catch (e) {
      releaseEntry(entry, 'native-threw');
      throw e;
    }
  };

  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    state.totals.removes++;
    try {
      var capture = normalizeCapture(options);
      var list = registry ? registry.get(this) : null;
      if (list) {
        for (var i = 0; i < list.length; i++) {
          var entry = list[i];
          if (!entry.released && entry.wrapper &&
              entry.type === String(type) && entry.fn === listener && entry.capture === capture) {
            var result = nativeRemove.call(this, type, entry.wrapper, capture);
            releaseEntry(entry, 'removed');
            return result;
          }
        }
      }
    } catch (e) {
      countUnsupported('remove-exception');
    }
    // Unknown registration (e.g. installed before instrumentation): native decides.
    return nativeRemove.apply(this, arguments);
  };

  // --- Timers ----------------------------------------------------------------

  var nativeSetTimeout = window.setTimeout;
  var nativeClearTimeout = window.clearTimeout;
  var nativeSetInterval = window.setInterval;
  var nativeClearInterval = window.clearInterval;
  var timerMeta = new Map();

  window.setTimeout = function (handler, delay) {
    state.totals.timeouts++;
    if (typeof handler !== 'function') {
      countUnsupported('code-string');
      return nativeSetTimeout.apply(window, arguments);
    }
    var id = ++state.seq;
    var extra = Array.prototype.slice.call(arguments, 2);
    var wrapped = function () {
      markReleased(id, 'timeout-fired');
      return handler.apply(this, arguments);
    };
    var handle = nativeSetTimeout.apply(window, [wrapped, delay].concat(extra));
    timerMeta.set(handle, { id: id, kind: 'timeout' });
    pushRecord({
      id: id, kind: 'timeout', status: 'active', owner: 'harness',
      delay: typeof delay === 'number' ? delay : 0,
      targetTag: 'window', targetId: 'timeout',
      createdAt: Date.now(), releasedAt: null, releaseReason: null
    });
    state.active.timeout++;
    return handle;
  };

  window.clearTimeout = function (handle) {
    var meta = timerMeta.get(handle);
    if (meta) { timerMeta.delete(handle); markReleased(meta.id, 'cleared'); }
    return nativeClearTimeout.apply(window, arguments);
  };

  window.setInterval = function (handler, delay) {
    state.totals.intervals++;
    if (typeof handler !== 'function') {
      countUnsupported('code-string');
      return nativeSetInterval.apply(window, arguments);
    }
    var id = ++state.seq;
    var extra = Array.prototype.slice.call(arguments, 2);
    var wrapped = function () { return handler.apply(this, arguments); };
    var handle = nativeSetInterval.apply(window, [wrapped, delay].concat(extra));
    timerMeta.set(handle, { id: id, kind: 'interval' });
    pushRecord({
      id: id, kind: 'interval', status: 'active', owner: 'harness',
      delay: typeof delay === 'number' ? delay : 0,
      targetTag: 'window', targetId: 'interval',
      createdAt: Date.now(), releasedAt: null, releaseReason: null
    });
    state.active.interval++;
    return handle;
  };

  window.clearInterval = function (handle) {
    var meta = timerMeta.get(handle);
    if (meta) { timerMeta.delete(handle); markReleased(meta.id, 'cleared'); }
    return nativeClearInterval.apply(window, arguments);
  };

  // --- requestAnimationFrame ------------------------------------------------

  var nativeRaf = window.requestAnimationFrame;
  var nativeCancelRaf = window.cancelAnimationFrame;
  var rafMeta = new Map();

  if (typeof nativeRaf === 'function') {
    window.requestAnimationFrame = function (callback) {
      state.totals.rafs++;
      if (typeof callback !== 'function') {
        countUnsupported('raf-non-function');
        return nativeRaf.apply(window, arguments);
      }
      var id = ++state.seq;
      var wrapped = function (timestamp) {
        markReleased(id, 'raf-fired');
        return callback.call(this, timestamp);
      };
      var handle = nativeRaf.call(window, wrapped);
      rafMeta.set(handle, id);
      pushRecord({
        id: id, kind: 'raf', status: 'active', owner: 'harness',
        targetTag: 'window', targetId: 'raf',
        createdAt: Date.now(), releasedAt: null, releaseReason: null
      });
      state.active.raf++;
      return handle;
    };

    window.cancelAnimationFrame = function (handle) {
      if (rafMeta.has(handle)) { markReleased(rafMeta.get(handle), 'cancelled'); rafMeta.delete(handle); }
      return nativeCancelRaf.apply(window, arguments);
    };
  } else {
    countUnsupported('raf-unavailable');
  }

  // --- Status API ------------------------------------------------------------

  function counts() {
    return {
      active: {
        listeners: state.active.listener,
        timeouts: state.active.timeout,
        intervals: state.active.interval,
        rafs: state.active.raf
      },
      totals: {
        adds: state.totals.adds,
        removes: state.totals.removes,
        timeouts: state.totals.timeouts,
        intervals: state.totals.intervals,
        rafs: state.totals.rafs
      },
      unsupported: Object.assign({}, state.unsupported),
      finalization: state.finalization,
      recordCount: state.records.length,
      recordLimit: RECORD_LIMIT
    };
  }

  function records() {
    return state.records.map(function (rec) { return Object.assign({}, rec); });
  }

  function reset() {
    // Drop released records only: active resources must stay visible.
    state.records = state.records.filter(function (rec) { return rec.status === 'active'; });
  }

  function selfTest() {
    var results = [];
    var baseListeners = state.active.listener;

    function check(name, ok) { results.push({ name: name, ok: !!ok }); }

    var target = document.createElement('div'); // detached scratch target
    var noop = function () {};

    target.addEventListener('vd-self', noop, false);
    check('add listener -> active +1', state.active.listener === baseListeners + 1);

    target.removeEventListener('vd-self', noop, false);
    check('remove listener -> active back', state.active.listener === baseListeners);

    target.addEventListener('vd-self-once', function () {}, { once: true });
    target.dispatchEvent(new Event('vd-self-once'));
    check('once listener released after dispatch', state.active.listener === baseListeners);

    var controller = new AbortController();
    target.addEventListener('vd-self-abort', function () {}, { signal: controller.signal });
    controller.abort();
    check('AbortSignal releases listener', state.active.listener === baseListeners);

    var beforeTimeout = state.active.timeout;
    var fired = false;
    window.setTimeout(function () { fired = true; }, 0);

    return new Promise(function (resolve) {
      nativeSetTimeout.call(window, function () {
        check('timeout released after firing', state.active.timeout === beforeTimeout && fired);

        var beforeInterval = state.active.interval;
        var handle = window.setInterval(function () {}, 1000);
        window.clearInterval(handle);
        check('clearInterval releases interval', state.active.interval === beforeInterval);

        var passed = results.every(function (r) { return r.ok; });
        resolve({ passed: passed, results: results });
      }, 25);
    });
  }

  window.__VD_INSTRUMENTATION__ = {
    version: '1.0.0',
    installedAt: state.installedAt,
    scope: [
      'EventTarget.addEventListener', 'EventTarget.removeEventListener',
      'setTimeout/clearTimeout', 'setInterval/clearInterval',
      'requestAnimationFrame/cancelAnimationFrame'
    ],
    notInstrumented: [
      'document.createElement', 'document.appendChild', 'document.getElementById',
      'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
      'URL.createObjectURL', 'URL.revokeObjectURL'
    ],
    counts: counts,
    records: records,
    reset: reset,
    selfTest: selfTest
  };
})();

