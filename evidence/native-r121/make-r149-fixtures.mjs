import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodeBackup } from '../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../src/engine/hypertree/editor/attachments.js';
import { classifyAttachment } from '../../src/engine/hypertree/editor/attachment-classification.js';
const outDir = new URL('../../evidence/native-r121/r149-fixtures/', import.meta.url); mkdirSync(outDir, { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const specs = [
  { name: 'report.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n') },
  { name: 'notes.md', mime: 'text/markdown', bytes: Buffer.from('# Field Notes\n\n한글 문서입니다.\n\n- one\n- two\n') },
  { name: 'plain.txt', mime: 'text/plain', bytes: Buffer.from('Plain text preview\n한글 줄\n') },
  { name: 'pixel.png', mime: 'image/png', bytes: png }
];
const registry = createAttachmentRegistry({ datasetToken: 900 }); const attachmentMeta = new Map();
for (const spec of specs) { const file = new File([spec.bytes], spec.name, { type: spec.mime }); const classification = classifyAttachment({ name: spec.name, mime: spec.mime, prefix: new Uint8Array(spec.bytes.slice(0, 1024)) }); const staged = registry.stage(file, classification); if (!staged.ok) throw new Error(JSON.stringify(staged)); registry.commit(staged.id); attachmentMeta.set(spec.name, { attachmentId: staged.id, originalName: spec.name, sizeBytes: file.size, mime: spec.mime, classification: staged.metadata.classification, sha256: createHash('sha256').update(spec.bytes).digest('hex') }); }
function fileData(name, description, attach = null) { const data = { dataType: 'file', description }; if (attach) Object.assign(data, { attachmentId: attach.attachmentId, originalName: attach.originalName, sizeBytes: attach.sizeBytes, mime: attach.mime, classification: attach.classification }); return data; }
const root = { id: 'n0', name: 'R149 300 Node Map', kind: 'folder', data: { description: 'Synthetic 300-node lifecycle fixture.' }, children: [] };
const wide = { id: 'wide', name: 'Wide', kind: 'folder', data: { description: 'Wide folder with 58 files.' }, children: [] }; root.children.push(wide);
for (let i = 0; i < 58; i += 1) { const name = i === 0 ? 'report.pdf' : i === 1 ? 'notes.md' : i === 2 ? 'pixel.png' : i === 3 ? 'plain.txt' : `wide-${String(i).padStart(3, '0')}.txt`; const attach = attachmentMeta.get(name) || null; wide.children.push({ id: `w${String(i).padStart(3, '0')}`, name, kind: 'file', data: fileData(name, `Wide file ${i}${i === 57 ? ' — observable marker' : ''}`, attach) }); }
let cursor = { id: 'deep01', name: 'Deep 01', kind: 'folder', data: { description: 'Nested chain level 1.' }, children: [] }; root.children.push(cursor);
for (let d = 2; d <= 12; d += 1) { const folder = { id: `deep${String(d).padStart(2, '0')}`, name: `Deep ${String(d).padStart(2, '0')}`, kind: 'folder', data: { description: `Nested chain level ${d}.` }, children: [] }; cursor.children.push(folder); cursor = folder; }
for (let i = 0; i < 8; i += 1) { const name = `deep-${String(i).padStart(3, '0')}.txt`; cursor.children.push({ id: `d${String(i).padStart(3, '0')}`, name, kind: 'file', data: fileData(name, i === 7 ? 'Star 299 hidden deep marker' : `Deep file ${i} at level 12`) }); }
for (let b = 0; b < 4; b += 1) { const branch = { id: `b${b}`, name: `Branch ${b}`, kind: 'folder', data: { description: `Balanced branch ${b}.` }, children: [] }; root.children.push(branch); for (let s = 0; s < 5; s += 1) { const sub = { id: `b${b}s${s}`, name: `Sub ${b}-${s}`, kind: 'folder', data: { description: `Subfolder ${b}-${s}.` }, children: [] }; branch.children.push(sub); for (let f = 0; f < 7; f += 1) { const name = `file-${b}-${s}-${f}.txt`; sub.children.push({ id: `b${b}s${s}f${f}`, name, kind: 'file', data: fileData(name, `Balanced file ${b}-${s}-${f}`) }); } } for (let e = 0; e < 14; e += 1) { const name = `extra-${b}-${e}.txt`; branch.children.push({ id: `b${b}e${String(e).padStart(2, '0')}`, name, kind: 'file', data: fileData(name, `Branch extra ${b}-${e}`) }); } }
let count = 0; const walk = (n) => { count += 1; for (const c of n.children || []) walk(c); }; walk(root); if (count !== 300) throw new Error(`count ${count}`);
const encoded = await encodeBackup({ tree: root, registry, mapName: 'R149 300 Node Map', sourceMapId: 'r149-source', cryptoApi: globalThis.crypto });
writeFileSync(new URL('./r149-300.orbit', outDir), Buffer.from(await encoded.blob.arrayBuffer()));
const manifest = { mapName: 'R149 300 Node Map', nodeCount: count, orbitBytes: encoded.blob.size, attachments: specs.map((s) => ({ name: s.name, size: s.bytes.length, sha256: createHash('sha256').update(s.bytes).digest('hex') })), treeIds: { wide: 'wide', deepest: 'deep12', hidden: 'd007', marker: 'w057' }, treeSummary: { rootId: root.id, wideFiles: wide.children.length, deepLevels: 12, deepFiles: 8, branchFiles: 28 * 5, branchExtras: 56 } };
writeFileSync(new URL('./r149-300-manifest.json', outDir), JSON.stringify(manifest, null, 2)); console.log(JSON.stringify(manifest, null, 2));
