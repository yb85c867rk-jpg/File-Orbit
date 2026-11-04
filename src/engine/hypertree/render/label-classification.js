import { GraphRenderError } from './errors.js';

export const ICON_KEYS = Object.freeze([
  'folder',
  'pdf',
  'text',
  'markdown',
  'image',
  'archive',
  'link',
  'generic'
]);

export const FILE_HINTS = Object.freeze(['pdf', 'text', 'markdown', 'image', 'archive', 'link', 'generic']);

export const EXTENSIONS = Object.freeze({
  pdf: ['pdf'],
  text: ['txt', 'text', 'log', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml'],
  markdown: ['md', 'markdown', 'mdown', 'mkd'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tif', 'tiff'],
  archive: ['zip', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', '7z', 'rar']
});

const EXTENSION_TO_ICON = (() => {
  const map = new Map();
  for (const [icon, extensions] of Object.entries(EXTENSIONS)) {
    for (const extension of extensions) map.set(extension, icon);
  }
  return map;
})();

/**
 * Presentation-only classification. It does not establish MIME type or
 * authorize opening/reading a file.
 *
 * Precedence for files: explicit supported `typeHint`, then final extension,
 * then `generic`. Folders are always `folder`; a folder hint is ignored.
 *
 * @param {{kind:'folder'|'file', name:string, typeHint?:string}} input
 * @returns {'folder'|'pdf'|'text'|'markdown'|'image'|'archive'|'generic'}
 */
export function classifyLabel(input) {
  if (!input || (input.kind !== 'folder' && input.kind !== 'file')) {
    throw new GraphRenderError('invalid-presentation', 'kind must be folder or file');
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new GraphRenderError('invalid-presentation', 'display name must be a non-empty string');
  }
  if (input.kind === 'folder') return 'folder';

  if (input.typeHint !== undefined) {
    if (typeof input.typeHint !== 'string' || !FILE_HINTS.includes(input.typeHint.toLowerCase())) {
      throw new GraphRenderError('invalid-presentation', 'unsupported file type hint');
    }
    return input.typeHint.toLowerCase();
  }

  const basename = input.name.split(/[\\/]/).at(-1);
  const extension = extensionOf(basename);
  return extension ? (EXTENSION_TO_ICON.get(extension) ?? 'generic') : 'generic';
}

/** Final lowercase extension without the dot; dotfiles/extensionless => ''. */
export function extensionOf(name) {
  if (typeof name !== 'string' || name.length === 0) return '';
  const base = name.split(/[\\/]/).at(-1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}
/**
 * Presentation-only icon/badge resolution. Stored attachment classification
 * takes precedence over the editable display-name extension.
 */
const ICON_COLORS = Object.freeze({ pdf: '#F87171', markdown: '#a5b4fc', text: '#94a3b8', image: '#7dd3c7', link: '#93c5fd', generic: '#94a3b8', folder: '#c7d2fe' });
export const EXPLORATION_LABEL_PALETTE = Object.freeze({ pdf: '#F87171', data: '#22C55E', neutralBadge: '#c3ccda' });
function typeLabelFor(icon, needsReview) {
  if (icon === 'folder') return 'Folder';
  if (icon === 'link') return 'Web link';
  if (icon === 'pdf') return 'PDF';
  if (icon === 'markdown') return 'Markdown';
  if (icon === 'text') return 'Text';
  if (icon === 'image') return 'Image';
  return needsReview ? 'Unknown' : 'File';
}
function presentationResult(icon, badge, needsReview, reason, palette = null) {
  const dataIcon = icon !== 'folder';
  const color = palette && dataIcon ? (icon === 'pdf' ? palette.pdf : palette.data) : (ICON_COLORS[icon] || ICON_COLORS.generic);
  const badgeColor = palette && dataIcon ? (icon === 'pdf' ? palette.pdf : palette.data) : (icon === 'pdf' ? ICON_COLORS.pdf : '#c3ccda');
  return Object.freeze({ icon, badge, needsReview, color, badgeColor, reason, typeLabel: typeLabelFor(icon, needsReview) });
}
export function classifyLabelPresentation(input, options = {}) {
  const palette = options.palette || null;
  const icon = classifyLabel(input);
  if (input?.dataType === 'web-link') return presentationResult('link', 'WEB', false, 'web-link', palette);
  const classification = input?.classification;
  if (input?.dataType === 'file' && classification && typeof classification === 'object') {
    const format = classification.format;
    const mime = typeof classification.mime === 'string' ? classification.mime.toLowerCase() : '';
    const imageMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
    const iconByFormat = { markdown: 'markdown', pdf: 'pdf', text: 'text', generic: imageMime ? 'image' : 'generic', unknown: 'generic' };
    const iconKey = iconByFormat[format] || 'generic';
    const badge = iconKey === 'image' ? 'IMG' : typeof classification.badge === 'string' && classification.badge.length > 0
      ? classification.badge.slice(0, 8)
      : format === 'generic' ? 'FILE' : '?';
    return presentationResult(iconKey, badge, Boolean(classification.needsReview), String(classification.reason || format), palette);
  }
  return presentationResult(icon, null, false, 'legacy-classifier', palette);
}








