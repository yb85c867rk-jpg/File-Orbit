import { mkdirSync, writeFileSync } from 'node:fs';
import { encodeBackup } from '../../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../../src/engine/hypertree/editor/attachments.js';
const out = new URL('./', import.meta.url); mkdirSync(out, { recursive: true });
function file(id, name, description) { return { id, name, kind: 'file', data: { dataType: 'file', description } }; }
function folder(id, name, children, description = '') { return { id, name, kind: 'folder', data: { description }, children }; }
const flatRoot = folder('root', 'Flat 300', Array.from({ length: 299 }, (_, i) => file(`f${String(i).padStart(3, '0')}`, `file-${String(i + 1).padStart(3, '0')}.txt`, `Flat file ${i + 1}${i === 17 ? ' root proximity marker' : ''}`)), 'Flat root with 299 direct children.');
const distributedChildren = [];
const groups = [['north', 'North', 59], ['south', 'South', 59], ['east', 'East', 59], ['west', 'West', 59], ['center', 'Center', 58]];
for (const [prefix, label, count] of groups) {
  const children = Array.from({ length: count }, (_, i) => file(`${prefix}${String(i).padStart(3, '0')}`, `${prefix}-${String(i + 1).padStart(3, '0')}.txt`, `${label} distributed file ${i + 1}`));
  distributedChildren.push(folder(prefix, label, children, `${label} folder with ${count} files.`));
}
const distributedRoot = folder('root', 'Distributed 300', distributedChildren, 'Root with five distributed folders.');
const registry = createAttachmentRegistry({ datasetToken: 810 });
async function write(tree, name) {
  let count = 0; const walk = (n) => { count += 1; for (const c of n.children || []) walk(c); }; walk(tree);
  if (count > 300) throw new Error(`${name} count ${count}`);
  const encoded = await encodeBackup({ tree, registry, mapName: name, sourceMapId: name, cryptoApi: globalThis.crypto });
  const path = new URL(`./${name}.orbit`, out);
  writeFileSync(path, Buffer.from(await encoded.blob.arrayBuffer()));
  return { name, nodeCount: count, bytes: encoded.blob.size };
}
const result = [await write(flatRoot, 'flat-300'), await write(distributedRoot, 'distributed-300')];
writeFileSync(new URL('./manifest.json', out), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
