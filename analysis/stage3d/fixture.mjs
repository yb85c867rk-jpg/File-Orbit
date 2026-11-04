const TEXT = new TextEncoder().encode('텍스트 첨부');
const IMAGE = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
const PDF = new TextEncoder().encode('%PDF-1.7 한국어');
const ZERO = new Uint8Array(0);
const types = [
  ['텍스트-문서.txt', TEXT, 'text/plain', { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false }],
  ['이미지-그림.png', IMAGE, 'image/png', { format: 'image', badge: 'PNG', mime: 'image/png', needsReview: false }],
  ['PDF-문서.pdf', PDF, 'application/pdf', { format: 'pdf', badge: 'PDF', mime: 'application/pdf', needsReview: false }],
  ['빈-파일.txt', ZERO, 'text/plain', { format: 'text', badge: 'TXT', mime: 'text/plain', needsReview: false }]
];

export function buildLodFixture(total, registry, FileCtor = globalThis.File) {
  if (!Number.isSafeInteger(total) || total < 20) throw new TypeError('fixture total must be >= 20');
  const attachments = [];
  for (const [name, bytes, mime, classification] of types) {
    const staged = registry.stage(new FileCtor([bytes], name, { type: mime }), classification);
    registry.commit(staged.id);
    attachments.push({ attachmentId: staged.id, name, bytes, mime, classification });
  }
  const bigCount = total - 50;
  const big = { id: 'folder-big', name: '큰-폴더', kind: 'folder', data: {}, children: [] };
  for (let i = 0; i < bigCount; i += 1) {
    const duplicate = i < 8;
    const name = duplicate ? '같은이름.txt' : (i === 8 ? '아주-긴-한국어-파일-이름-'.repeat(2) + i + '.txt' : `파일-${i}.txt`);
    if (i === 10) { big.children.push({ id: 'folder-page2', name: '2페이지-폴더', kind: 'folder', data: {}, children: [] }); continue; }
    big.children.push({ id: i === 9 ? 'proxy:root:0:40' : `big-${i}`, name, kind: 'file', data: { description: `설명 ${i}` }, children: [] });
  }
  const docs = { id: 'folder-docs', name: '문서-모음', kind: 'folder', data: {}, children: [] };
  for (let i = 0; i < attachments.length; i += 1) {
    const a = attachments[i];
    docs.children.push({ id: `doc-${i}`, name: a.name, kind: 'file', data: { dataType: 'file', attachmentId: a.attachmentId, originalName: a.name, sizeBytes: a.bytes.length, mime: a.mime, classification: a.classification }, children: [] });
  }
  const empty = { id: 'folder-empty', name: '빈-폴더', kind: 'folder', data: {}, children: [] };
  const rootFile = { id: 'root-file', name: '루트-파일.txt', kind: 'file', data: { description: 'root' }, children: [] };
  const wide = { id: 'folder-40', name: '40-자식-폴더', kind: 'folder', data: {}, children: Array.from({ length: 40 }, (_, i) => ({ id: `wide-${i}`, name: `40-항목-${i}.txt`, kind: 'file', data: {}, children: [] })) };
  const tree = { id: 'root', name: 'Stage 3D 문서', kind: 'folder', data: {}, children: [big, docs, empty, rootFile, wide] };
  return { tree, attachments, bigCount };
}



