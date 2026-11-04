import { LIMITS, TreeLoadError } from './errors.js';

/**
 * Copy JSON-like metadata into a null-prototype object/array structure.
 *
 * Supported values: null, boolean, string, finite number, array, and plain
 * object. Functions, symbols, bigint, undefined, non-finite numbers, class
 * instances, getters/setters, cycles, and repeated object references on the
 * current path are rejected. Null prototypes are used so keys such as
 * "__proto__", "constructor", and "toString" are ordinary own keys.
 *
 * @param {unknown} value
 * @param {typeof LIMITS} [limits]
 * @param {string} [path]
 * @returns {unknown}
 */
export function cloneMetadata(value, limits = LIMITS, path = 'data') {
  const state = { bytes: 0, limits, active: new WeakSet() };
  return cloneValue(value, 0, path, state);
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @param {string} path
 * @param {{bytes:number,limits:typeof LIMITS,active:WeakSet<object>}} state
 * @returns {unknown}
 */
function cloneValue(value, depth, path, state) {
  if (value === null) {
    bump(state, 4, path);
    return null;
  }
  if (typeof value === 'string') {
    if (value.length > state.limits.maxMetadataString) {
      throw new TreeLoadError('metadata-too-large', path, 'string exceeds metadata limit');
    }
    bump(state, value.length, path);
    return value;
  }
  if (typeof value === 'boolean') {
    bump(state, 4, path);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TreeLoadError('metadata-invalid', path, 'number must be finite');
    }
    bump(state, 8, path);
    return value;
  }
  if (typeof value !== 'object') {
    throw new TreeLoadError('metadata-invalid', path, `unsupported ${typeof value} value`);
  }
  if (depth >= state.limits.maxMetadataDepth) {
    throw new TreeLoadError('metadata-depth', path, 'metadata nesting exceeds limit');
  }
  if (state.active.has(value)) {
    throw new TreeLoadError('metadata-cycle', path, 'cyclic metadata reference');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TreeLoadError('metadata-invalid', path, 'symbol keys are not supported');
  }

  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > state.limits.maxMetadataArray) {
        throw new TreeLoadError('metadata-too-large', path, 'array exceeds metadata limit');
      }
      const keys = Object.keys(value);
      if (keys.length !== value.length || Object.getOwnPropertyNames(value).length !== value.length + 1) {
        throw new TreeLoadError('metadata-invalid', path, 'sparse arrays or extra keys are not supported');
      }
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
          throw new TreeLoadError('metadata-invalid', `${path}[${i}]`, 'accessors are not supported');
        }
        out.push(cloneValue(descriptor.value, depth + 1, `${path}[${i}]`, state));
      }
      return out;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TreeLoadError('metadata-invalid', path, 'only plain objects are supported');
    }
    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      throw new TreeLoadError('metadata-invalid', path, 'non-enumerable keys are not supported');
    }
    if (keys.length > state.limits.maxMetadataKeys) {
      throw new TreeLoadError('metadata-too-large', path, 'object has too many keys');
    }
    const out = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
        throw new TreeLoadError('metadata-invalid', `${path}.${key}`, 'accessors are not supported');
      }
      bump(state, key.length, `${path}.${key}`);
      out[key] = cloneValue(descriptor.value, depth + 1, `${path}.${key}`, state);
    }
    return out;
  } finally {
    state.active.delete(value);
  }
}

/** @param {{bytes:number,limits:typeof LIMITS}} state @param {number} amount @param {string} path */
function bump(state, amount, path) {
  state.bytes += amount;
  if (state.bytes > state.limits.maxMetadataBytes) {
    throw new TreeLoadError('metadata-too-large', path, 'metadata exceeds byte limit');
  }
}
