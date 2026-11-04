export class GraphRenderError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'GraphRenderError';
    this.code = code;
  }
}

export function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GraphRenderError('invalid-number', `${label} must be finite`);
  }
  return value;
}

export function finiteNonNegative(value, label) {
  const n = finiteNumber(value, label);
  if (n < 0) throw new GraphRenderError('invalid-number', `${label} must be >= 0`);
  return n;
}

export function finitePositive(value, label) {
  const n = finiteNumber(value, label);
  if (n <= 0) throw new GraphRenderError('invalid-number', `${label} must be > 0`);
  return n;
}
