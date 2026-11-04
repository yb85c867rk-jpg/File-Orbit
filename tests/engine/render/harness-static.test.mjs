import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../../harness/m4-surface/main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../harness/m4-surface/index.html', import.meta.url), 'utf8');
const status = JSON.parse(readFileSync(new URL('../../harness/m4-surface/status.json', import.meta.url), 'utf8'));

test('harness resize uses the live surface instead of recreating it', () => {
  const resizeBlock = main.slice(main.indexOf('function resizeSurface()'), main.indexOf('function recreateSurface()'));
  assert.match(resizeBlock, /surface\.resize\(/);
  assert.equal(resizeBlock.includes('createCanvasSurface('), false);
  assert.match(main, /sourceEl\.addEventListener\('change', resizeSurface\)/);
  assert.match(main, /#resize'\)\.addEventListener\('click', resizeSurface\)/);
});

test('harness has independent create/recreate/destroy controls', () => {
  assert.match(main, /function createSurface\(/);
  assert.match(main, /function recreateSurface\(/);
  assert.match(main, /function destroySurface\(/);
  assert.match(main, /#recreate'\)\.addEventListener\('click', recreateSurface\)/);
  assert.match(main, /#destroy'\)\.addEventListener\('click', destroySurface\)/);
  assert.match(html, /id="recreate"/);
});

test('harness measures content area and uses projection for calibration marks', () => {
  const sizeBlock = main.slice(main.indexOf('function hostContentSize()'), main.indexOf('function drawableOrigin()'));
  assert.match(sizeBlock, /host\.clientWidth/);
  assert.match(sizeBlock, /parseFloat\(style\.paddingLeft\)/);
  assert.equal(sizeBlock.includes('getBoundingClientRect'), false);
  assert.match(main, /projection\.toCss\(/);
  assert.match(main, /projection\.fromCss\(/);
  assert.match(main, /projectionObservations/);
  assert.match(main, /canvasIdentityPreserved/);
});

test('harness documents translation-only client boundary and NOT_RUN browser state', () => {
  assert.match(main, /function drawableOrigin\(\)/);
  assert.match(main, /host\.clientLeft/);
  assert.match(main, /clientOrigin/);
  assert.equal(status.browserVerification, 'NOT_RUN');
  assert.match(status.coordinateBoundary, /translation-only/);
  assert.deepEqual(status.syntheticDprCases, [1, 1.25, 2, 3]);
});
