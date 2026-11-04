/** Error type for invalid layout inputs/contract violations. */
export class LayoutContractError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {string} [nodeId]
   */
  constructor(code, message, nodeId) {
    super(nodeId ? `${message} (node ${nodeId})` : message);
    this.name = 'LayoutContractError';
    this.code = code;
    this.nodeId = nodeId;
  }
}
