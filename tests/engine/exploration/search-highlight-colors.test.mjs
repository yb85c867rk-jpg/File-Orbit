import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_HIGHLIGHT_COLOR, SEARCH_HIGHLIGHT_EDGE_OPACITY, searchHighlightToken, highlightSearchFolderScene } from '../../../src/engine/hypertree/exploration/search-highlight.js';

test('search style uses blue path edges at 55% and preserves non-folder fill', () => {
  assert.equal(SEARCH_HIGHLIGHT_COLOR, '#60A5FA');
  assert.equal(SEARCH_HIGHLIGHT_EDGE_OPACITY, 0.55);
  assert.equal(searchHighlightToken('dark').edge, '#60A5FA');
  assert.equal(searchHighlightToken('light').edgeOpacity, 0.55);
  const scene = {
    nodes: new Map([
      ['root', { kind: 'folder', fill: '#111111', stroke: '#222222' }],
      ['sub', { kind: 'folder', fill: '#333333', stroke: '#444444' }],
      ['pdf', { kind: 'file', fill: '#F87171', stroke: '#F87171' }]
    ]),
    edges: [
      { fromId: 'root', toId: 'sub', stroke: '#555555', opacity: 1 },
      { fromId: 'sub', toId: 'pdf', stroke: '#555555', opacity: 1 }
    ]
  };
  const highlighted = highlightSearchFolderScene(scene, new Set(['root', 'sub']), 'dark');
  assert.equal(highlighted.nodes.get('root').stroke, '#60A5FA');
  assert.equal(highlighted.nodes.get('root').fill, '#111111');
  assert.equal(highlighted.nodes.get('sub').stroke, '#60A5FA');
  assert.equal(highlighted.nodes.get('pdf').fill, '#F87171');
  assert.equal(highlighted.nodes.get('pdf').stroke, '#F87171');
  assert.equal(highlighted.edges[0].stroke, '#60A5FA');
  assert.equal(highlighted.edges[0].opacity, 0.55);
  assert.equal(highlighted.edges[1].stroke, '#555555');
  assert.equal(highlighted.edges[1].opacity, 1);
  assert.notEqual(highlighted, scene);
});
