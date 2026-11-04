import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { encodeBackup } from '../../src/engine/hypertree/persistence/backup.js';
import { createAttachmentRegistry } from '../../src/engine/hypertree/editor/attachments.js';

const root = resolve('evidence/native-r121/FileOrbit-Native-Acceptance');
const parent = join(root, 'Orbit Parent');
const existing = join(parent, 'Existing Orbit');
const standaloneDir = join(root, 'Standalone');
await mkdir(existing, { recursive: true });
await mkdir(standaloneDir, { recursive: true });

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const text = (value) => new TextEncoder().encode(value);

async function packageFor({ rootId, rootName, fileName, bytes, mime, format, badge }) {
  const fileBlob = new Blob([bytes], { type: mime });
  const classification = { format, badge, needsReview: false };
  const registry = createAttachmentRegistry({ datasetToken: 1 });
  const attachmentId = rootId + '-att';
  const adopted = registry.adopt({ attachmentId, file: fileBlob, metadata: { attachmentId, originalName: fileName, sizeBytes: bytes.length, mime, classification } });
  if (!adopted.ok) throw new Error(adopted.message);
  registry.commit(attachmentId);
  const tree = { id: rootId, kind: 'folder', name: rootName, children: [{ id: rootId + '-file', kind: 'file', name: fileName, data: { description: null, link: null, dataType: 'file', attachmentId, originalName: fileName, sizeBytes: bytes.length, mime, classification } }] };
  const encoded = await encodeBackup({ tree, registry, mapName: rootName });
  const out = new Uint8Array(await encoded.blob.arrayBuffer());
  registry.clear();
  return { bytes: out, tree, attachment: { attachmentId, fileName, mime, bytes: Array.from(bytes), sha256: sha(bytes) } };
}

const pdf = text('%PDF-1.4\n% FileOrbit native acceptance PDF\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const yaml = text('title: Native Acceptance\nitems:\n  - orbit\n  - exact-bytes\n');
const standalonePdf = text('%PDF-1.4\n% standalone native acceptance\n%%EOF\n');

const populated = await packageFor({ rootId: 'native-populated', rootName: 'Native Populated', fileName: 'brief.pdf', bytes: pdf, mime: 'application/pdf', format: 'pdf', badge: 'PDF' });
const standalone = await packageFor({ rootId: 'native-standalone', rootName: 'Native Standalone', fileName: 'standalone.pdf', bytes: standalonePdf, mime: 'application/pdf', format: 'pdf', badge: 'PDF' });
const changed = await packageFor({ rootId: 'native-populated', rootName: 'Native Populated', fileName: 'brief.pdf', bytes: text('%PDF-1.4\n% externally changed\n%%EOF\n'), mime: 'application/pdf', format: 'pdf', badge: 'PDF' });
// Populated package needs two attachments; rebuild manually with PDF + YAML.
const registry2 = createAttachmentRegistry({ datasetToken: 2 });
const classificationPdf = { format: 'pdf', badge: 'PDF', needsReview: false };
const classificationYaml = { format: 'yaml', badge: 'YAML', needsReview: false };
for (const item of [
  { id: 'native-populated-pdf', name: 'brief.pdf', bytes: pdf, mime: 'application/pdf', classification: classificationPdf },
  { id: 'native-populated-yaml', name: 'notes.yaml', bytes: yaml, mime: 'application/yaml', classification: classificationYaml }
]) {
  const adopted = registry2.adopt({ attachmentId: item.id, file: new Blob([item.bytes], { type: item.mime }), metadata: { attachmentId: item.id, originalName: item.name, sizeBytes: item.bytes.length, mime: item.mime, classification: item.classification } });
  if (!adopted.ok) throw new Error(adopted.message);
  registry2.commit(item.id);
}
const populatedTree = { id: 'native-populated', kind: 'folder', name: 'Native Populated', children: [
  { id: 'native-populated-pdf-file', kind: 'file', name: 'brief.pdf', data: { description: null, link: null, dataType: 'file', attachmentId: 'native-populated-pdf', originalName: 'brief.pdf', sizeBytes: pdf.length, mime: 'application/pdf', classification: classificationPdf } },
  { id: 'native-populated-yaml-file', kind: 'file', name: 'notes.yaml', data: { description: null, link: null, dataType: 'file', attachmentId: 'native-populated-yaml', originalName: 'notes.yaml', sizeBytes: yaml.length, mime: 'application/yaml', classification: classificationYaml } }
] };
const populatedEncoded = await encodeBackup({ tree: populatedTree, registry: registry2, mapName: 'Native Populated' });
const populatedBytes = new Uint8Array(await populatedEncoded.blob.arrayBuffer());
registry2.clear();

const files = {
  'Orbit Parent/Existing Orbit/populated.map': populatedBytes,
  'Orbit Parent/Existing Orbit/zero.map': new Uint8Array(),
  'Orbit Parent/Existing Orbit/invalid.map': text('THIS IS NOT A FILEORBIT PACKAGE\n'),
  'Orbit Parent/Existing Orbit/notes.txt': text('unrelated top-level document\n'),
  'Standalone/standalone.map': standalone.bytes,
  'Standalone/legacy.fileorbit': standalone.bytes,
  'Standalone/external-changed.map': changed.bytes
};
for (const [relative, bytes] of Object.entries(files)) {
  const target = join(root, relative);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, bytes);
}
await writeFile(join(root, 'README.txt'), 'Disposable FileOrbit native acceptance workspace. Safe to inspect; do not treat as user data.\n', 'utf8');

const fixtures = {
  preparedAt: new Date().toISOString(),
  root,
  paths: {
    parent,
    existingOrbit: existing,
    standaloneDir,
    populated: join(existing, 'populated.map'),
    zero: join(existing, 'zero.map'),
    invalid: join(existing, 'invalid.map'),
    standalone: join(standaloneDir, 'standalone.map'),
    legacy: join(standaloneDir, 'legacy.fileorbit'),
    externalChanged: join(standaloneDir, 'external-changed.map')
  },
  tree: populatedTree,
  populated: { bytes: populatedBytes.length, sha256: sha(populatedBytes), treeId: 'native-populated', attachments: [
    { name: 'brief.pdf', bytes: pdf.length, sha256: sha(pdf) },
    { name: 'notes.yaml', bytes: yaml.length, sha256: sha(yaml) }
  ] },
  standalone: { bytes: standalone.bytes.length, sha256: sha(standalone.bytes), treeId: 'native-standalone', attachments: [{ name: 'standalone.pdf', bytes: standalonePdf.length, sha256: sha(standalonePdf) }] },
  changed: { bytes: changed.bytes.length, sha256: sha(changed.bytes) },
  files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha(bytes) }])),
  zero: { bytes: 0, sha256: sha(new Uint8Array()) },
  invalid: { bytes: files['Orbit Parent/Existing Orbit/invalid.map'].length, sha256: sha(files['Orbit Parent/Existing Orbit/invalid.map']) }
};
await writeFile(join(root, 'fixtures.json'), JSON.stringify(fixtures, null, 2), 'utf8');
console.log(JSON.stringify(fixtures, null, 2));

