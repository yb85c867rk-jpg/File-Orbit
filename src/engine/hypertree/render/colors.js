import { GraphRenderError } from './errors.js';

// Deterministic, DOM-free color subset for this static rendering slice.
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function assertHexColor(value, label) {
  if (!isHexColor(value)) {
    throw new GraphRenderError('invalid-style', `${label} must be a 3/4/6/8-digit hex color`);
  }
  return value;
}
