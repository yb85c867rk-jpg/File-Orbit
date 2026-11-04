/** Pure harness evidence: candidate transformation vs successfully displayed focus. */
export function focusCoordinateEvidence(candidateView, displayedView) {
  const describe = (view) => {
    if (!view || view.requestedId === null) return null;
    return {
      baseFocusPosition: view.baseFocusPosition
        ? { x: view.baseFocusPosition.x, y: view.baseFocusPosition.y }
        : null,
      focusedPosition: view.focusedPosition
        ? { x: view.focusedPosition.x, y: view.focusedPosition.y }
        : null,
      centerError: view.centerError
    };
  };
  return {
    candidate: describe(candidateView),
    displayed: describe(displayedView)
  };
}
