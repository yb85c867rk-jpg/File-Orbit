export const SHAPES = Object.freeze(['flat', 'wide', 'balanced', 'mixed', 'deep']);
export const COUNTS = Object.freeze([300, 1000]);
let sequence = 0;
function node(kind, name, children = [], data = {}) { sequence += 1; return { id: `lm-${sequence}`, kind, name, data, children }; }
function file(name, data = {}) { return node('file', name, [], data); }
function folder(name, children = []) { return node('folder', name, children); }
function special(root) {
  const longName = 'very-long-document-name-with-project-context-and-revision-notes-2026-final-reviewed.txt';
  const folderA = folder('같은-이름-폴더-A', [file('보고서.txt', { description: 'A' })]);
  const folderB = folder('같은-이름-폴더-B', [file('보고서.txt', { description: 'B' })]);
  root.children.push(folderA, folderB, folder('빈-폴더'), file(longName), file('한글-문서.txt'), file('샘플-텍스트.txt'), file('샘플-이미지.png'), file('샘플-PDF.pdf'), file('빈-파일.txt'));
  return { folderA, folderB, longName };
}
export function buildTree(shape, total, attachmentIds = {}) {
  sequence = 0;
  const root = folder('FileOrbit 대형 맵', []);
  const specials = special(root);
  const remaining = total - 1 - root.children.length;
  if (remaining < 0) throw new Error('total too small');
  if (shape === 'flat') {
    for (let i = 0; i < remaining; i += 1) root.children.push(file(`file-${String(i + 1).padStart(4, '0')}.txt`, { description: `flat ${i}` }));
  } else if (shape === 'wide') {
    const folders = Math.max(1, Math.ceil(Math.sqrt(remaining)));
    let left = remaining;
    for (let f = 0; f < folders && left > 0; f += 1) {
      const count = Math.ceil(left / (folders - f)); const children = [];
      for (let i = 0; i < count; i += 1) children.push(file(`wide-${f + 1}-${String(i + 1).padStart(3, '0')}.txt`));
      root.children.push(folder(`와이드-그룹-${f + 1}`, children)); left -= count;
    }
  } else if (shape === 'balanced') {
    const queue = [root]; let left = remaining;
    while (left > 0) {
      const parent = queue.shift(); if (!parent) break;
      for (let i = 0; i < 4 && left > 0; i += 1) {
        if (left > 4) { const child = folder(`균형-폴더-${sequence + 1}`); parent.children.push(child); queue.push(child); left -= 1; }
        else { parent.children.push(file(`균형-파일-${sequence + 1}.txt`)); left -= 1; }
      }
    }
  } else if (shape === 'mixed') {
    let left = remaining;
    for (let f = 0; f < 6 && left > 0; f += 1) {
      const children = []; const count = Math.min(left, 12 + f * 6);
      for (let i = 0; i < count; i += 1) children.push(i % 5 === 0 ? folder(`혼합-하위-${f + 1}-${i + 1}`, [file(`혼합-문서-${f + 1}-${i + 1}.txt`)]) : file(`혼합-문서-${f + 1}-${i + 1}.txt`));
      root.children.push(folder(`혼합-그룹-${f + 1}`, children)); left -= count;
    }
    while (left > 0) { root.children.push(file(`혼합-남은-${sequence + 1}.txt`)); left -= 1; }
  } else {
    let parent = root;
    for (let d = 0; d < Math.min(120, remaining); d += 1) {
      const child = folder(`깊은-단계-${d + 1}`, []); parent.children.push(child, file(`깊은-파일-${d + 1}.txt`)); parent = child; sequence += 1;
    }
    let left = total - 1 - countNodes(root);
    while (left > 0) { parent.children.push(file(`깊은-끝-${sequence + 1}.txt`)); left -= 1; sequence += 1; }
  }
  while (countNodes(root) > total) { if (!removeGeneratedFile(root)) throw new Error(`fixture count ${countNodes(root)} != ${total}`); }
  while (countNodes(root) < total) { root.children.push(file(`채움-${sequence + 1}.txt`)); sequence += 1; }
  if (countNodes(root) !== total) throw new Error(`fixture count ${countNodes(root)} != ${total}`);
  if (attachmentIds.text) findByName(root, '샘플-텍스트.txt').data.attachmentId = attachmentIds.text;
  if (attachmentIds.image) findByName(root, '샘플-이미지.png').data.attachmentId = attachmentIds.image;
  if (attachmentIds.pdf) findByName(root, '샘플-PDF.pdf').data.attachmentId = attachmentIds.pdf;
  if (attachmentIds.empty) findByName(root, '빈-파일.txt').data.attachmentId = attachmentIds.empty;
  return root;
}
function removeGeneratedFile(node) { for (let i = (node.children || []).length - 1; i >= 0; i -= 1) { const child = node.children[i]; if (child.kind === 'file' && !child.data?.attachmentId && !child.name.startsWith('샘플') && !child.name.startsWith('한글') && !child.name.startsWith('very-long')) { node.children.splice(i, 1); return true; } if (removeGeneratedFile(child)) return true; } return false; }
export function countNodes(node) { return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0); }
export function findByName(node, name) { if (node.name === name) return node; for (const child of node.children || []) { const found = findByName(child, name); if (found) return found; } return null; }




