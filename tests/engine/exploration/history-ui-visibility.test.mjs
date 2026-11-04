import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryUiVisibility } from '../../../src/engine/hypertree/editor/history-ui-visibility.js';
import { readFileSync } from 'node:fs';

function setup(visibleInitially = false) {
  const element = { hidden: !visibleInitially };
  const status = { textContent: visibleInitially ? 'Undid: Delete Data' : '' };
  const ui = createHistoryUiVisibility({ element, status });
  if (visibleInitially) ui.show();
  return { element, status, ui };
}
test('history UI starts hidden, shows for mutation, and hide clears only feedback', () => {
  const s = setup();
  assert.equal(s.element.hidden, true);
  const history = { undoCount: 1 };
  s.ui.showForMutation({ ok: true }, history);
  assert.equal(s.element.hidden, false);
  s.ui.hide();
  assert.equal(s.element.hidden, true);
  assert.equal(s.status.textContent, '');
  assert.equal(history.undoCount, 1);
});
test('folder hide occurs only for completed different scope; failed/cancelled preserve visibility', () => {
  const s = setup(true);
  s.ui.hideForFolderResult({ completionReason: 'cancelled', targetId: 'n6', focusedFolderId: 'n0' });
  assert.equal(s.element.hidden, false);
  s.ui.hideForFolderResult({ completionReason: 'failed', targetId: 'n6', focusedFolderId: 'n0' });
  assert.equal(s.element.hidden, false);
  s.ui.hideForFolderResult({ completionReason: 'completed', targetId: 'n0', focusedFolderId: 'n0' });
  assert.equal(s.element.hidden, false);
  s.ui.hideForFolderResult({ completionReason: 'completed', targetId: 'n6', focusedFolderId: 'n0' });
  assert.equal(s.element.hidden, true);
});
test('failed or no-op mutations do not reveal hidden controls', () => {
  const s = setup();
  s.ui.showForMutation({ ok: false }, { undoCount: 1 });
  s.ui.showForMutation({ ok: true, noop: true }, { undoCount: 1 });
  s.ui.showForMutation({ ok: true }, { undoCount: 0 });
  assert.equal(s.element.hidden, true);
});
test('harness toolbar keeps one always-visible Undo/Redo pair and no navigation visibility state', () => {
  const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.doesNotMatch(source, /setHistoryUiVisible|createHistoryUiVisibility|historyUiVisibility/);
  assert.match(source, /function syncHistoryControls\(\)/);
  assert.match(source, /const undoLabel = undoEntry \? 'Undo: ' \+ undoEntry\.action : 'Undo';/);
  assert.doesNotMatch(source, /undoHistoryButton\.textContent = undoEntry/);
});
test('toolbar controls live above the graph and navigation frames do not hide them', () => {
  const html = readFileSync(new URL('../../harness/m5-exploration/index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../../harness/m5-exploration/main.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.match(html, /id="graph-action-toolbar"[\s\S]*?id="undo-history"[\s\S]*?id="redo-history"/);
  assert.ok(html.indexOf('id="graph-wrap"') < html.indexOf('id="graph-action-toolbar"'));
  assert.ok(html.indexOf('id="graph-action-toolbar"') < html.indexOf('id="empty-state"'));
  assert.doesNotMatch(html, /id="history-ui"/);
  assert.doesNotMatch(source, /clearHistory\(|history = createEditorHistory\(\);\s*[\s\S]{0,120}?navigation/);
});
