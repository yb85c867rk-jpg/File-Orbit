import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTree, MAX_SEARCH_RESULTS, MAX_SEARCH_QUERY_CODE_POINTS } from '../../../src/engine/hypertree/exploration/search.js';

function tree() {
  return { id: 'r', name: 'Root', kind: 'folder', data: { description: 'Top level' }, children: [
    { id: 'a', name: 'Alpha', kind: 'folder', data: { description: 'First branch' }, children: [
      { id: 'x', name: 'Report.pdf', kind: 'file', data: { dataType: 'file', description: null, classification: { format: 'pdf' } } },
      { id: 'k', name: '한글 문서', kind: 'file', data: { dataType: 'file', description: '한글 설명' } }
    ] },
    { id: 'b', name: 'Beta', kind: 'folder', data: { description: 'Alpha appears in description' }, children: [] }
  ] };
}
test('matches names and descriptions with NFC/case folding and multiword AND behavior', () => {
  const result = searchTree(tree(), '  ALPHA  ');
  assert.equal(result.ok, true);
  assert.deepEqual(result.results.map((item) => item.id), ['a', 'b']);
  assert.equal(result.results[0].bucket, 0);
  assert.equal(result.results[1].bucket, 3);
  const multi = searchTree(tree(), '한글 설명');
  assert.deepEqual(multi.results.map((item) => item.id), ['k']);
  const multiField = searchTree(tree(), 'Alpha Beta');
  assert.equal(multiField.total, 1);
  assert.equal(multiField.results[0].id, 'b');
});
test('literal HTML/regex-looking queries and unicode composition text are safe', () => {
  const html = searchTree(tree(), '<script>');
  assert.equal(html.total, 0);
  const regex = searchTree(tree(), '.*');
  assert.equal(regex.total, 0);
  const korean = searchTree(tree(), '한글');
  assert.equal(korean.results[0].id, 'k');
});
test('ranking is exact, prefix, other name, then description with stable tie-breaks', () => {
  const t = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [
    { id: 'z', name: 'Report', kind: 'file', data: {} },
    { id: 'p', name: 'Report extra', kind: 'file', data: {} },
    { id: 'm', name: 'My Report', kind: 'file', data: {} },
    { id: 'd', name: 'Other', kind: 'file', data: { description: 'report' } },
    { id: 'a', name: 'report', kind: 'file', data: {} }
  ] };
  assert.deepEqual(searchTree(t, 'report').results.map((item) => item.id), ['a', 'z', 'p', 'm', 'd']);
});
test('caps rendered results at 50 while reporting total and limit', () => {
  const children = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, name: `Match ${String(i).padStart(2, '0')}`, kind: 'file', data: {} }));
  const result = searchTree({ id: 'r', name: 'Root', kind: 'folder', data: {}, children }, 'match');
  assert.equal(result.total, 60);
  assert.equal(result.results.length, MAX_SEARCH_RESULTS);
  assert.equal(result.limited, true);
  assert.equal(searchTree({ id: 'r', name: 'Root', kind: 'folder', data: {}, children }, 'x'.repeat(MAX_SEARCH_QUERY_CODE_POINTS + 1)).reason, 'query-too-long');
});
test('folderIds include matching folders and full ancestor paths from the complete match set', () => {
  const t = tree();
  assert.deepEqual(searchTree(t, 'Report').folderIds, ['a', 'r']);
  assert.deepEqual(searchTree(t, 'Alpha').folderIds, ['a', 'b', 'r']);
  assert.deepEqual(searchTree(t, '한글').folderIds, ['a', 'r']);
  assert.deepEqual(searchTree(t, 'missing').folderIds, []);
  const many = { id: 'r', name: 'Root', kind: 'folder', data: {}, children: [
    { id: 'f1', name: 'Branch One', kind: 'folder', data: {}, children: Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, name: `Hit ${i}`, kind: 'file', data: {} })) },
    { id: 'f2', name: 'Branch Two', kind: 'folder', data: {}, children: Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, name: `Hit ${i}`, kind: 'file', data: {} })) }
  ] };
  const capped = searchTree(many, 'Hit', { maxResults: 2 });
  assert.equal(capped.results.length, 2);
  assert.deepEqual(capped.folderIds, ['f1', 'f2', 'r']);
});

test('searches hidden branches and returns parent context without mutating the tree', () => {
  const t = tree(); const before = JSON.stringify(t);
  const result = searchTree(t, '한글');
  assert.equal(result.results[0].parentId, 'a');
  assert.equal(result.results[0].parentPath, 'Root / Alpha');
  assert.equal(JSON.stringify(t), before);
});

