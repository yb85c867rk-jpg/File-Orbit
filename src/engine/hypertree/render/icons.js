import { GraphRenderError } from './errors.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Fixed local icon geometry. Filenames never enter this mapping or markup.
const ICON_PATHS = Object.freeze({
  folder: 'M2 4h4l1.5 2H14v7H2z',
  pdf: 'M4 2h5l3 3v9H4zM9 2v3h3M5.5 10.5h5',
  text: 'M4 2h8v12H4zM6 5h4M6 8h4M6 11h3',
  markdown: 'M3 4h10v8H3zM5 10V6l1.5 2L8 6v4M10.5 6v4M9.5 9.5l1 1 1-1',
  image: 'M3 3h10v10H3zM3 11l3-3 2 2 2-2 3 3M6 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  archive: 'M4 2h8v12H4zM7 2v2M9 2v2M7 5v2M9 5v2M7 8v2M9 8v2M7 11h2',
  link: 'M6.5 9.5l3-3M5 11l-1 1a2.1 2.1 0 0 1-3-3l2-2a2.1 2.1 0 0 1 3 0M11 5l1-1a2.1 2.1 0 0 1 3 3l-2 2a2.1 2.1 0 0 1-3 0',
  generic: 'M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 11h4'
});

export function iconPath(key) {
  if (!ICON_PATHS[key]) throw new GraphRenderError('invalid-presentation', `unsupported icon ${key}`);
  return ICON_PATHS[key];
}

/** Build a fixed inline SVG using only the icon key. */
export function createIcon(doc, key) {
  if (!doc || typeof doc.createElementNS !== 'function') {
    throw new GraphRenderError('invalid-dom', 'ownerDocument with createElementNS is required');
  }
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', iconPath(key));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  return svg;
}


