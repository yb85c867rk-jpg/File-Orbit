/**
 * Central edition node limits and pure shadow policy.
 *
 * This module deliberately has no imports and no application consumers yet.
 * Stage 1A defines the policy only; create/open/edit/save/recovery integration
 * remains a later stage. Free is always the default when no context is given.
 */

export const EDITION_IDS = Object.freeze({
  free: 'free',
  paid: 'paid'
});

export const EDITION_NODE_LIMITS = Object.freeze({
  free: 300,
  paid: 1000
});

export const NODE_ACCESS_REASONS = Object.freeze({
  withinLimit: 'within-limit',
  editionLimit: 'edition-node-limit',
  callerLimit: 'caller-node-limit',
  invalidInput: 'invalid-input',
  invalidNodeCount: 'invalid-node-count',
  invalidCallerLimit: 'invalid-caller-limit',
  unsupportedEdition: 'unsupported-edition'
});

const FREE = EDITION_IDS.free;
const PAID = EDITION_IDS.paid;

function resolveEdition(value) {
  if (value === undefined || value === null || value === '') return { ok: true, edition: FREE, defaulted: true };
  if (value === FREE || value === PAID) return { ok: true, edition: value, defaulted: false };
  return { ok: false, edition: null, defaulted: false };
}

function isPositiveNodeCount(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isPositiveLimit(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function decision({ ok, allowed, edition = null, nodeCount, editionLimit = null, callerMaxNodes = null, effectiveLimit = null, reason, tightenedBy = null, defaultedToFree = false }) {
  return Object.freeze({
    ok: Boolean(ok),
    allowed: Boolean(allowed),
    edition,
    nodeCount,
    editionLimit,
    callerMaxNodes,
    effectiveLimit,
    reason,
    tightenedBy,
    defaultedToFree: defaultedToFree === true
  });
}

function invalid(reason, { edition = null, nodeCount, editionLimit = null, callerMaxNodes = null, defaultedToFree = false } = {}) {
  return decision({
    ok: false,
    allowed: false,
    edition,
    nodeCount,
    editionLimit,
    callerMaxNodes,
    effectiveLimit: null,
    reason,
    tightenedBy: null,
    defaultedToFree
  });
}

/**
 * Evaluate whether a total document node count is allowed by an edition and an
 * optional caller-supplied tightening budget.
 *
 * @param {{
 *   edition?: 'free'|'paid'|null,
 *   nodeCount?: number,
 *   callerMaxNodes?: number|null
 * }} [input]
 * Every result carries the same ten properties. `tightenedBy` is null unless
 * a successful decision established an effective limit; it is never set on an
 * invalid/unsupported result. `defaultedToFree` is true only when the edition
 * input was omitted/null/empty and edition resolution succeeded; it describes
 * that fallback even if later node/caller validation fails. It is false for
 * malformed input and unsupported editions, where no free fallback occurred.
 *
 * @returns {Readonly<{
 *   ok: boolean,
 *   allowed: boolean,
 *   edition: 'free'|'paid'|null,
 *   nodeCount: number,
 *   editionLimit: number|null,
 *   callerMaxNodes: number|null,
 *   effectiveLimit: number|null,
 *   reason: string,
 *   tightenedBy: 'caller'|'edition'|null,
 *   defaultedToFree: boolean
 * }>}
 */
export function evaluateNodeAccess(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(NODE_ACCESS_REASONS.invalidInput);
  }

  const resolved = resolveEdition(input.edition);
  if (!resolved.ok) {
    return invalid(NODE_ACCESS_REASONS.unsupportedEdition, { nodeCount: input.nodeCount, callerMaxNodes: input.callerMaxNodes ?? null });
  }

  const edition = resolved.edition;
  const editionLimit = EDITION_NODE_LIMITS[edition];
  const nodeCount = input.nodeCount;
  const callerMaxNodes = input.callerMaxNodes === undefined ? null : input.callerMaxNodes;

  if (!isPositiveNodeCount(nodeCount)) {
    return invalid(NODE_ACCESS_REASONS.invalidNodeCount, { edition, nodeCount, callerMaxNodes, editionLimit, defaultedToFree: resolved.defaulted });
  }
  if (callerMaxNodes !== null && !isPositiveLimit(callerMaxNodes)) {
    return invalid(NODE_ACCESS_REASONS.invalidCallerLimit, { edition, nodeCount, callerMaxNodes, editionLimit, defaultedToFree: resolved.defaulted });
  }

  const callerTightens = callerMaxNodes !== null && callerMaxNodes < editionLimit;
  const callerExceeds = callerMaxNodes !== null && callerMaxNodes > editionLimit;
  const effectiveLimit = callerTightens ? callerMaxNodes : editionLimit;
  const allowed = nodeCount <= effectiveLimit;
  const reason = allowed
    ? NODE_ACCESS_REASONS.withinLimit
    : (callerTightens ? NODE_ACCESS_REASONS.callerLimit : NODE_ACCESS_REASONS.editionLimit);

  return decision({
    ok: true,
    allowed,
    edition,
    nodeCount,
    editionLimit,
    callerMaxNodes,
    effectiveLimit,
    reason,
    tightenedBy: callerTightens ? 'caller' : (callerExceeds ? 'edition' : null),
    defaultedToFree: resolved.defaulted
  });
}

export function editionNodeLimit(edition) {
  const resolved = resolveEdition(edition);
  return resolved.ok ? EDITION_NODE_LIMITS[resolved.edition] : null;
}



