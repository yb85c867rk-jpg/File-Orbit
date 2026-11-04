import test from 'node:test'; import assert from 'node:assert/strict';
import { buildTree, countNodes, findByName, SHAPES } from './fixtures.mjs';
for (const shape of SHAPES) for (const total of [300,1000]) test(`large-map fixture ${shape} ${total}`, () => {
  const tree = buildTree(shape, total, { text:'att-text', image:'att-image', pdf:'att-pdf', empty:'att-empty' });
  assert.equal(countNodes(tree), total); assert.equal(tree.kind, 'folder'); assert.ok(findByName(tree, '보고서.txt')); assert.ok(findByName(tree, '빈-폴더')); assert.ok(findByName(tree, '한글-문서.txt'));
  assert.equal(findByName(tree, '샘플-텍스트.txt').data.attachmentId, 'att-text'); assert.equal(findByName(tree, '샘플-PDF.pdf').data.attachmentId, 'att-pdf');
});
test('large-map duplicate names live in different folders', () => { const tree = buildTree('flat', 300, {}); const matches=[]; const walk=(n)=>{if(n.name==='보고서.txt')matches.push(n.id);for(const c of n.children||[])walk(c)};walk(tree); assert.equal(matches.length,2); });
