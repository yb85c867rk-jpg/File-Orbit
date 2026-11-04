import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('active LOD harnesses use blue search state and red PDF identification', () => {
  const stage1 = readFileSync(new URL('../../../analysis/stage2b1/index.html', import.meta.url), 'utf8');
  assert.match(stage1, /--search:#60A5FA/);
  assert.match(stage1, /\.node\.pdf \.label\{fill:#F87171\}/);
  assert.match(stage1, /\.pdf-badge\{fill:#F87171\}/);
  assert.doesNotMatch(stage1, /\.node\.search-target \.label\{fill:var\(--search\)/);

  const stage2 = readFileSync(new URL('../../../src/engine/hypertree/lod/render-adapter.js', import.meta.url), 'utf8');
  assert.match(stage2, /ctx\.strokeStyle = '#60A5FA'/);
  assert.doesNotMatch(stage2, /#E74C3C/);
  assert.doesNotMatch(stage2, /searchTargetId\)\) metrics\.labels.*style\.color/);
});


