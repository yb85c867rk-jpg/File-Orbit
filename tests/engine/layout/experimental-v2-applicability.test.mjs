import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateClearanceApplicability } from '../../../src/engine/hypertree/layout/index.js';

const base = {
  calculationRadiusCss: 198.66,
  displayBaseRadiusCss: 198.66,
  workspaceScale: 11.5,
  selectedWorkspaceScale: 11.5,
  cameraZoom: 1,
  presentationKind: 'fixed',
  glyphRadiusCss: 6,
  evaluatedGlyphRadiusCss: 6,
  resized: false,
  focusChanged: false
};

test('current-scale clearance applicability is false after initial fit below 1', () => {
  const result = evaluateClearanceApplicability({ ...base, cameraZoom: 0.096 });
  assert.equal(result.applicable, false);
  assert.equal(result.reason, 'camera-zoom-below-evaluated-scale');
  assert.equal(result.factors.calculationRadiusCss, 198.66);
});

test('manual zoom-out is inapplicable and reset to evaluated scale is applicable', () => {
  assert.equal(evaluateClearanceApplicability({ ...base, cameraZoom: 0.8 }).applicable, false);
  assert.equal(evaluateClearanceApplicability({ ...base, cameraZoom: 1 }).applicable, true);
});

test('resize, focus, presentation, radius, and workspace mismatches invalidate applicability', () => {
  assert.equal(evaluateClearanceApplicability({ ...base, resized: true }).reason, 'resize-invalidated');
  assert.equal(evaluateClearanceApplicability({ ...base, focusChanged: true }).reason, 'focus-changed');
  assert.equal(evaluateClearanceApplicability({ ...base, presentationKind: 'native' }).reason, 'presentation-policy-mismatch');
  assert.equal(evaluateClearanceApplicability({ ...base, glyphRadiusCss: 8 }).reason, 'glyph-radius-mismatch');
  assert.equal(evaluateClearanceApplicability({ ...base, displayBaseRadiusCss: 200 }).reason, 'calculation-display-radius-mismatch');
  assert.equal(evaluateClearanceApplicability({ ...base, workspaceScale: 9.5 }).reason, 'workspace-scale-mismatch');
  assert.equal(evaluateClearanceApplicability({ ...base, cameraZoom: Number.NaN }).reason, 'invalid-applicability-input');
});

test('historical layout feasibility is not treated as current display proof', () => {
  const fit = evaluateClearanceApplicability({ ...base, cameraZoom: 0.0955 });
  assert.equal(fit.applicable, false);
  assert.match(fit.reason, /camera-zoom/);
  assert.equal(fit.factors.selectedWorkspaceScale, 11.5);
  assert.equal(fit.factors.cameraZoom, 0.0955);
});
