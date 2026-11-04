import { GraphRenderError } from '../render/errors.js';
import {
  DEFAULT_FOCUS_DURATION_MS,
  MAX_FOCUS_DURATION_MS,
  sampleFocusTransition
} from './focus-transition.js';
import { FOCUS_CENTER_TOLERANCE, focusParameter } from './focus-view.js';

/**
 * Owned immediate/animated focus controller. Pure scheduling lives here; DOM and
 * rendering stay in the caller's synchronous callbacks.
 */
export function createFocusAnimator(options = {}) {
  const config = normalizeConfig(options);
  return new FocusAnimator(config);
}

class FocusAnimator {
  #config;
  #state = 'idle';
  #base = null;
  #focusId = null;
  #phase = null;
  #startParameter = null;
  #targetParameter = null;
  #currentParameter = null;
  #startTime = 0;
  #elapsedMs = 0;
  #duration = 0;
  #rawProgress = 0;
  #easedProgress = 0;
  #frameCount = 0;
  #lastFrame = null;
  #pending = false;
  #frameHandle = null;
  #token = 0;
  #failure = null;
  #completionReason = null;
  #destroyed = false;

  constructor(config) {
    this.#config = config;
  }

  getState() {
    return Object.freeze({
      state: this.#state,
      requestedFocusId: this.#focusId,
      startParameter: this.#startParameter ? { ...this.#startParameter } : null,
      targetParameter: this.#targetParameter ? { ...this.#targetParameter } : null,
      currentParameter: this.#currentParameter ? { ...this.#currentParameter } : null,
      elapsedMs: this.#elapsedMs,
      durationMs: this.#duration,
      rawProgress: this.#rawProgress,
      easedProgress: this.#easedProgress,
      frameCount: this.#frameCount,
      pendingFrame: this.#pending,
      lastFrame: this.#lastFrame,
      completionReason: this.#completionReason,
      failure: this.#failure
    });
  }

  /**
   * @param {{base:object, focusId:string, phase?:string, fromParameter?:{x:number,y:number}, duration?:number}} input
   * @returns {{status:'started'|'completed'|'busy'|'failed', state?:object, error?:GraphRenderError}}
   */
  start(input) {
    if (this.#destroyed) {
      throw new GraphRenderError('invalid-lifecycle', 'focus animator has been destroyed');
    }
    if (this.#state === 'running') {
      return { status: 'busy', state: this.getState() };
    }
    if (!input || typeof input !== 'object') {
      throw new GraphRenderError('invalid-animation', 'animation input is required');
    }
    const duration = normalizeDuration(input.duration === undefined ? this.#config.duration : input.duration);
    const base = input.base;
    const focusId = input.focusId;
    const phase = input.phase;
    const fromParameter = input.fromParameter === undefined
      ? { x: 0, y: 0 }
      : requireOpenDiskParameter(input.fromParameter, 'fromParameter');
    const targetParameter = focusParameter(base, focusId, phase);
    // Validate the exact endpoint before scheduling any work.
    const final = sampleFocusTransition(base, { focusId, phase, fromParameter, progress: 1 });
    if (final.view.centerError > FOCUS_CENTER_TOLERANCE) {
      throw new GraphRenderError('focus-center', 'target focus is not centered within tolerance');
    }
    if (duration > 0 && (typeof this.#config.requestFrame !== 'function'
        || typeof this.#config.cancelFrame !== 'function')) {
      throw new GraphRenderError('invalid-animation', 'requestAnimationFrame and cancelAnimationFrame are required for animation');
    }

    this.#base = base;
    this.#focusId = focusId;
    this.#phase = phase === undefined ? null : phase;
    this.#startParameter = fromParameter;
    this.#targetParameter = targetParameter;
    this.#currentParameter = fromParameter;
    this.#duration = duration;
    this.#rawProgress = 0;
    this.#easedProgress = 0;
    this.#frameCount = 0;
    this.#lastFrame = null;
    this.#failure = null;
    this.#completionReason = null;
    this.#state = 'running';
    this.#token += 1;
    try {
      this.#startTime = this.#config.now();
    } catch (error) {
      this.#fail(error);
      return { status: 'failed', state: this.getState(), error: this.#failure };
    }
    this.#elapsedMs = 0;
    if (typeof this.#startTime !== 'number' || !Number.isFinite(this.#startTime)) {
      this.#fail(new GraphRenderError('invalid-clock', 'animation clock must be finite'));
      return { status: 'failed', state: this.getState(), error: this.#failure };
    }

    if (duration === 0) {
      this.#renderProgress(1);
      if (this.#state === 'running') this.#complete();
      return {
        status: this.#state,
        state: this.getState(),
        error: this.#failure
      };
    }

    // Draw the start view synchronously, then schedule exactly one pending frame.
    this.#renderProgress(0);
    if (this.#state === 'running') {
      try {
        this.#schedule();
      } catch (error) {
        this.#fail(error);
      }
    }
    return {
      status: this.#state === 'running' ? 'started' : this.#state,
      state: this.getState(),
      error: this.#failure
    };
  }

  cancel(reason = 'cancelled') {
    if (this.#destroyed || this.#state !== 'running') return this.getState();
    this.#token += 1;
    this.#cancelPending();
    this.#state = 'cancelled';
    this.#completionReason = String(reason);
    this.#currentParameter = null;
    this.#notify(this.#config.onCancel, Object.freeze({ reason: this.#completionReason, state: this.getState() }));
    this.#notify(this.#config.onSettled, Object.freeze({ state: this.getState() }));
    return this.getState();
  }

  destroy() {
    if (this.#destroyed) return;
    if (this.#state === 'running') {
      this.#token += 1;
      this.#cancelPending();
      this.#state = 'destroyed';
      this.#completionReason = 'destroyed';
    } else {
      this.#state = 'destroyed';
    }
    this.#destroyed = true;
    this.#pending = false;
    this.#frameHandle = null;
    this.#base = null;
    this.#config = null;
    this.#lastFrame = null;
    this.#startParameter = null;
    this.#targetParameter = null;
    this.#currentParameter = null;
    this.#focusId = null;
    this.#phase = null;
  }

  #schedule() {
    if (this.#pending || this.#state !== 'running') return;
    this.#pending = true;
    const token = this.#token;
    let invoked = false;
    try {
      const handle = this.#config.requestFrame(() => {
        invoked = true;
        this.#onScheduledFrame(token);
      });
      if (!invoked && this.#pending && this.#state === 'running') {
        this.#frameHandle = handle;
      }
    } catch (error) {
      this.#pending = false;
      this.#frameHandle = null;
      this.#fail(error);
    }
  }

  #onScheduledFrame(token) {
    if (this.#destroyed || token !== this.#token || this.#state !== 'running') return;
    this.#pending = false;
    this.#frameHandle = null;
    try {
      const now = this.#config.now();
      if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new GraphRenderError('invalid-clock', 'animation clock must be finite');
      }
      const elapsed = Math.max(0, now - this.#startTime);
      this.#elapsedMs = elapsed;
      const raw = Math.min(1, elapsed / this.#duration);
      this.#renderProgress(raw);
      if (this.#state === 'running') {
        if (raw >= 1) this.#complete();
        else this.#schedule();
      }
    } catch (error) {
      this.#fail(error);
    }
  }
  #renderProgress(rawProgress) {
    try {
      const sample = sampleFocusTransition(this.#base, {
        focusId: this.#focusId,
        phase: this.#phase === null ? undefined : this.#phase,
        fromParameter: this.#startParameter,
        progress: rawProgress
      });
      this.#rawProgress = sample.progress;
      this.#easedProgress = sample.eased;
      this.#currentParameter = sample.parameter;
      const frame = {
        state: 'running',
        progress: sample.progress,
        eased: sample.eased,
        parameter: sample.parameter,
        view: sample.view
      };
      const returned = this.#config.onFrame(frame);
      if (returned && typeof returned.then === 'function') {
        throw new GraphRenderError('async-frame-unsupported', 'frame drawing must be synchronous');
      }
      this.#frameCount += 1;
      this.#lastFrame = frame;
    } catch (error) {
      this.#fail(error);
    }
  }

  #complete() {
    try {
      const completion = {
        state: 'completed',
        progress: 1,
        eased: 1,
        parameter: this.#currentParameter,
        view: this.#lastFrame ? this.#lastFrame.view : null
      };
      const returned = this.#config.onComplete(completion);
      if (returned && typeof returned.then === 'function') {
        throw new GraphRenderError('async-frame-unsupported', 'completion installation must be synchronous');
      }
      if (this.#state !== 'running') return;
      this.#token += 1;
      this.#cancelPending();
      this.#state = 'completed';
      this.#completionReason = 'completed';
      this.#currentParameter = completion.parameter;
      this.#notify(this.#config.onSettled, Object.freeze({ state: this.getState() }));
    } catch (error) {
      this.#fail(error);
    }
  }

  #fail(error) {
    if (this.#state !== 'running') return;
    this.#token += 1;
    this.#cancelPending();
    this.#state = 'failed';
    this.#failure = error instanceof GraphRenderError
      ? error
      : new GraphRenderError('animation-failed', error && error.message ? error.message : 'animation failed');
    this.#completionReason = 'failed';
    this.#currentParameter = null;
    this.#notify(this.#config.onError, Object.freeze({ error: this.#failure, state: this.getState() }));
    this.#notify(this.#config.onSettled, Object.freeze({ state: this.getState() }));
  }

  #cancelPending() {
    if (this.#frameHandle !== null && typeof this.#config.cancelFrame === 'function') {
      try {
        this.#config.cancelFrame(this.#frameHandle);
      } catch {
        // Cleanup must still clear pending ownership.
      }
    }
    this.#frameHandle = null;
    this.#pending = false;
  }

  #notify(callback, payload) {
    if (typeof callback !== 'function') return;
    try {
      callback(payload);
    } catch {
      // Callback errors are reported through state; they do not leave pending work.
    }
  }
}

function normalizeConfig(options) {
  const config = {
    duration: options.duration === undefined ? DEFAULT_FOCUS_DURATION_MS : options.duration,
    now: options.now || defaultNow,
    requestFrame: options.requestFrame || globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame: options.cancelFrame || globalThis.cancelAnimationFrame?.bind(globalThis),
    onFrame: options.onFrame,
    onComplete: options.onComplete,
    onError: options.onError,
    onCancel: options.onCancel,
    onSettled: options.onSettled
  };
  normalizeDuration(config.duration);
  if (typeof config.now !== 'function') {
    throw new GraphRenderError('invalid-animation', 'now must be a function');
  }
  if (config.requestFrame !== undefined && typeof config.requestFrame !== 'function') {
    throw new GraphRenderError('invalid-animation', 'requestFrame must be a function when provided');
  }
  if (config.cancelFrame !== undefined && typeof config.cancelFrame !== 'function') {
    throw new GraphRenderError('invalid-animation', 'cancelFrame must be a function when provided');
  }
  for (const key of ['onFrame', 'onComplete', 'onError', 'onCancel', 'onSettled']) {
    if (config[key] !== undefined && typeof config[key] !== 'function') {
      throw new GraphRenderError('invalid-animation', `${key} must be a function when provided`);
    }
  }
  if (typeof config.onFrame !== 'function' || typeof config.onComplete !== 'function') {
    throw new GraphRenderError('invalid-animation', 'onFrame and onComplete are required');
  }
  return config;
}

function normalizeDuration(duration) {
  if (typeof duration !== 'number' || !Number.isFinite(duration)
      || duration < 0 || duration > MAX_FOCUS_DURATION_MS) {
    throw new GraphRenderError('invalid-animation', `duration must be finite 0..${MAX_FOCUS_DURATION_MS}ms`);
  }
  return duration;
}

function requireOpenDiskParameter(parameter, label) {
  if (!parameter || typeof parameter !== 'object'
      || typeof parameter.x !== 'number' || !Number.isFinite(parameter.x)
      || typeof parameter.y !== 'number' || !Number.isFinite(parameter.y)
      || Math.hypot(parameter.x, parameter.y) >= 1) {
    throw new GraphRenderError('invalid-focus', `${label} must be finite and strictly inside the open disk`);
  }
  return { x: parameter.x, y: parameter.y };
}

function defaultNow() {
  if (globalThis.performance && typeof globalThis.performance.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}








