import { EDITION_NODE_LIMITS } from '../edition/index.js';
import { evaluateContextNodeAccess } from '../edition/context.js';

export const MAX_SAVED_MAP_NODES = EDITION_NODE_LIMITS.free;

/**
 * Resolve the effective saved-map node limit.
 * policyContext is an internal capacity input; omission defaults to free.
 */
export function resolveSavedMapNodeLimit(requestedMaxNodes, policyContext = undefined) {
  const access = evaluateContextNodeAccess(policyContext, 1, requestedMaxNodes);
  if (!access.ok) {
    return Object.freeze({
      ok: false,
      reason: access.reason === 'invalid-caller-limit' ? 'invalid-node-limit' : access.reason,
      message: access.reason === 'invalid-caller-limit' ? 'The saved-map node limit is invalid.' : access.message
    });
  }
  return Object.freeze({
    ok: true,
    limit: access.decision.effectiveLimit,
    edition: access.context.edition,
    context: access.context,
    decision: access.decision
  });
}
