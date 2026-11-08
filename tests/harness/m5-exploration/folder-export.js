import { buildWebLinkHtml, dataExportContentExtension, dataExportMime, sanitizeExportFilename, suggestedDataExportName, suggestedWebLinkName } from './node-export-content.js';

export const FOLDER_EXPORT_PLAN_SCHEMA = 'fileorbit-folder-export-plan-v1';

function pathKey(segments) {
  return segments.map((segment) => String(segment).normalize('NFC').toLocaleLowerCase('en-US')).join('/');
}
function relative(segments) { return segments.join('/'); }
function error(reason, message, extra = {}) { return { reason, message, ...extra }; }

/**
 * Pure, read-only preparation of one folder subtree. The caller supplies the
 * authoritative tree and attachment registry; this function never writes or
 * mutates either.
 */
export function prepareFolderExport({
  tree,
  folderId,
  attachmentRegistry,
  datasetToken = 0,
  revision = 0,
  ownership = null,
  documentHandle = null,
  session = null,
  documentIdentity = null
} = {}) {
  if (!tree || typeof tree !== 'object') return { ok: false, errors: [error('missing-tree', 'The map is not available.')] };
  if (typeof folderId !== 'string' || folderId.length === 0) return { ok: false, errors: [error('missing-folder', 'Choose a folder to export.')] };
  const directories = [];
  const files = [];
  const errors = [];
  let skippedDescriptionOnly = 0;

  const selected = (() => {
    const stack = [{ node: tree, path: [] }];
    while (stack.length) {
      const { node, path } = stack.pop();
      if (node.id === folderId) return { node, path };
      if (node.kind === 'folder') for (let index = (node.children || []).length - 1; index >= 0; index -= 1) stack.push({ node: node.children[index], path: [...path, node.children[index]] });
    }
    return null;
  })();
  if (!selected || selected.node.kind !== 'folder') return { ok: false, errors: [error('folder-not-found', 'That folder is no longer available.')] };

  function walk(node, parentSegments, mapPath) {
    const segment = sanitizeExportFilename(node.name, node.kind === 'folder' ? 'folder' : 'data');
    const segments = [...parentSegments, segment];
    const currentMapPath = [...mapPath, node.name];
    if (node.kind === 'folder') {
      directories.push({ nodeId: node.id, name: node.name, segments, relativePath: relative(segments), mapPath: currentMapPath.join(' / ') });
      for (const child of node.children || []) walk(child, segments, currentMapPath);
      return;
    }
    if (node.kind !== 'file') return;
    const data = node.data || {};
    if (typeof data.attachmentId === 'string' && data.attachmentId.length > 0) {
      const record = attachmentRegistry?.get?.(data.attachmentId);
      if (!record || !record.file) {
        errors.push(error('missing-attachment', `The attached file content for “${node.name}” is unavailable.`, { nodeId: node.id, mapPath: currentMapPath.join(' / ') }));
        return;
      }
      const filename = suggestedDataExportName({ name: node.name }, record);
      const fileSegments = [...segments.slice(0, -1), filename];
      files.push({
        kind: 'attachment', nodeId: node.id, name: node.name, filename,
        attachmentId: data.attachmentId, file: record.file, bytes: Number(record.file.size),
        mime: dataExportMime({ name: node.name }, record), segments: fileSegments,
        relativePath: relative(fileSegments), mapPath: currentMapPath.join(' / '), extension: dataExportContentExtension({ name: node.name }, record)
      });
      return;
    }
    if (data.dataType === 'web-link') {
      const html = buildWebLinkHtml({ name: node.name, link: data.link, description: data.description });
      if (!html.ok) {
        errors.push(error('invalid-link', html.message || 'The web link is invalid.', { nodeId: node.id, mapPath: currentMapPath.join(' / ') }));
        return;
      }
      const filename = suggestedWebLinkName({ name: node.name });
      const fileSegments = [...segments.slice(0, -1), filename];
      files.push({
        kind: 'web-link', nodeId: node.id, name: node.name, filename,
        link: html.value, html: html.html, htmlBytes: html.bytes, bytes: html.bytes.length, mime: 'text/html;charset=utf-8',
        segments: fileSegments, relativePath: relative(fileSegments), mapPath: currentMapPath.join(' / '), extension: 'html'
      });
      return;
    }
    skippedDescriptionOnly += 1;
  }

  walk(selected.node, [], []);
  const seen = new Map();
  const collisions = [];
  const claim = (entry, type) => {
    const key = pathKey(entry.segments);
    const previous = seen.get(key);
    if (previous) {
      collisions.push({
        reason: 'filesystem-name-collision',
        key,
        first: { type: previous.type, relativePath: previous.entry.relativePath, mapPath: previous.entry.mapPath },
        second: { type, relativePath: entry.relativePath, mapPath: entry.mapPath },
        message: `Filesystem paths collide: “${previous.entry.relativePath}” and “${entry.relativePath}”. Rename the map items before retrying.`
      });
    } else seen.set(key, { type, entry });
  };
  for (const directory of directories) claim(directory, 'directory');
  for (const file of files) claim(file, 'file');
  errors.push(...collisions);

  const attachments = files.filter((file) => file.kind === 'attachment').length;
  const webLinks = files.filter((file) => file.kind === 'web-link').length;
  const totalBytes = files.reduce((sum, file) => sum + Number(file.bytes || 0), 0);
  return {
    schema: FOLDER_EXPORT_PLAN_SCHEMA,
    ok: errors.length === 0,
    datasetToken, revision, ownership, documentHandle, session, documentIdentity,
    selectedFolder: { id: selected.node.id, name: selected.node.name },
    outputFolderName: sanitizeExportFilename(selected.node.name, 'export'),
    directories,
    files,
    skippedDescriptionOnly,
    totals: { directories: directories.length, attachments, webLinks, skipped: skippedDescriptionOnly, totalBytes },
    errors
  };
}
