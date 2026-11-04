import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITION_IDS,
  EDITION_NODE_LIMITS,
  NODE_ACCESS_REASONS,
  editionNodeLimit,
  evaluateNodeAccess
} from '../../../src/engine/hypertree/edition/index.js';
import { EDITOR_MAX_NODES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_TOTAL_BYTES } from '../../../src/engine/hypertree/editor/validation.js';
import { MAX_SAVED_MAP_NODES } from '../../../src/engine/hypertree/persistence/schema.js';

test('free boundary accepts 299/300 and rejects 301 including root', () => {
  for (const nodeCount of [299, 300]) {
    const result = evaluateNodeAccess({ edition: 'free', nodeCount });
    assert.equal(result.ok, true);
    assert.equal(result.allowed, true);
    assert.equal(result.edition, 'free');
    assert.equal(result.editionLimit, 300);
    assert.equal(result.effectiveLimit, 300);
    assert.equal(result.reason, 'within-limit');
    assert.equal(result.defaultedToFree, false);
  }
  const rejected = evaluateNodeAccess({ edition: 'free', nodeCount: 301 });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.reason, 'edition-node-limit');
  assert.equal(rejected.editionLimit, 300);
});

test('isolated paid policy boundary accepts 999/1000 and rejects 1001', () => {
  for (const nodeCount of [999, 1000]) {
    const result = evaluateNodeAccess({ edition: 'paid', nodeCount });
    assert.equal(result.ok, true);
    assert.equal(result.allowed, true);
    assert.equal(result.edition, 'paid');
    assert.equal(result.editionLimit, 1000);
    assert.equal(result.effectiveLimit, 1000);
  }
  const rejected = evaluateNodeAccess({ edition: 'paid', nodeCount: 1001 });
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.reason, 'edition-node-limit');
});

test('invalid node counts are rejected explicitly', () => {
  for (const nodeCount of [-1, 0, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '300', null, undefined]) {
    const result = evaluateNodeAccess({ edition: 'free', nodeCount });
    assert.equal(result.ok, false, String(nodeCount));
    assert.equal(result.allowed, false);
    assert.equal(result.reason, NODE_ACCESS_REASONS.invalidNodeCount);
    assert.equal(result.effectiveLimit, null);
  }
});

test('invalid caller limits are rejected, not coerced', () => {
  for (const callerMaxNodes of [0, -1, 1.5, NaN, Infinity, '1000', {}]) {
    const result = evaluateNodeAccess({ edition: 'free', nodeCount: 300, callerMaxNodes });
    assert.equal(result.ok, false);
    assert.equal(result.reason, NODE_ACCESS_REASONS.invalidCallerLimit);
  }
});

test('missing or unknown context cannot enable paid access', () => {
  const defaulted = evaluateNodeAccess({ nodeCount: 300 });
  assert.equal(defaulted.ok, true);
  assert.equal(defaulted.allowed, true);
  assert.equal(defaulted.edition, 'free');
  assert.equal(defaulted.defaultedToFree, true);

  for (const edition of ['paid ', 'PAID', 'enterprise', 'unlicensed', true, 1, {}]) {
    const result = evaluateNodeAccess({ edition, nodeCount: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.allowed, false);
    assert.equal(result.edition, null);
    assert.equal(result.reason, NODE_ACCESS_REASONS.unsupportedEdition);
  }
});

test('caller budgets tighten but never elevate an edition limit', () => {
  const paidCappedByCaller = evaluateNodeAccess({ edition: 'paid', nodeCount: 301, callerMaxNodes: 300 });
  assert.equal(paidCappedByCaller.allowed, false);
  assert.equal(paidCappedByCaller.effectiveLimit, 300);
  assert.equal(paidCappedByCaller.reason, NODE_ACCESS_REASONS.callerLimit);
  assert.equal(paidCappedByCaller.tightenedBy, 'caller');

  const freeCappedByEdition = evaluateNodeAccess({ edition: 'free', nodeCount: 300, callerMaxNodes: 1000 });
  assert.equal(freeCappedByEdition.allowed, true);
  assert.equal(freeCappedByEdition.effectiveLimit, 300);
  assert.equal(freeCappedByEdition.tightenedBy, 'edition');
  assert.equal(freeCappedByEdition.callerMaxNodes, 1000);

  const equal = evaluateNodeAccess({ edition: 'paid', nodeCount: 1000, callerMaxNodes: 1000 });
  assert.equal(equal.allowed, true);
  assert.equal(equal.tightenedBy, null);
});

test('policy is pure, deterministic, frozen, and does not mutate caller input', () => {
  const input = Object.freeze({ edition: 'paid', nodeCount: 1000, callerMaxNodes: 800 });
  const first = evaluateNodeAccess(input);
  const second = evaluateNodeAccess(input);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(input, { edition: 'paid', nodeCount: 1000, callerMaxNodes: 800 });
  assert.equal(first.allowed, false);
  assert.equal(first.effectiveLimit, 800);
});

test('existing free application defaults remain 300 and aligned with policy', () => {
  assert.equal(EDITOR_MAX_NODES, 300);
  assert.equal(MAX_SAVED_MAP_NODES, 300);
  assert.equal(EDITION_NODE_LIMITS.free, EDITOR_MAX_NODES);
  assert.equal(EDITION_NODE_LIMITS.paid, 1000);
  assert.equal(MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_ATTACHMENT_TOTAL_BYTES, 100 * 1024 * 1024);
  assert.equal(editionNodeLimit('free'), 300);
  assert.equal(editionNodeLimit('paid'), 1000);
  assert.equal(editionNodeLimit('unknown'), null);
  assert.deepEqual(EDITION_IDS, { free: 'free', paid: 'paid' });
});

const RESULT_KEYS = ['allowed', 'callerMaxNodes', 'defaultedToFree', 'edition', 'editionLimit', 'effectiveLimit', 'nodeCount', 'ok', 'reason', 'tightenedBy'].sort();

function assertUniformResult(result) {
  assert.deepEqual(Object.keys(result).sort(), RESULT_KEYS);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(typeof result.tightenedBy === 'string' || result.tightenedBy === null, true);
  assert.equal(typeof result.defaultedToFree, 'boolean');
}

test('null, primitive, and array inputs are rejected with the full contract', () => {
  for (const input of [null, 'free', 1, true, []]) {
    const result = evaluateNodeAccess(input);
    assertUniformResult(result);
    assert.equal(result.ok, false);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'invalid-input');
    assert.equal(result.edition, null);
    assert.equal(result.editionLimit, null);
    assert.equal(result.effectiveLimit, null);
    assert.equal(result.tightenedBy, null);
    assert.equal(result.defaultedToFree, false);
  }
});

test('invalid node/caller results carry tightenedBy and defaultedToFree explicitly', () => {
  const invalidCount = evaluateNodeAccess({ nodeCount: 0 });
  assertUniformResult(invalidCount);
  assert.equal(invalidCount.reason, 'invalid-node-count');
  assert.equal(invalidCount.tightenedBy, null);
  assert.equal(invalidCount.defaultedToFree, true, 'missing edition resolved to free before count validation failed');

  const invalidCaller = evaluateNodeAccess({ edition: 'paid', nodeCount: 300, callerMaxNodes: 0 });
  assertUniformResult(invalidCaller);
  assert.equal(invalidCaller.reason, 'invalid-caller-limit');
  assert.equal(invalidCaller.tightenedBy, null);
  assert.equal(invalidCaller.defaultedToFree, false);
});

test('unsupported editions and successful results share the same contract', () => {
  const unsupported = evaluateNodeAccess({ edition: 'enterprise', nodeCount: 1 });
  assertUniformResult(unsupported);
  assert.equal(unsupported.reason, 'unsupported-edition');
  assert.equal(unsupported.edition, null);
  assert.equal(unsupported.tightenedBy, null);
  assert.equal(unsupported.defaultedToFree, false);

  for (const input of [
    { edition: 'free', nodeCount: 300 },
    { edition: 'paid', nodeCount: 1000 },
    { edition: 'paid', nodeCount: 301, callerMaxNodes: 300 },
    { edition: 'free', nodeCount: 300, callerMaxNodes: 1000 }
  ]) {
    assertUniformResult(evaluateNodeAccess(input));
  }
});

test('missing context rejects 301 and a free caller budget cannot elevate it to paid', () => {
  const missing = evaluateNodeAccess({ nodeCount: 301 });
  assertUniformResult(missing);
  assert.equal(missing.allowed, false);
  assert.equal(missing.edition, 'free');
  assert.equal(missing.effectiveLimit, 300);
  assert.equal(missing.reason, 'edition-node-limit');
  assert.equal(missing.defaultedToFree, true);

  const callerAttempt = evaluateNodeAccess({ edition: 'free', nodeCount: 301, callerMaxNodes: 1000 });
  assertUniformResult(callerAttempt);
  assert.equal(callerAttempt.allowed, false);
  assert.equal(callerAttempt.effectiveLimit, 300);
  assert.equal(callerAttempt.reason, 'edition-node-limit');
  assert.equal(callerAttempt.tightenedBy, 'edition');
  assert.equal(callerAttempt.defaultedToFree, false);
});
