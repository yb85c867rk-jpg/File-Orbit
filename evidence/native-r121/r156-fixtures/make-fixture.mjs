import { mkdirSync, writeFileSync } from 'node:fs';
import { encodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
const out = new URL('./', import.meta.url); mkdirSync(out, { recursive: true });
const file = (id, name, description) => ({ id, name, kind: 'file', data: { dataType: 'file', description } });
const folder = (id, name, children, description = '') => ({ id, name, kind: 'folder', data: { description }, children });
const unrelated = [];
for (let b = 0; b < 5; b += 1) {
  const children = Array.from({ length: 57 }, (_, i) => file(`u${b}-${String(i).padStart(3, '0')}`, `unrelated-${b + 1}-${String(i + 1).padStart(3, '0')}.txt`, `Unrelated branch ${b + 1}, file ${i + 1}.`));
  unrelated.push(folder(`unrelated-${b}`, `Branch ${b + 1}`, children, `Unrelated branch ${b + 1}.`));
}
const technicalChildren = Array.from({ length: 8 }, (_, i) => file(`technical-${String(i).padStart(2, '0')}`, `technical-${String(i + 1).padStart(2, '0')}.txt`, `Technical file ${i + 1}.`));
const technical = folder('technical', 'technical', technicalChildren, 'Technical folder with eight well-spaced files.');
const root = folder('root', 'Technical late 300', [...unrelated, technical], 'Root with unrelated branches first and technical last.');
const registry = createAttachmentRegistry({ datasetToken: 915 });
let count = 0; const walk = n => { count += 1; for (const c of n.children || []) walk(c); }; walk(root);
if (count !== 300) throw new Error(`count ${count}`);
const encoded = await encodeBackup({ tree: root, registry, mapName: 'Technical late 300', sourceMapId: 'technical-late-300', cryptoApi: globalThis.crypto });
const bytes = new Uint8Array(await encoded.blob.arrayBuffer()); writeFileSync(new URL('./technical-late-300.orbit', out), Buffer.from(bytes));
writeFileSync(new URL('./manifest.json', out), JSON.stringify({ name: 'technical-late-300.orbit', nodes: count, bytes: bytes.length, technicalChildren: technicalChildren.length, unrelatedNodes: 285 }, null, 2));
console.log(JSON.stringify({ nodes: count, bytes: bytes.length }));
