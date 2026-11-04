/**
 * Guard experimental layout clearance applicability to the current display.
 * Historical layout capacity is not the same as current pixel clearance.
 */
export function evaluateClearanceApplicability(input = {}) {
  const calculationRadius = input.calculationRadiusCss;
  const displayBaseRadius = input.displayBaseRadiusCss;
  const workspaceScale = input.workspaceScale;
  const selectedWorkspaceScale = input.selectedWorkspaceScale;
  const cameraZoom = input.cameraZoom;
  const presentationKind = input.presentationKind;
  const glyphRadius = input.glyphRadiusCss;
  const evaluatedGlyphRadius = input.evaluatedGlyphRadiusCss === undefined
    ? 6 : input.evaluatedGlyphRadiusCss;
  const factors = {
    calculationRadiusCss: calculationRadius,
    displayBaseRadiusCss: displayBaseRadius,
    workspaceScale,
    selectedWorkspaceScale,
    cameraZoom,
    presentationKind,
    glyphRadiusCss: glyphRadius,
    evaluatedGlyphRadiusCss: evaluatedGlyphRadius,
    resized: Boolean(input.resized),
    focusChanged: Boolean(input.focusChanged)
  };
  const invalid = !positive(calculationRadius)
    || !positive(displayBaseRadius)
    || !positive(workspaceScale)
    || !positive(selectedWorkspaceScale)
    || !positive(cameraZoom)
    || !positive(glyphRadius)
    || !positive(evaluatedGlyphRadius);
  if (invalid) return { applicable: false, reason: 'invalid-applicability-input', factors };
  if (Math.abs(calculationRadius - displayBaseRadius) > 1e-9) {
    return { applicable: false, reason: 'calculation-display-radius-mismatch', factors };
  }
  if (Math.abs(workspaceScale - selectedWorkspaceScale) > 1e-9) {
    return { applicable: false, reason: 'workspace-scale-mismatch', factors };
  }
  if (factors.resized) return { applicable: false, reason: 'resize-invalidated', factors };
  if (factors.focusChanged) return { applicable: false, reason: 'focus-changed', factors };
  if (presentationKind !== 'fixed') {
    return { applicable: false, reason: 'presentation-policy-mismatch', factors };
  }
  if (Math.abs(glyphRadius - evaluatedGlyphRadius) > 1e-9) {
    return { applicable: false, reason: 'glyph-radius-mismatch', factors };
  }
  if (cameraZoom < 1 - 1e-12) {
    return { applicable: false, reason: 'camera-zoom-below-evaluated-scale', factors };
  }
  return { applicable: true, reason: 'matches-evaluated-fixed-glyph-scale', factors };
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
