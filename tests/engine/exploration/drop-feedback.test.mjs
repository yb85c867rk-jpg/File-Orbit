import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDropFeedback, dropRejectionMessage, PROHIBITED_DROP_MESSAGE } from '../../../src/engine/hypertree/exploration/drop-feedback.js';
import { buildReparentCandidate, resolveDropTarget } from '../../../src/engine/hypertree/exploration/reparent.js';

function tree() {
  return {
    id: 'r', name: 'Root', kind: 'folder', children: [
      { id: 'a', name: 'A', kind: 'folder', children: [{ id: 'x', name: 'X', kind: 'file' }] },
      { id: 'd', name: 'Data', kind: 'file' }
    ]
  };
}
test('drop rejection messages are exact English for data, empty, and stale destinations', () => {
  assert.equal(PROHIBITED_DROP_MESSAGE, 'This action is not allowed.');
  assert.doesNotMatch(readFileSync(new URL('../../../src/engine/hypertree/exploration/drop-feedback.js', import.meta.url), 'utf8'), /[\uAC00-\uD7AF]/);
  assert.doesNotMatch(readFileSync(new URL('../../../src/engine/hypertree/exploration/reparent-action.js', import.meta.url), 'utf8'), /[\uAC00-\uD7AF]/);
  assert.equal(dropRejectionMessage({ reason: 'data-target', dataTarget: true }), 'Drop onto a folder, not a data item.');
  assert.equal(dropRejectionMessage({ reason: 'empty', dataTarget: false }), 'Drop onto a folder to move this item.');
  assert.equal(dropRejectionMessage({ reason: 'stale-gesture', dataTarget: true }), 'The map changed. Please try dragging again.');
  assert.equal(dropRejectionMessage({ reason: 'stale-id' }), 'The map changed. Please try dragging again.');
});
test('data destination rejects before candidate preparation and leaves the tree unchanged', () => {
  const source = tree();
  const gesture = { sourceId: 'x', generation: 1, datasetToken: 2, structuralRootId: 'r' };
  const target = resolveDropTarget({ sourceId: 'x', hitId: 'd', gesture, generation: 1, datasetToken: 2, structuralRootId: 'r' });
  assert.equal(target.ok, true);
  const result = buildReparentCandidate({ tree: source, sourceId: 'x', targetId: target.targetId });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'data-target');
  assert.equal(source.children[0].children[0].id, 'x');
  assert.equal(source.children[1].id, 'd');
  assert.equal(resolveDropTarget({ sourceId: 'x', hitId: null, gesture, generation: 1, datasetToken: 2, structuralRootId: 'r' }).reason, 'empty');
  assert.equal(resolveDropTarget({ sourceId: 'x', hitId: 'a', gesture, generation: 1, datasetToken: 2, structuralRootId: 'r' }).ok, true);
});
test('one feedback timer is replaced and dismisses the newest message after 2000ms', () => {
  const element = { textContent: '' };
  const timers = new Map();
  let next = 1;
  const feedback = createDropFeedback(element, {
    setTimer: (fn, duration) => { const id = next++; timers.set(id, { fn, duration }); return id; },
    clearTimer: (id) => timers.delete(id)
  });
  feedback.show('first');
  assert.equal(element.textContent, 'first');
  const first = feedback.timer;
  feedback.show('second');
  assert.equal(element.textContent, 'second');
  assert.equal(timers.has(first), false);
  assert.equal(timers.get(feedback.timer).duration, 2000);
  timers.get(feedback.timer).fn();
  assert.equal(element.textContent, '');
  assert.equal(feedback.timer, null);
  feedback.show('third');
  feedback.clear();
  assert.equal(element.textContent, '');
  assert.equal(feedback.timer, null);
});
test('feedback element is centered in the graph viewport and non-interactive', () => {
  const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
  assert.match(html, /#drag-feedback \{[^}]*position:\s*absolute/);
  assert.match(html, /#drag-feedback \{[^}]*left:\s*50%/);
  assert.match(html, /#drag-feedback \{[^}]*top:\s*50%/);
  assert.match(html, /#drag-feedback \{[^}]*transform:\s*translate\(-50%,\s*-50%\)/);
  assert.match(html, /#drag-feedback \{[^}]*pointer-events:\s*none/);
  assert.match(html, /<div id="graph-wrap">[\s\S]*id="drag-feedback"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
});
