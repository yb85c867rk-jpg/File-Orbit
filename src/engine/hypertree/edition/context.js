/**
 * Internal edition-capacity context.
 *
 * This object is an internal capacity input, NOT proof of purchase or an
 * entitlement. It is never read from a document, package, URL, localStorage,
 * UI control, or account state. Callers in the normal application use the
 * frozen free context or omit the option entirely.
 */
import { EDITION_IDS, EDITION_NODE_LIMITS, evaluateNodeAccess } from './policy.js';

export const POLICY_CONTEXT_KIND = 'fileorbit.internal-policy-context';
export const POLICY_CONTEXT_VERSION = 1;

const ISSUED_CONTEXTS = new WeakSet();

export const FREE_POLICY_CONTEXT = (() => {
  const context = Object.freeze({ kind: POLICY_CONTEXT_KIND, version: POLICY_CONTEXT_VERSION, edition: EDITION_IDS.free, maxNodes: null });
  ISSUED_CONTEXTS.add(context);
  return context;
})();

export function createInternalPolicyContext({ edition = EDITION_IDS.free, maxNodes = null } = {}) {
  if (edition !== EDITION_IDS.free && edition !== EDITION_IDS.paid) {
    throw new TypeError('unsupported internal policy edition');
  }
  if (maxNodes !== null && (!Number.isSafeInteger(maxNodes) || maxNodes < 1)) {
    throw new TypeError('policy context maxNodes must be a positive safe integer or null');
  }
  const context = Object.freeze({ kind: POLICY_CONTEXT_KIND, version: POLICY_CONTEXT_VERSION, edition, maxNodes });
  ISSUED_CONTEXTS.add(context);
  return context;
}

export function resolvePolicyContext(value) {
  if (value === undefined || value === null) return { ok: true, context: FREE_POLICY_CONTEXT, defaulted: true };
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !ISSUED_CONTEXTS.has(value)) {
    return { ok: false, reason: 'invalid-policy-context', message: 'The internal policy context is invalid.' };
  }
  if (value.kind !== POLICY_CONTEXT_KIND || value.version !== POLICY_CONTEXT_VERSION) {
    return { ok: false, reason: 'invalid-policy-context', message: 'The internal policy context is invalid.' };
  }
  if (value.edition !== EDITION_IDS.free && value.edition !== EDITION_IDS.paid) {
    return { ok: false, reason: 'invalid-policy-context', message: 'The internal policy edition is unknown.' };
  }
  if (value.maxNodes !== null && value.maxNodes !== undefined && (!Number.isSafeInteger(value.maxNodes) || value.maxNodes < 1)) {
    return { ok: false, reason: 'invalid-policy-context', message: 'The internal policy budget is invalid.' };
  }
  if (!Object.isFrozen(value)) {
    return { ok: false, reason: 'invalid-policy-context', message: 'The internal policy context must be frozen.' };
  }
  return { ok: true, context: value, defaulted: false };
}

export function contextEditionLimit(context) {
  const resolved = resolvePolicyContext(context);
  return resolved.ok ? EDITION_NODE_LIMITS[resolved.context.edition] : null;
}

/**
 * Evaluate a node count using an internal context plus an optional caller
 * resource budget. Lower caller/context budgets tighten; higher values cannot
 * elevate the edition limit.
 */
export function evaluateContextNodeAccess(policyContext, nodeCount, callerMaxNodes = null) {
  const resolved = resolvePolicyContext(policyContext);
  if (!resolved.ok) return { ok: false, reason: resolved.reason, message: resolved.message };
  const context = resolved.context;
  const contextBudget = context.maxNodes === null ? null : context.maxNodes;
  const requested = callerMaxNodes === undefined ? null : callerMaxNodes;
  if (requested !== null && (!Number.isSafeInteger(requested) || requested < 1)) {
    return { ok: false, reason: 'invalid-caller-limit', message: 'The caller resource budget is invalid.' };
  }
  const caller = contextBudget === null ? requested : (requested === null ? contextBudget : Math.min(contextBudget, requested));
  const decision = evaluateNodeAccess({ edition: context.edition, nodeCount, callerMaxNodes: caller });
  return { ok: true, decision, context, callerMaxNodes: caller };
}

