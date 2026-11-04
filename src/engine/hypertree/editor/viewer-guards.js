export function viewerBlocksInteraction(viewer) {
  return viewer?.isOpen === true;
}
export function canApplyViewerGuardedCamera({ viewer, navigatorBusy = false } = {}) {
  return !viewerBlocksInteraction(viewer) && navigatorBusy !== true;
}
