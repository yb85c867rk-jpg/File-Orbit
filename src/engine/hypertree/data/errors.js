/** Errors for the M2 tree loader. */
export class TreeLoadError extends Error {
  /**
   * @param {string} code
   * @param {string} path
   * @param {string} message
   */
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = 'TreeLoadError';
    this.code = code;
    this.path = path;
  }
}

export const LIMITS = Object.freeze({
  maxNodes: 100000,
  maxDepth: 10000,
  maxChildren: 10000,
  maxIdLength: 1024,
  maxNameLength: 4096,
  maxMetadataKeys: 64,
  maxMetadataDepth: 8,
  maxMetadataString: 4096,
  maxMetadataBytes: 16384,
  maxMetadataArray: 128
});
