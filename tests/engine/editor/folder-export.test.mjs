import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFolderExport } from '../../harness/m5-exploration/folder-export.js';

function att(file, name, mime, format, extension) {
  return { id: name, file, name, sizeBytes: file.size, mime, classification: { format, extension } };
}
function makeTree(overrides = {}) {
  const root = {
    id: 'root', kind: 'folder', name: 'Catalog', children: [
      {
        id: 'f1', kind: 'folder', name: 'Projects', data: { description: 'folder description' }, children: [
          { id: 'empty', kind: 'folder', name: 'Empty', children: [] },
          { id: 'pdf', kind: 'file', name: '보고서', data: { dataType: 'file', attachmentId: 'a-pdf', description: 'report' } },
          { id: 'image', kind: 'file', name: '그림', data: { dataType: 'file', attachmentId: 'a-image' } },
          { id: 'text', kind: 'file', name: '안내', data: { dataType: 'file', attachmentId: 'a-text' } },
          { id: 'zero', kind: 'file', name: '비어 있음', data: { dataType: 'file', attachmentId: 'a-zero' } },
          { id: 'link', kind: 'file', name: 'Docs', data: { dataType: 'web-link', link: 'https://example.com/a?x=1&y=2', description: '첫 줄 🙂\n둘째 줄 <b>' } },
          { id: 'meta', kind: 'file', name: 'Memo', data: { dataType: 'file', description: 'description only' } },
          { id: 'legacy', kind: 'file', name: 'Legacy', data: { description: 'legacy only' } }
        ]
      },
      { id: 'f2', kind: 'folder', name: 'Empty sibling', children: [] }
    ]
  };
  if (overrides.root) Object.assign(root, overrides.root);
  return root;
}
function registry() {
  return {
    get(id) {
      const files = {
        'a-pdf': att(new File([new TextEncoder().encode('%PDF-1.4\n%%EOF')], 'report.pdf', { type: 'application/pdf' }), 'report.pdf', 'application/pdf', 'pdf', 'pdf'),
        'a-image': att(new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' }), 'photo.png', 'image/png', 'generic', 'png'),
        'a-text': att(new File([new TextEncoder().encode('안녕하세요 🙂\n둘째 줄')], 'note.txt', { type: 'text/plain' }), 'note.txt', 'text/plain', 'text', 'txt'),
        'a-zero': att(new File([], 'empty.bin', { type: 'application/octet-stream' }), 'empty.bin', 'application/octet-stream', 'generic', 'bin')
      };
      return files[id] || null;
    }
  };
}
test('prepares selected nested folder with hierarchy, empty dirs, skips and exact totals', () => {
  const tree = makeTree();
  const snapshot = JSON.stringify(tree);
  const plan = prepareFolderExport({ tree, folderId: 'f1', attachmentRegistry: registry(), datasetToken: 7, revision: 11, ownership: 3 });
  assert.equal(plan.ok, true);
  assert.equal(plan.schema, 'fileorbit-folder-export-plan-v1');
  assert.equal(plan.datasetToken, 7);
  assert.equal(plan.revision, 11);
  assert.equal(plan.ownership, 3);
  assert.equal(plan.selectedFolder.id, 'f1');
  assert.equal(plan.outputFolderName, 'Projects');
  assert.deepEqual(plan.directories.map((entry) => entry.relativePath).sort(), ['Projects', 'Projects/Empty']);
  assert.deepEqual(plan.files.map((entry) => entry.relativePath).sort(), [
    'Projects/Docs.html', 'Projects/그림.png', 'Projects/비어 있음.bin', 'Projects/보고서.pdf', 'Projects/안내.txt'
  ].sort());
  assert.deepEqual(plan.totals.directories, 2);
  assert.deepEqual(plan.totals.attachments, 4);
  assert.deepEqual(plan.totals.webLinks, 1);
  assert.deepEqual(plan.totals.skipped, 2);
  const expectedBytes = 4 + 4 + 4 + new TextEncoder().encode('안녕하세요 🙂\n둘째 줄').length;
  const html = plan.files.find((file) => file.kind === 'web-link');
  assert.equal(plan.totals.totalBytes, plan.files.reduce((sum, file) => sum + file.bytes, 0));
  assert.ok(plan.totals.totalBytes > expectedBytes);
  assert.match(html.html, /<h1>Docs<\/h1>/);
  assert.match(html.html, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.match(html.html, /첫 줄 🙂\n둘째 줄 &lt;b&gt;/);
  assert.doesNotMatch(html.html, /<b>/);
  assert.doesNotMatch(html.html, /<script/i);
  assert.doesNotMatch(html.html, /attachment/i);
  assert.equal(JSON.stringify(tree), snapshot, 'preparation must not mutate the tree');
});
test('root export includes selected root directory and all descendants', () => {
  const plan = prepareFolderExport({ tree: makeTree(), folderId: 'root', attachmentRegistry: registry() });
  assert.equal(plan.ok, true);
  assert.equal(plan.outputFolderName, 'Catalog');
  assert.deepEqual(plan.directories.map((entry) => entry.relativePath).sort(), ['Catalog', 'Catalog/Empty sibling', 'Catalog/Projects', 'Catalog/Projects/Empty']);
  assert.ok(plan.files.every((entry) => entry.relativePath.startsWith('Catalog/')));
});
test('missing attachment is a preparation error, not a skipped node', () => {
  const tree = makeTree();
  tree.children[0].children.push({ id: 'missing', kind: 'file', name: 'Missing', data: { dataType: 'file', attachmentId: 'a-missing' } });
  const plan = prepareFolderExport({ tree, folderId: 'f1', attachmentRegistry: registry() });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((entry) => entry.reason === 'missing-attachment' && entry.mapPath.includes('Missing')));
  assert.equal(plan.totals.skipped, 2);
});
test('invalid and executable web links are preparation errors', () => {
  for (const link of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'not a link']) {
    const tree = makeTree();
    tree.children[0].children.push({ id: 'bad-link', kind: 'file', name: 'Bad', data: { dataType: 'web-link', link } });
    const plan = prepareFolderExport({ tree, folderId: 'f1', attachmentRegistry: registry() });
    assert.equal(plan.ok, false);
    assert.ok(plan.errors.some((entry) => entry.reason === 'invalid-link' && entry.nodeId === 'bad-link'));
  }
});
test('collisions include case, Unicode, sanitization, generated HTML and file/directory names', () => {
  const cases = [
    { names: ['A', 'a'], kind: 'folder' },
    { names: ['é', 'e\u0301'], kind: 'folder' },
    { names: ['CON', '_CON'], kind: 'folder' },
    { names: ['site.html', 'site'], link: true },
  ];
  for (const entry of cases) {
    const tree = { id: 'root', kind: 'folder', name: 'Root', children: [] };
    if (entry.link) {
      tree.children.push({ id: 'file-html', kind: 'folder', name: 'site.html', children: [] });
      tree.children.push({ id: 'web', kind: 'file', name: 'site', data: { dataType: 'web-link', link: 'https://example.com' } });
    } else {
      for (const [index, name] of entry.names.entries()) tree.children.push({ id: 'c' + index, kind: entry.kind, name, children: [] });
    }
    const plan = prepareFolderExport({ tree, folderId: 'root', attachmentRegistry: registry() });
    assert.equal(plan.ok, false, JSON.stringify(entry));
    const collision = plan.errors.find((error) => error.reason === 'filesystem-name-collision');
    assert.ok(collision, JSON.stringify(entry));
    assert.match(collision.message, /Filesystem paths collide/);
    assert.ok(collision.first.relativePath && collision.second.relativePath);
  }
  const tree = { id: 'root', kind: 'folder', name: 'Root', children: [
    { id: 'dir', kind: 'folder', name: 'X.pdf', children: [] },
    { id: 'file', kind: 'file', name: 'X', data: { dataType: 'file', attachmentId: 'a-pdf' } }
  ] };
  const plan = prepareFolderExport({ tree, folderId: 'root', attachmentRegistry: registry() });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((error) => error.reason === 'filesystem-name-collision' && error.first.type !== error.second.type));
});
test('selected folder name is sanitized without mutating the map name', () => {
  const tree = { id: 'root', kind: 'folder', name: 'Root', children: [{ id: 'con', kind: 'folder', name: 'CON', children: [] }] };
  const plan = prepareFolderExport({ tree, folderId: 'con', attachmentRegistry: registry() });
  assert.equal(plan.ok, true);
  assert.equal(plan.outputFolderName, '_CON');
  assert.equal(plan.selectedFolder.name, 'CON');
});

test('same display names under different directories remain distinct', () => {
  const root = { id: 'root', kind: 'folder', name: 'Root', children: [
    { id: 'a', kind: 'folder', name: 'A', children: [{ id: 'fa', kind: 'file', name: 'same.txt', data: { dataType: 'file', attachmentId: 'a-text' } }] },
    { id: 'b', kind: 'folder', name: 'B', children: [{ id: 'fb', kind: 'file', name: 'same.txt', data: { dataType: 'file', attachmentId: 'a-pdf' } }] }
  ] };
  const plan = prepareFolderExport({ tree: root, folderId: 'root', attachmentRegistry: registry() });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.files.map((file) => file.relativePath).sort(), ['Root/A/same.txt', 'Root/B/same.pdf']);
  assert.notEqual(plan.files[0].bytes, plan.files[1].bytes);
});
