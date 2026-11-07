import { createDownloadResourceManager } from './backup-resources.js';
import { encodeBackup, decodeBackup, safeBackupFilename, safeDocumentFilename } from '../../../src/engine/hypertree/persistence/backup.js';
import { createDocumentAdapter } from './document-adapter.js';
import { createOrbitDirectoryAdapter } from './orbit-directory-adapter.js';
import { createOrbitStateController } from './orbit-state.js';
import { createOrbitPanel } from './orbit-panel.js';
import { createMapLibrarySettings } from './map-library-settings.js';
import { createLibraryCollectionController } from './library-collection-controller.js';
import { createOrbitFolderBrowserDialog } from './orbit-folder-browser.js';
import { orbitNameKey } from '../../../src/engine/hypertree/orbit/names.js';
import { MAX_ORBIT_BASELINE_BYTES, createOpenedContentBaseline, bindBaseline, verifyOpenedContentBaseline, createConfirmedWriteBaseline, preflightOverwrite, createOverwriteApproval } from './orbit-file-baseline.js';
import { createFileConflictDialog } from './file-conflict-dialog.js';
import { loadTree } from '../../../src/engine/hypertree/data/index.js';
import { stageExperimentalV2Layout, refineExperimentalV2Layout } from '../../../src/engine/hypertree/layout/index.js';
import { collectSubtreeIds, fitBlockReason, buildReparentCandidate, isNodeGestureOwned, performReparentInstallation, recoverAuthoritativeSession, createExplorationModel, createExplorationNavigator, createExplorationSession, createNodeDragGesture, EXPLORATION_TRANSITION_DURATION_MS, explorationLabelPriorityIds, folderContextLabelPriorityIds, handleExplorationCanvasClick, stageExplorationFrame } from '../../../src/engine/hypertree/exploration/index.js';
import { createCanvasSurface, createLabelOverlay, drawGraphScene, EXPLORATION_LABEL_PALETTE } from '../../../src/engine/hypertree/render/index.js';
import { createEditorController } from '../../../src/engine/hypertree/editor/controller.js';
import { createEditorHistory } from '../../../src/engine/hypertree/editor/history.js';
import { FREE_POLICY_CONTEXT, createInternalPolicyContext, evaluateContextNodeAccess } from '../../../src/engine/hypertree/edition/index.js';
import { createLargeMapPresentation } from './large-map-presentation.mjs';
import { performMetadataHistoryReplay } from '../../../src/engine/hypertree/editor/history-replay.js';
import { makeReparentHistoryEntry } from '../../../src/engine/hypertree/editor/history-commands.js';
import { resolvePostOperationDetails } from '../../../src/engine/hypertree/editor/details-policy.js';
import { createActionButtonsController, createPopupMenu, createThemeController, createFullscreenController, createHistoryToolbarController, createTooltipController, createInteractionOwnership, resolveFocusFallback, themedCanvasScene } from './shell-controls.js';
import { createAttachmentViewer } from '../../../src/engine/hypertree/editor/attachment-viewer.js';
import { browserRequestIsCurrent } from './browser-request.js';
import { viewerBlocksInteraction, canApplyViewerGuardedCamera } from '../../../src/engine/hypertree/editor/viewer-guards.js';
import { finalizeTransitionNavigation } from '../../../src/engine/hypertree/exploration/navigation-cleanup.js';
import { performViewportResizeAction } from '../../../src/engine/hypertree/exploration/resize-action.js';
import { performEditorCommandInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { EDITOR_MAX_NODES, createEditorIdAllocator, nodeDescription } from '../../../src/engine/hypertree/editor/validation.js';
import { createAttachmentRegistry, sweepAttachmentOwnership } from '../../../src/engine/hypertree/editor/attachments.js';
import { performRenameInstallation, performAddChildInstallation, performMetadataInstallation, performEditFolderInstallation, performEditDataInstallation, performDeleteInstallation } from '../../../src/engine/hypertree/editor/action.js';
import { createSelectionIntent, validateSelectionIntent } from '../../../src/engine/hypertree/editor/intent.js';
import { attachEditorContextMenu } from '../../../src/engine/hypertree/editor/context-menu.js';
import { attachLabelContextMenu as attachLabelContextMenuPath } from '../../../src/engine/hypertree/editor/label-context-menu.js';
import { attachLabelSelection } from '../../../src/engine/hypertree/editor/label-selection.js';
import { createDropFeedback } from '../../../src/engine/hypertree/exploration/drop-feedback.js';
import { createPointerUpDropHandler } from '../../../src/engine/hypertree/exploration/drop-controller.js';
import { diagnoseEditorTarget, editorActivationBlockReason, resolveEditorTarget } from '../../../src/engine/hypertree/editor/activation.js';
import { createEditorTarget, createEditorAction } from '../../../src/engine/hypertree/editor/target.js';
import { chooseEditorAction as chooseEditorActionFlow, openEditorMenu, resumeEditorAction } from '../../../src/engine/hypertree/editor/activation-flow.js';
import { createEditorPanel } from './editor-panel.js';
import { createDeleteConfirmation } from './delete-confirm.js';
import { createCreateMapDialog } from './create-map-dialog.js';
import { createSavedMapsDialog } from './saved-maps-dialog.js';
import { createPcRuntimeAccess } from '../../../src/app/pc/runtime-access.js';
import { activeDocument, activeMap, resetActiveDocument as resetDocumentOwnership, adoptActiveDocument, clearActiveMap, setActiveMap, documentIsDirty } from '../../../src/app/pc/document-ownership.js';
import { createUnsavedMapPrompt } from './unsaved-map-prompt.js';
import { createSaveConflictDialog } from './save-conflict-dialog.js';
import { buildSaveSnapshot, createAttachmentId, createPersistenceRepository, reconstructSavedMapRuntime, createRecoveryScheduler } from '../../../src/engine/hypertree/persistence/index.js';
import { createRecoveryDialog } from './recovery-dialog.js';
import { prepareCreateMapCandidate } from '../../../src/engine/hypertree/exploration/create-map.js';
import { collectDirectorySelection } from '../../../src/engine/hypertree/exploration/directory-selection.js';
import { installCandidateEnvironment } from '../../../src/engine/hypertree/exploration/reparent-action.js';
import { searchTree } from '../../../src/engine/hypertree/exploration/search.js';
import { highlightSearchFolderScene, searchHighlightToken } from '../../../src/engine/hypertree/exploration/search-highlight.js';
import { createSearchResultsView } from './search-results.js';
import { createEmbedDialog } from './embed-dialog.js';
import { createPermissionDialog } from './permission-dialog.js';
import { createLibraryEditDialog } from './library-edit-dialog.js';
import { validateSearchActivation, createSearchNavigationWaiter } from '../../../src/engine/hypertree/exploration/search-activation.js';
import { resolveDeleteTarget } from '../../../src/engine/hypertree/editor/delete-target.js';
import { dispatchEditorMenuAction, validateDeleteIntent } from '../../../src/engine/hypertree/editor/menu-dispatch.js';
import { createEditorMenuAdapter } from '../../../src/engine/hypertree/editor/editor-menu-adapter.js';
import { createEditorContextMenu } from './editor-context-menu.js';
import { clientToCanvasCss, hitTestNode } from '../../../src/engine/hypertree/interaction/index.js';
import { EXPERIMENTAL_CAMERA_LIMITS, createMouseNavigationController, resetCamera } from '../../../src/engine/hypertree/navigation/index.js';
import { f20, f200 } from '../../engine/layout/fixtures.mjs';

const UNSAVED_MESSAGE = 'Changes remain in this map but have not been saved.';
const ENCODING_FAILURE_MESSAGE = 'We couldn’t create the map file. Your changes are still in this map. Please try again.';
const ENCODING_FAILURE_BASE = 'We couldn’t create the map file. Please try again.';

const host = document.querySelector('#graph-host');
const graphWrap = document.querySelector('#graph-wrap');
const graphViewport = document.querySelector('#graph-viewport');
const graphActionToolbar = document.querySelector('#graph-action-toolbar');
const labelHost = document.querySelector('#label-host');
const detailsEl = document.querySelector('#details');
const detailsDescriptionEl = document.querySelector('#details-description');
const editorHost = document.querySelector('#editor-host');
const countsEl = document.querySelector('#counts');
const undoHistoryButton = document.querySelector('#undo-history');
const redoHistoryButton = document.querySelector('#redo-history');
const historyStatusEl = document.querySelector('#history-status');
const searchInput = document.querySelector('#search-reserved');
const searchResultsHost = document.querySelector('#search-results-host');
const searchToggle = document.querySelector('#search-toggle');
const searchPanel = document.querySelector('#search-panel');
const searchClose = document.querySelector('#search-close');
const detailsPanel = document.querySelector('#details-panel');
const detailsToggle = document.querySelector('#details-toggle');
const detailsToggleLabel = document.querySelector('#details-toggle-label');
const detailsContent = document.querySelector('#details-content');
const statusEl = document.querySelector('#status');
const fixtureEl = document.querySelector('#fixture');
const errorEl = document.querySelector('#error');
const appRoot = document.querySelector('#app-root');
const emptyState = document.querySelector('#empty-state');
const fitButton = document.querySelector('#fit');
const saveStateEl = document.querySelector('#save-state');
const documentNameEl = document.querySelector('#document-name');
const saveFeedbackEl = document.querySelector('#save-feedback');
const saveFeedbackTextEl = document.querySelector('#save-feedback-text');
const saveFeedbackRetry = document.querySelector('#save-feedback-retry');
const saveFeedbackSaveAs = document.querySelector('#save-feedback-save-as');
const feedbackHost = document.querySelector('#feedback-host');
let feedbackPositionObserver = null;
let saveFeedbackMessageTimer = null;
let saveFeedbackMessageDismissed = false;
const storageHelpButton = document.querySelector('#storage-help');
const storageHelpText = document.querySelector('#storage-help-text');
function positionFeedbackHost() {
  if (!feedbackHost) return;
  const viewportWidth = Number(globalThis.window?.innerWidth) || Number(document.documentElement?.clientWidth) || 0;
  const viewportHeight = Number(globalThis.window?.innerHeight) || Number(document.documentElement?.clientHeight) || 0;
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return;
  const rect = graphViewport?.getBoundingClientRect?.();
  const map = rect && rect.width > 0 && rect.height > 0
    ? { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    : { left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight };
  const width = Math.max(0, Math.min(560, map.width - 32, viewportWidth - 32));
  if (!(width > 0)) return;
  const center = Math.min(Math.max(map.left + map.width / 2, width / 2 + 12), viewportWidth - width / 2 - 12);
  feedbackHost.style.left = center + 'px';
  feedbackHost.style.width = width + 'px';
  feedbackHost.style.maxWidth = width + 'px';
  feedbackHost.style.bottom = Math.max(16, viewportHeight - map.bottom + 20) + 'px';
  feedbackHost.style.transform = 'translateX(-50%)';
  feedbackHost.style.right = 'auto';
}
positionFeedbackHost();
if (typeof ResizeObserver === 'function' && graphViewport) {
  try { feedbackPositionObserver = new ResizeObserver(positionFeedbackHost); feedbackPositionObserver.observe(graphViewport); } catch {}
}
globalThis.window?.addEventListener?.('resize', positionFeedbackHost);

const STORAGE_HELP = 'Save writes a .orbit document where your browser supports direct file writing. Some browsers save a new copy through download instead. FileOrbit keeps separate recovery/workspace data in IndexedDB; this is not your document. FileOrbit does not sync to the cloud and does not modify the original folders or files you imported.';
if (storageHelpText) storageHelpText.textContent = STORAGE_HELP;
if (storageHelpButton && storageHelpText) {
  storageHelpButton.addEventListener('click', () => {
    const open = storageHelpText.hidden;
    storageHelpText.hidden = !open;
    storageHelpButton.setAttribute('aria-expanded', String(open));
  });
}
const saveMapButtons = [...document.querySelectorAll('[data-action="save-map"]')];
const openMapButtons = [...document.querySelectorAll('[data-action="open-map"]')];
const overlayHost = document.querySelector('#overlay-host');
const embedDialog = createEmbedDialog({ document, host: overlayHost, fixtureUrl: './embed-host.html' });
const permissionDialog = createPermissionDialog({ document, host: overlayHost });
const libraryEditDialog = createLibraryEditDialog({ document, host: overlayHost, onChoose: () => chooseEditReplacementFolder(), onApply: (draft) => applyLibraryEdit(draft), onCancel: () => { libraryEditOriginalId = null; libraryEditToken += 1; if (!destroying) setInfoStatus('Linked folder change cancelled. The current Library connection and open map were preserved.', { ttl: 4000 }); } });
const shellStatusEl = document.querySelector('#shell-status');
const themeAction = document.querySelector('#theme-action');
const fullscreenAction = document.querySelector('#fullscreen-action');
const copyMapButton = document.querySelector('#copy-map');
let copyMapBusy = false;
const themeMobile = document.querySelector('#theme-mobile');
const navRail = document.querySelector('#nav-rail');
const navRailToggle = document.querySelector('#nav-rail-toggle');
const navRailToggleLabel = document.querySelector('#nav-rail-toggle-label');
const settingsAction = document.querySelector('#settings-action');
const settingsPanel = document.querySelector('#settings-panel');
const navRailTooltip = document.querySelector('#nav-rail-tooltip');
const openOrbitHelp = document.querySelector('#open-orbit-help');
const openOrbitHelpText = document.querySelector('#open-orbit-help-text');
const openOrbitAction = document.querySelector('#open-orbit-action');
const openOrbitMenu = document.querySelector('#open-orbit-menu');
if (openOrbitMenu && document.body && openOrbitMenu.parentElement !== document.body) document.body.appendChild(openOrbitMenu);
let openOrbitPopup = null;
const fullscreenGlyph = document.querySelector('#fullscreen-glyph');
const graphActionTooltip = document.querySelector('#graph-action-tooltip');
const mapMenuButton = document.querySelector('#map-menu-button');
const mapMenu = document.querySelector('#map-menu');
const moreMenuButton = document.querySelector('#more-menu-button');
const moreMenu = document.querySelector('#more-menu');
let activeTheme = 'dark';
const ROUTINE_NOTIFICATION_MS = 4000;
const TRANSIENT_NOTIFICATION_MS = 3000;
let shellStatusTimer = null;
let shellStatusToken = 0;
let shellStatusKind = 'none';
let shellStatusExpiryCallback = null;
let shellStatusPreviousExpiry = null;
let shellStatusScope = null;
let shellStatusTransient = false;
let openErrorStatusToken = null;
function clearOpenErrorStatus() {
  if (openErrorStatusToken === null || openErrorStatusToken !== shellStatusToken) return false;
  openErrorStatusToken = null;
  if (shellStatusTimer !== null) { clearTimeout(shellStatusTimer); shellStatusTimer = null; }
  shellStatusExpiryCallback = null; shellStatusPreviousExpiry = null;
  shellStatusToken += 1; shellStatusKind = 'none'; shellStatusScope = null; shellStatusTransient = false;
  if (shellStatusEl) { shellStatusEl.textContent = ''; shellStatusEl.dataset.feedbackKind = 'none'; shellStatusEl.hidden = true; }
  return true;
}
function setOpenErrorStatus(message, requestToken) {
  if (requestToken !== orbitDocumentOpenSeq) return false;
  if (!setShellStatus(message)) return false;
  openErrorStatusToken = shellStatusToken;
  return true;
}
let feedbackOperationSeq = 0;
const shellStatusScopeMatches = (scope) => Boolean(scope && shellStatusScope
  && scope.operation === shellStatusScope.operation
  && scope.ownership === shellStatusScope.ownership
  && scope.session === shellStatusScope.session
  && scope.dataset === shellStatusScope.dataset
  && scope.ownership === documentOwnershipSeq
  && scope.session === persistenceSessionSeq
  && scope.dataset === datasetToken);
const setShellStatus = (message, { kind = 'actionable', ttl = ROUTINE_NOTIFICATION_MS, scope = null, resolves = null, transient = false } = {}) => {
  const nextKind = kind === 'routine' ? 'routine' : kind === 'info' ? 'info' : kind === 'progress' ? 'progress' : 'actionable';
  if (nextKind === 'progress' && shellStatusKind === 'actionable') return false;
  const resolving = nextKind === 'routine' && resolves !== null;
  if (resolving && !shellStatusScopeMatches(resolves)) return false;
  if (nextKind === 'routine' && !resolving && (shellStatusKind === 'actionable' || shellStatusKind === 'progress')) return false;
  const token = ++shellStatusToken;
  if (shellStatusTimer !== null) { clearTimeout(shellStatusTimer); shellStatusTimer = null; }
  shellStatusPreviousExpiry = shellStatusExpiryCallback;
  shellStatusExpiryCallback = null;
  shellStatusKind = nextKind;
  if (shellStatusEl) shellStatusEl.dataset.feedbackKind = nextKind;
  shellStatusScope = (nextKind === 'routine' || nextKind === 'info') ? null : (scope || null);
  shellStatusTransient = Boolean(transient) || nextKind === 'routine' || nextKind === 'info';
  if (shellStatusEl) {
    if (shellStatusEl.textContent !== message) shellStatusEl.textContent = message;
    shellStatusEl.hidden = false;
  }
  if (shellStatusTransient && message) {
    const session = persistenceSessionSeq;
    const dataset = datasetToken;
    const ownership = documentOwnershipSeq;
    const timeout = (nextKind === 'routine' || nextKind === 'info') ? ttl : TRANSIENT_NOTIFICATION_MS;
    shellStatusExpiryCallback = () => {
      if (destroying || token !== shellStatusToken || !shellStatusTransient) return;
      if (session !== persistenceSessionSeq || dataset !== datasetToken || ownership !== documentOwnershipSeq) return;
      if (shellStatusEl) { shellStatusEl.textContent = ''; shellStatusEl.dataset.feedbackKind = 'none'; shellStatusEl.hidden = true; }
      shellStatusKind = 'none';
      shellStatusScope = null;
      shellStatusTransient = false;
      shellStatusTimer = null;
      shellStatusExpiryCallback = null;
    };
    shellStatusTimer = setTimeout(shellStatusExpiryCallback, timeout);
  }
  return true;
};
const setRoutineStatus = (message, options = {}) => setShellStatus(message, { ...options, kind: 'routine' });
const setInfoStatus = (message, options = {}) => setShellStatus(message, { ...options, kind: 'info' });
const showTransientStatus = (message) => setShellStatus(message, { kind: 'actionable', transient: true });
function clearTransientShellStatus() {
  if (!shellStatusTransient) return false;
  if (shellStatusTimer !== null) { clearTimeout(shellStatusTimer); shellStatusTimer = null; }
  shellStatusExpiryCallback = null;
  shellStatusPreviousExpiry = null;
  shellStatusToken += 1;
  shellStatusKind = 'none';
  shellStatusScope = null;
  shellStatusTransient = false;
  if (shellStatusEl) { shellStatusEl.textContent = ''; shellStatusEl.dataset.feedbackKind = 'none'; shellStatusEl.hidden = true; }
  return true;
}
const beginShellFeedback = (message, { kind = 'progress' } = {}) => {
  const scope = { operation: ++feedbackOperationSeq, ownership: documentOwnershipSeq, session: persistenceSessionSeq, dataset: datasetToken };
  return setShellStatus(message, { kind, scope }) ? scope : null;
};
const renewShellFeedbackScope = (scope) => {
  if (!scope || scope.ownership !== documentOwnershipSeq) return null;
  scope.session = persistenceSessionSeq;
  scope.dataset = datasetToken;
  return scope;
};
const resolveShellFeedback = (scope, message, options = {}) => {
  if (setRoutineStatus(message, { ...options, resolves: scope })) return true;
  if (shellStatusKind === 'actionable' || shellStatusKind === 'progress') return false;
  return setRoutineStatus(message, options);
};
const FULLSCREEN_ENTER_GLYPH = 'M7 3H3v4m10-4h4v4M7 17H3v-4m10 4h4v-4';
const FULLSCREEN_EXIT_GLYPH = 'M3 7h4V3m10 4h-4V3M3 13h4v4m10-4h-4v4';
const fullscreenController = createFullscreenController({ document, element: appRoot, button: fullscreenAction, onStatus: (message) => setShellStatus(message, { kind: 'routine' }), onState: ({ active }) => { fullscreenGlyph?.setAttribute('d', active ? FULLSCREEN_EXIT_GLYPH : FULLSCREEN_ENTER_GLYPH); fullscreenAction?.setAttribute('data-tooltip', active ? 'Exit fullscreen' : 'Enter fullscreen'); } });
const graphActionTooltipController = createTooltipController({ document, tooltip: graphActionTooltip, buttons: [...document.querySelectorAll('#graph-action-toolbar button')], view: globalThis.window });
const touchToolbar = Number(globalThis.window?.navigator?.maxTouchPoints) > 0;
let toolbarTitleObserver = null;
if (touchToolbar && graphActionToolbar) {
  const stripNativeTitles = () => { for (const button of graphActionToolbar.querySelectorAll('[title]')) button.removeAttribute('title'); };
  stripNativeTitles();
  if (typeof globalThis.MutationObserver === 'function') {
    toolbarTitleObserver = new globalThis.MutationObserver(stripNativeTitles);
    toolbarTitleObserver.observe(graphActionToolbar, { subtree: true, attributes: true, attributeFilter: ['title'] });
  }
}
const navRailTooltipController = navRailTooltip ? createTooltipController({ document, tooltip: navRailTooltip, buttons: [...document.querySelectorAll('#nav-rail button')], view: globalThis.window, enabled: () => navRail?.dataset.expanded !== 'true' }) : null;
const themeController = createThemeController({ document, button: themeAction, onChange: (theme) => { activeTheme = theme; if (themeMobile) { themeMobile.textContent = theme === 'dark' ? 'Theme: Light' : 'Theme: Dark'; themeMobile.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); } if (document.querySelector('#graph-host canvas')) refreshCanvasTheme(); } });

let sidebarTitleSync = false;
function normalizeSidebarTitles() {
  if (!navRail) return;
  const expanded = navRail.dataset.expanded === 'true';
  const controls = [...navRail.querySelectorAll('button')];
  for (const control of controls) {
    const current = control.getAttribute('title');
    if (expanded) {
      if (current) {
        control.dataset.sidebarTitle = current;
        if (!control.hasAttribute('aria-description')) {
          control.setAttribute('aria-description', current);
          control.dataset.sidebarDescription = 'added';
        }
        control.removeAttribute('title');
      }
    } else if (control.dataset.sidebarTitle) {
      if (current) control.dataset.sidebarTitle = current;
      else control.setAttribute('title', control.dataset.sidebarTitle);
      if (control.dataset.sidebarDescription === 'added') {
        control.removeAttribute('aria-description');
        delete control.dataset.sidebarDescription;
      }
    }
  }
}
function syncSidebarTooltips() {
  const collapsed = navRail?.dataset.expanded !== 'true';
  navRailTooltipController?.setEnabled?.(collapsed);
  if (!collapsed) navRailTooltipController?.hide?.();
  if (sidebarTitleSync) return;
  sidebarTitleSync = true;
  try { normalizeSidebarTitles(); } finally { sidebarTitleSync = false; }
}
if (navRail && typeof globalThis.MutationObserver === 'function') {
  const observer = new globalThis.MutationObserver(() => { if (!sidebarTitleSync) syncSidebarTooltips(); });
  observer.observe(navRail, { subtree: true, attributes: true, attributeFilter: ['title'] });
}
let openOrbitHelpVisible = false;
let openOrbitHelpPinned = false;
let openOrbitHelpSuppressed = false;
const openOrbitHelpWrapper = openOrbitHelp?.parentElement || openOrbitHelp?.parent || null;
function setOpenOrbitHelp(visible, pinned = false) {
  if (!openOrbitHelp || !openOrbitHelpText) return;
  const next = Boolean(visible) && navRail?.dataset.expanded === 'true';
  openOrbitHelpVisible = next;
  openOrbitHelpPinned = next ? Boolean(pinned) : false;
  openOrbitHelpText.hidden = !next;
  openOrbitHelp.setAttribute('aria-expanded', String(next));
}
function openOrbitHelpFromReveal() {
  if (openOrbitHelpSuppressed || navRail?.dataset.expanded !== 'true') return;
  setOpenOrbitHelp(true, openOrbitHelpPinned);
}
function activateOpenOrbitHelp() {
  if (!openOrbitHelpVisible || !openOrbitHelpPinned) {
    openOrbitHelpSuppressed = false;
    setOpenOrbitHelp(true, true);
  } else {
    setOpenOrbitHelp(false);
  }
}
function dismissOpenOrbitHelp({ escape = false } = {}) {
  setOpenOrbitHelp(false);
  openOrbitHelpPinned = false;
  openOrbitHelpSuppressed = escape;
}
function outsideOpenOrbitHelp(target) {
  if (!openOrbitHelpVisible || !openOrbitHelpWrapper) return;
  if (target && openOrbitHelpWrapper.contains(target)) return;
  dismissOpenOrbitHelp();
}
function setRailExpanded(expanded) {
  if (!navRail) return;
  openOrbitPopup?.close?.({ restoreFocus: false });
  const next = Boolean(expanded);
  navRail.dataset.expanded = String(next);
  navRailToggle?.setAttribute('aria-expanded', String(next));
  navRailToggle?.setAttribute('aria-label', next ? 'Collapse navigation' : 'Expand navigation');
  if (navRailToggle) navRailToggle.title = next ? 'Collapse navigation' : 'Expand navigation';
  if (navRailToggleLabel) navRailToggleLabel.textContent = next ? 'Collapse' : 'Expand';
  if (!next) { setOpenOrbitHelp(false); openOrbitHelpPinned = false; openOrbitHelpSuppressed = false; }
  orbitPanel?.setRailExpanded?.(next);
  syncSidebarTooltips();
  if (!next && settingsPanel && !settingsPanel.hidden) {
    settingsPanel.hidden = true;
    settingsAction?.setAttribute('aria-expanded', 'false');
  }
  scheduleViewportResize();
}
if (openOrbitHelp && openOrbitHelpText) {
  openOrbitHelp.addEventListener('click', () => { activateOpenOrbitHelp(); });
  openOrbitHelp.addEventListener('pointerenter', () => { openOrbitHelpFromReveal(); });
  openOrbitHelp.addEventListener('focus', () => { openOrbitHelpFromReveal(); });
  openOrbitHelp.addEventListener('blur', () => { dismissOpenOrbitHelp(); });
  openOrbitHelpWrapper?.addEventListener('pointerleave', () => {
    if (openOrbitHelpPinned || document.activeElement === openOrbitHelp) return;
    openOrbitHelpSuppressed = false;
    dismissOpenOrbitHelp();
  });
  openOrbitHelp.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismissOpenOrbitHelp({ escape: true });
    }
  });
  document.addEventListener('pointerdown', (event) => { outsideOpenOrbitHelp(event.target); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openOrbitHelpVisible) { event.preventDefault(); dismissOpenOrbitHelp({ escape: true }); }
  });
}

function setSettingsOpen(open) {
  if (!settingsPanel || !settingsAction) return;
  const next = Boolean(open);
  settingsPanel.hidden = !next;
  settingsAction.setAttribute('aria-expanded', String(next));
}
navRailToggle?.addEventListener('click', () => setRailExpanded(navRail?.dataset.expanded !== 'true'));
settingsAction?.addEventListener('click', () => {
  if (navRail?.dataset.expanded !== 'true') setRailExpanded(true);
  setSettingsOpen(settingsPanel?.hidden !== false);
});

let createMapDialog = null;
let createMapOperation = 0;
let pendingCreateCandidate = null;
let createMapInitializationError = null;
let createDraftDestinationMode = 'standalone';
let creationFolderSeq = 0;
function createSaveLocation() {
  const snapshot = orbitState.snapshot();
  const connected = Boolean(snapshot.handle && snapshot.phase !== 'blocked');
  return {
    connected,
    name: snapshot.name || 'Connected Orbit',
    mode: connected && createDraftDestinationMode === 'orbit' ? 'orbit' : 'standalone',
    supported: Boolean(orbitAdapter.supported)
  };
}
try {
  createMapDialog = createCreateMapDialog({
    document, host: overlayHost,
    onSelection: (selection) => prepareCreateMapSelection(selection),
    onNameChange: ({ mapName, description, selection }) => prepareCreateMapSelection({ mapName, description, files: selection.files, folders: selection.folders }),
    getFallbackFocus: () => resolveFocusFallback({ document, candidates: [...document.querySelectorAll('[data-action="create-map"]')], fallback: document.querySelector('#nav-rail-toggle') || document.body }),
    onCreate: (candidate) => installCreatedMap(candidate),
    hasCurrentMap: () => hasMap,
    getSaveLocation: createSaveLocation,
    onChooseFolder: () => chooseCreationFolderForDialog(),
    onSaveElsewhere: () => { createDraftDestinationMode = 'standalone'; createMapDialog?.refreshSaveLocation?.(); },
    onUseOrbit: () => {
      if (!createSaveLocation().connected) return { ok: false, message: 'No Orbit is connected.' };
      createDraftDestinationMode = 'orbit';
      createMapDialog?.refreshSaveLocation?.();
      return { ok: true };
    },
  onCancel: () => {
    creationFolderSeq += 1;
    createDraftDestinationMode = orbitState.snapshot().handle ? 'orbit' : 'standalone';
    if (creationTerminalHandled) return;
    creationTerminalHandled = true;
    createMapOperation += 1;
    releasePendingCreateCandidate();
    const terminal = creationTerminal;
    creationTerminal = null;
    if (terminal === 'commit' || terminal === 'discard') { ownership.releaseCreation(); publish(); return; }
    const restored = restoreSuspendedMap();
    ownership.releaseCreation();
    if (!restored && !ownership.recoveryFailed) ownership.markRecoveryFailure();
    if (terminal === 'failure') setShellStatus(lastCreateFailureMessage || lastCreationRestoreFailure || 'Create Map failed.');
    else if (!restored) setShellStatus(lastCreationRestoreFailure || 'The previous map could not be restored.');
    publish();
  }
  });
  createMapDialog.setDropEntryHandler(({ entries, mapName, selectionSeq }) => prepareCreateMapDrop({ entries, mapName, selectionSeq }));
} catch (error) {
  createMapInitializationError = error;
  for (const button of document.querySelectorAll('[data-action="create-map"]')) { button.dataset.available = 'false'; button.setAttribute('aria-disabled', 'true'); }
  setShellStatus(`Create Map failed to initialize: ${String(error?.message || error)}`);
}
let searchView = null;
let hasMap = false;
let creationSuspension = null;
let creationTerminal = null;
let lastCreateFailureMessage = null;
let creationTerminalHandled = false;
let lastCreationRestoreFailure = null;
let persistenceRepository = null;
let persistenceUnavailable = null;
let persistenceBlocked = false;
let persistenceBusy = null;
let persistenceSessionSeq = 0;
let documentAdapter = createDocumentAdapter({ window: globalThis.window, document: globalThis.document, BrowserURL: globalThis.URL });
let orbitAdapter = createOrbitDirectoryAdapter({ window: globalThis.window });
let orbitState = createOrbitStateController({ adapter: orbitAdapter });
let mapLibrarySettings = null;
try { mapLibrarySettings = createMapLibrarySettings({ indexedDB: globalThis.indexedDB }); } catch { mapLibrarySettings = null; }
let libraryCollection = null;
let libraryListOpen = false;
let libraryPendingName = null;
let libraryCollectionRefreshToken = 0;
try { libraryCollection = createLibraryCollectionController({ settings: mapLibrarySettings, canPersist: () => !mapLibraryStorageFailureForTest }); } catch { libraryCollection = null; }
let mapLibraryRestoreToken = 0;
let mapLibraryPermissionRequestCount = 0;
let mapLibraryPermissionOverride = null;
let mapLibraryStorageFailureForTest = false;
let mapLibraryRestoreDelayForTest = 0;
let savePermissionQueryOverride = null;
let mapLibraryReadQueryOverride = null;
let savePermissionRequestOverride = null;
let savePermissionRequestCount = 0;
let orbitPanel = null;
let orbitConflictDialog = null;
let fileOpenBrowser = null;
let browserOperation = null;
let browserPath = [];
let browserSnapshot = null;
let browserListingSeq = 0;
let orbitWorkspaceBusy = null;
let orbitCurrentEntryKey = null;
let orbitCurrentSeq = 0;
let orbitDocumentOpenSeq = 0;
let orbitDocumentSeq = 0;
let documentOperation = 0;
let documentOwnershipSeq = 0;
const documentSaveQueue = [];
let documentSaveQueueActive = false;
let automaticSavePending = null;
let automaticSaveToken = 0;
let automaticSaveBlocked = false;
let automaticSaveFailure = null;
let automaticSaveActionInFlight = false;
function claimDocumentOwnership() { documentOwnershipSeq += 1; return documentOwnershipSeq; }
try {
  orbitPanel = createOrbitPanel({ document, onRefresh: () => refreshOrbit(), onSelect: (entry) => openOrbitEntry(entry), onChoose: () => requestLibraryConnection(), onReconnect: () => reconnectMapLibrary(), onExpandRail: () => setRailExpanded(true) });
} catch (error) {
  orbitPanel = null;
}
try {
  orbitConflictDialog = createFileConflictDialog({ document, host: overlayHost, getMapBounds: () => { const rect = graphViewport?.getBoundingClientRect?.(); return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null; } });
  fileOpenBrowser = createOrbitFolderBrowserDialog({
    document, host: overlayHost, supported: orbitAdapter.supported,
    onChooseFolder: () => chooseFolderForBrowser(),
    onRefresh: () => refreshBrowser(),
    onNavigate: (entry) => navigateBrowserFolder(entry),
    onBreadcrumb: (index) => navigateBrowserBreadcrumb(index),
    onUp: () => navigateBrowserUp(),
    onConnect: () => connectBrowserFolder(),
    onOpenEntry: (entry) => openOrbitEntry(entry),
    onOpenFileElsewhere: () => openDocument(),
    onClose: () => { setRoutineStatus('Open cancelled. The current map and folder connection were not changed.'); openOrbitAction?.focus?.(); }
  });
} catch (error) {
  orbitConflictDialog = null;
}
let lastDocumentFailure = null;
queueMicrotask(() => { restoreMapLibraryFromSettings().catch(() => {}); });
let restoredMapAwaitingSave = false;
let attachmentIds = new Map();
let saveOperationToken = 0;
let openOperationToken = 0;
let replacementGuard = null;
let pendingReplacement = null;
let savedMapsDialog = null;
let recoveryDialog = null;
let startupRecoveryAttempted = false;
let startupRecoveryToken = 0;
let recoveryOperationToken = 0;
let recoveryOperationInFlight = false;
let activeRecoveryRequest = null;
let recoveryAfterClaimGate = null;
let recoveryAfterInstallGate = null;
let recoveryAfterInstallRelease = null;
let recoveryDiscardStartGate = null;
let recoveryDiscardStartRelease = null;
let recoveryAfterClaimRelease = null;
let recoveryDiscoveryPending = false;
let unsavedMapPrompt = null;
let saveConflictDialog = null;
let conflictGuard = null;
let conflictIdentity = null;
let pendingEditorConflictCompletion = false;
let editorAppliedOperation = null;
let savedMapsRequestToken = 0;
let savedMapsLibraryGuardToken = null;
let openRequestSeq = 0;
let pendingOpenRequest = null;
let pendingBackupImport = null;
let backupImportSeq = 0;
let installingBackupImport = null;
let lastPersistenceResult = null;
let saveInvocationCount = 0;
let persistenceLastError = null;
let p1bSaveDelay = 0;
let p1bSaveGate = null;
let p1bOpenDelay = 0;
let p1bOpenFailStage = null;
const p1bFrameFailures = [];
const p1bFrameCounts = { labels: 0, installHit: 0, recoveryLabels: 0, recoveryHit: 0 };
let persistenceRequestSeq = 0;
let recoveryDiagnostic = null;
let recoveryDeferredPreparation = null;
let recoveryDeferredRetirement = null;
let recoveryScheduler = null;
function recoverySource() {
  if (!hasMap || !tree || !attachmentRegistry) return null;
  return { tree, registry: attachmentRegistry, revision: dataRevision, session: persistenceSessionSeq, dataset: datasetToken, dirty: mapDirty(), documentName: activeDocument.active ? activeDocument.name : null, origin: activeDocument.origin || (activeMap.mapId ? 'library' : 'edit'), sourceMapId: activeMap?.mapId || null };
}
function scheduleRecoveryCheckpoint({ immediate = false } = {}) {
  try { return recoveryScheduler?.schedule({ immediate }) || false; } catch (error) { recoveryDiagnostic = { code: 'recovery-schedule-failed', message: String(error?.message || error) }; return false; }
}
async function establishRecoveryWorkspace({ origin = 'edit', baseline = false } = {}) {
  if (!recoveryScheduler) return null;
  const session = persistenceSessionSeq; const dataset = datasetToken;
  try {
    const owner = await recoveryScheduler.beginWorkspace({ session, dataset, documentName: activeDocument.active ? activeDocument.name : null, origin, sourceMapId: activeMap?.mapId || null });
    if (session !== persistenceSessionSeq || dataset !== datasetToken) { if (owner && recoveryScheduler.workspace === owner) recoveryScheduler.invalidate(); return null; }
    if (owner && baseline) await recoveryScheduler.checkpointNow();
    return owner;
  } catch (error) {
    recoveryDiagnostic = { code: 'recovery-workspace-start-failed', message: String(error?.message || error) };
    return null;
  }
}
try {
  persistenceRepository = createPersistenceRepository({
    indexedDB: globalThis.indexedDB,
    onBlocked: () => {
      persistenceBlocked = true;
      savedMapsDialog?.setBlocked('Storage is blocked by another FileOrbit tab. Close other tabs, then retry. Close this dialog to cancel.');
      setShellStatus('Storage is blocked by another FileOrbit tab. Close other tabs, then retry. The current map was preserved.');
      syncPersistenceControls();
    },
    onOpenSuccess: () => {
      if (persistenceBlocked) { persistenceBlocked = false; setShellStatus('Storage is available again.'); syncPersistenceControls(); }
    },
    onVersionChange: () => {
      persistenceUnavailable = 'Storage changed in another tab. Reload FileOrbit before saving again.';
      setShellStatus(persistenceUnavailable);
      syncPersistenceControls?.();
    }
  });
} catch (error) {
  persistenceUnavailable = String(error?.message || error);
}
const recoveryWiringEnabled = globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ !== true;
if (persistenceRepository && recoveryWiringEnabled) {
  recoveryScheduler = createRecoveryScheduler({
    repository: persistenceRepository,
    getSource: recoverySource,
    debounceMs: 600,
    onDiagnostic: (diagnostic) => { recoveryDiagnostic = diagnostic; }
  });
}
try {
  savedMapsDialog = createSavedMapsDialog({
    document, host: overlayHost,
    onOpen: (mapId) => { openSavedMap(mapId); },
    onDelete: (record) => deleteSavedMap(record),
    onPersist: () => requestPersistentStorage(),
    onCancel: () => {
      const token = savedMapsLibraryGuardToken;
      cancelBlockedPersistence();
      savedMapsLibraryGuardToken = null;
      pendingReplacement = null;
      if (token !== null) releaseReplacementGuard(token);
    }
  });
  unsavedMapPrompt = createUnsavedMapPrompt({
    document, host: overlayHost,
    onSave: () => saveBeforeReplacement(),
    onDiscard: () => discardAndContinueReplacement(),
    onCancel: () => cancelReplacement()
  });
  saveConflictDialog = createSaveConflictDialog({ document, host: overlayHost, onReload: () => resolveConflictReload(), onSaveCopy: () => resolveConflictSaveCopy(), onCancel: () => cancelSaveConflict() });
  recoveryDialog = createRecoveryDialog({ document, host: overlayHost, onRecover: (record) => recoverRecoveryCandidate(record), onDiscard: (record) => discardRecoveryCandidate(record), onLater: () => { setRoutineStatus('Recovery postponed. The recovery copy was not changed.'); } });
} catch (error) {
  persistenceUnavailable = String(error?.message || error);
}
let searchQuery = '';
let searchResultIds = new Set();
let hoveredId = null;
let searchPage = 1;
let searchPageCount = 1;
let labelPriorityRaf = 0;
let searchHighlightStatusEl = document.querySelector('#search-highlight-status');
let searchComposing = false;
let pendingSearchActivation = null;
const searchRevealWaiter = createSearchNavigationWaiter();
try {
  searchView = createSearchResultsView({ document, host: searchResultsHost, onActivate: (result) => activateSearchResult(result).catch((error) => searchView?.showError(String(error?.message || error))), onPage: (delta) => goToSearchPage(delta), onClear: () => clearSearch() });
} catch (error) {
  setShellStatus(`Search failed to initialize: ${String(error?.message || error)}`);
}
if (searchInput) {
  searchInput.addEventListener('compositionstart', () => { searchComposing = true; });
  searchInput.addEventListener('compositionend', () => { searchComposing = false; runSearch({ resetPage: true }); });
  searchInput.addEventListener('input', () => { if (!searchComposing) runSearch({ resetPage: true }); });
}
function setSearchOpen(open, { focus = true } = {}) {
  if (!searchPanel || !searchToggle) return;
  if (open && searchToggle.disabled) return;
  searchPanel.hidden = !open;
  searchToggle.setAttribute('aria-expanded', String(Boolean(open)));
  if (open) {
    if (searchView && !String(searchInput?.value || '').trim()) searchView.showInitial();
    searchInput?.focus?.();
  } else if (focus) searchToggle.focus?.();
}
function syncSearchControls() {
  if (!searchToggle) return;
  searchToggle.disabled = !hasMap || Boolean(creationSuspension);
  if (searchToggle.disabled && !searchPanel?.hidden) { searchPanel.hidden = true; searchToggle.setAttribute('aria-expanded', 'false'); }
}
function editorLifecycleActive() { return Boolean(editorController?.isOpen() || editorController?.mode === 'confirm-replace'); }
function syncDetailsToggleState() {
  if (!detailsToggle) return;
  const active = editorLifecycleActive();
  detailsToggle.disabled = active;
  if (detailsPanel) detailsPanel.dataset.editorActive = String(active);
  detailsToggle.setAttribute('aria-disabled', String(active));
  const action = detailsPanel?.dataset.collapsed === 'true' ? 'Show details' : 'Hide details';
  detailsToggle.setAttribute('aria-label', active ? 'Details cannot be hidden while an editor form is open.' : action);
  if (detailsToggleLabel) detailsToggleLabel.textContent = detailsPanel?.dataset.collapsed === 'true' ? 'Details' : 'Hide details';
  detailsToggle.setAttribute('title', active ? 'Details cannot be hidden while an editor form is open.' : action);
}
function revealDetailsForEditor() {
  if (!detailsPanel || !detailsContent) return;
  if (detailsPanel.dataset.collapsed === 'true' || detailsContent.hidden) setDetailsCollapsed(false, { focus: false });
  syncDetailsToggleState();
}
function setDetailsCollapsed(collapsed, { focus = false } = {}) {
  if (!detailsPanel || !detailsToggle || !detailsContent) return;
  const effective = Boolean(collapsed) && !editorLifecycleActive();
  detailsPanel.dataset.collapsed = String(effective);
  detailsContent.hidden = effective;
  detailsToggle.setAttribute('aria-expanded', String(!effective));
  if (detailsToggleLabel) detailsToggleLabel.textContent = effective ? 'Details' : 'Hide details';
  syncDetailsToggleState();
  if (focus && !effective) detailsToggle.focus?.();
  scheduleViewportResize();
}
function touchCapable() {
  return Number(globalThis.window?.navigator?.maxTouchPoints || globalThis.navigator?.maxTouchPoints || 0) > 0;
}
function responsiveDetailsMode() {
  const width = Number(globalThis.window?.innerWidth) || 0;
  const height = Number(globalThis.window?.innerHeight) || 0;
  const narrow = Boolean(globalThis.window?.matchMedia?.('(max-width: 560px)')?.matches);
  const phoneLandscape = touchCapable() && width > height && height <= 560 && width <= 1000;
  if (phoneLandscape) return 'phone-landscape';
  if (narrow) return 'narrow';
  return 'desktop';
}
function syncResponsiveDetails() {
  const mode = responsiveDetailsMode();
  if (mode === lastDetailsMode) return;
  lastDetailsMode = mode;
  setDetailsCollapsed(mode !== 'desktop');
}
let lastDetailsMode = null;
if (searchToggle) searchToggle.addEventListener('click', () => setSearchOpen(searchPanel?.hidden !== false));
if (searchClose) searchClose.addEventListener('click', () => setSearchOpen(false));
if (searchInput) searchInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.isComposing || searchComposing) return;
  if (createMapDialog?.open || attachmentViewer?.isOpen || deleteConfirmation?.isOpen || editorController?.isOpen() || editorMenu?.isOpen) return;
  if (!searchPanel?.hidden) { event.preventDefault(); setSearchOpen(false); }
});
if (detailsToggle) detailsToggle.addEventListener('click', () => setDetailsCollapsed(detailsPanel?.dataset.collapsed !== 'true', { focus: true }));
globalThis.window?.addEventListener?.('resize', syncResponsiveDetails);
globalThis.window?.addEventListener?.('orientationchange', syncResponsiveDetails);
const actionButtons = [...new Set(document.querySelectorAll('[data-action]'))].filter((button) => button.dataset.action !== 'theme' && button.dataset.action !== 'fullscreen');
const saveAsButtons = [...new Set(document.querySelectorAll('[data-action="save-document-as"]'))];
fitButton?.addEventListener('click', () => { if (largeMapView?.isActive()) { largeMapView.fit(); return; } fitGraph(); });
const shellActions = createActionButtonsController({ buttons: actionButtons, onAction: ({ action }) => {
  if (action === 'create-map') { startCreateMap(); return; }
  if (action === 'save-map') { if (editorController?.isOpen()) { if (typeof editorPanel?.submit !== 'function') { setShellStatus('Editor Save API is unavailable.'); return; } editorPanel.submit(); return; } saveCurrentDocument({ context: 'toolbar' }); return; }
  if (action === 'save-document-as') { saveCurrentDocument({ context: 'saveAs', saveAs: true }); return; }
  if (action === 'open-map') { requestOpenSavedMaps(); return; }
  if (action === 'copy-map') { copyCurrentMap(); return; }
  if (action === 'download') { downloadBackup(); return; }
  if (action === 'embed') { embedDialog.open({ invoker: document.activeElement }); return; }
  if (action === 'upload') { chooseBackupFile(); return; }
  setShellStatus('This action is not available yet.');
}, onUnavailable: ({ action }) => {
  const message = action === 'create-map' ? (createMapInitializationError ? 'Create Map failed to initialize: ' + String(createMapInitializationError?.message || createMapInitializationError) : 'Create Map is not available yet.')
    : action === 'save-map' ? (persistenceUnavailable || (!hasMap ? 'There is no map to save.' : 'Finish the current edit or action before saving.'))
      : action === 'open-map' ? (persistenceUnavailable || 'Finish the current action before opening a saved map.')
        : action === 'upload' || action === 'download' ? action + ' is not available yet.'
          : action === 'embed' ? 'Embed requires shareable map hosting and is not available yet.'
            : 'This action is not available yet.';
  setShellStatus(message);
} });
const mapPopup = mapMenuButton && mapMenu ? createPopupMenu({ document, button: mapMenuButton, menu: mapMenu }) : null;
const morePopup = moreMenuButton && moreMenu ? createPopupMenu({ document, button: moreMenuButton, menu: moreMenu }) : null;
moreMenuButton?.addEventListener('click', () => graphActionTooltipController.hide());
if (morePopup && moreMenu) {
  for (const item of moreMenu.querySelectorAll('[data-more-action]')) {
    item.addEventListener('click', () => {
      const target = document.querySelector(`#${item.dataset.moreTarget}`);
      if (!target || target.disabled || target.dataset.available === 'false') return;
      graphActionTooltipController.hide();
      morePopup.close();
      target.click();
    });
  }
}
openOrbitPopup = openOrbitAction && openOrbitMenu ? createPopupMenu({
  document,
  button: openOrbitAction,
  menu: openOrbitMenu,
  placement: () => document.querySelector('#nav-rail')?.dataset.expanded === 'true' ? 'below' : 'right'
}) : null;
if (openOrbitPopup && openOrbitMenu) {
  const menuItems = () => [...openOrbitMenu.querySelectorAll('[role="menuitem"]')].filter((item) => !item.disabled);
  const runChoice = (action) => {
    openOrbitPopup?.close?.();
    if (action === 'file') openDocument();
    else if (action === 'folder') openFileBrowser();
  };
  for (const action of ['file', 'folder']) {
    openOrbitMenu.querySelector('[data-open-kind="' + action + '"]')?.addEventListener('click', () => runChoice(action));
  }
  openOrbitMenu.addEventListener('keydown', (event) => {
    if (!openOrbitPopup?.open) return;
    const items = menuItems();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
    event.preventDefault?.();
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
    else next = event.key === 'ArrowUp' ? (index <= 0 ? items.length - 1 : index - 1) : (index < 0 || index === items.length - 1 ? 0 : index + 1);
    items[next].focus?.();
  });
}
if (themeMobile && morePopup) themeMobile.addEventListener('click', () => { themeController.toggle(); morePopup.close(); });
if (mapPopup && mapMenu) for (const button of mapMenu.querySelectorAll('button')) button.addEventListener('click', () => mapPopup.close());
const dragFeedbackEl = document.querySelector('#drag-feedback');
const dropFeedback = dragFeedbackEl ? createDropFeedback(dragFeedbackEl) : null;
const dragGhostEl = document.querySelector('#drag-ghost');
const dragTargetEl = document.querySelector('#drag-target');


let tree, graph, baseLayout, model, surface, overlay, navigation, session;
let largeMapView = null; const launchParams = new URLSearchParams(globalThis.location?.search || ''); const largeMapPaidTest = launchParams.get('paidTest') === '1'; const hypertreeComparisonMode = launchParams.get('hypertreeCompare') === '1'; const comparisonProjectionRadius = Math.max(240, Math.min(4096, Number(launchParams.get('hypertreeProjectionRadius')) || 240)); const largeMapPolicyContext = largeMapPaidTest ? createInternalPolicyContext({ edition: 'paid' }) : FREE_POLICY_CONTEXT;
let frameState = null;
let generation = 0;
let error = null;
let lastClickDiagnostic = null;
let transitionLabels = false;
let linkFrameReady = false;
let dragGesture = null;
let labelDragGesture = null;
let detachLabelClick = null;
let candidateEnv = null;
let datasetToken = 0;
let dataRevision = 0;
const ownership = createInteractionOwnership();
let editorController = null;
let editorPanel = null;

let detailsTargetId = null;
let editorMenu = null;
let deleteConfirmation = null;
let attachmentViewer = null;
let viewerDiagnosticId = null;
let idAllocator = null;
let attachmentRegistry = null;
let history = null;
const runtimeAccess = createPcRuntimeAccess({ getTree: () => tree, getRegistry: () => attachmentRegistry, getRevision: () => dataRevision, getHistory: () => history, advanceRevision: () => { dataRevision += 1; return dataRevision; }, historyMove: (direction) => performHistoryMove(direction), buildSnapshot: (options) => buildSaveSnapshot(options), disposeRuntime: (runtime) => runtime?.dispose?.() });
let historyToolbar = null;
let dragState = null;
let navigator = null;
let detachEditorContextMenu = null;
let detachLabelContextMenu = null;
let destroying = false;
let navigationInert = false;
let resizeObserver = null;
let resizeFrame = null;
syncResponsiveDetails();
let lastViewportSize = { width: -1, height: -1 };
let pendingViewportResize = false;

const FIXTURES = { f20, f200 };
const EXPLORATION_PRESENTATION = Object.freeze({ rootFill: '#818CF8', rootStroke: '#818CF8', folderFill: '#94A3B8', folderStroke: '#C4B5FD', fileFill: '#22C55E', fileStroke: '#22C55E', edgeStroke: '#454B54' });
let searchHighlightIds = new Set();
const viewport = () => ({ width: Math.max(0, graphViewport?.clientWidth || 0), height: Math.max(0, graphViewport?.clientHeight || 0) });
let largeMapContainer = null;
function countDocumentNodes(node) { return 1 + (node?.children || []).reduce((sum, child) => sum + countDocumentNodes(child), 0); }
function createLargeMapSession({ initialCamera } = {}) {
  const state = { camera: initialCamera || { x: 0, y: 0, scale: 1 }, framing: 'fit', hitActive: false, installing: false, lastEvent: null, error: null };
  return {
    run(operation, prepare) { try { const result = prepare ? prepare() : { ok: true }; return result && result.ok === false ? { ok: false, error: result.error || new Error('operation-failed') } : { ok: true, ...(result || {}) }; } catch (error) { return { ok: false, error }; } },
    getState() { return { ...state }; }, cancel() { return true; }, dispose() {}
  };
}
function buildLargeBaseLayout(treeValue) {
  const nodes = new Map(); const children = new Map(); const depths = new Map();
  let index = 0;
  const walk = (node, depth) => {
    const x = (index % 40) * 32; const y = Math.floor(index / 40) * 32; index += 1;
    const rho = Math.hypot(x, y); const theta = Math.atan2(y, x); nodes.set(node.id, { id: node.id, depth, x, y, radius: node.kind === 'folder' ? 12 : 7, positions: new Map([['current', { theta, rho }]]), spans: new Map([['current', 1]]), dimQuotients: new Map([['current', 1]]), angleSpan: { start: theta, end: theta + 0.01 } });
    depths.set(node.id, depth); children.set(node.id, (node.children || []).map((child) => child.id));
    for (const child of node.children || []) walk(child, depth + 1);
  };
  walk(treeValue, 0);
  let n = 0; const total = nodes.size;
  for (const record of nodes.values()) { const theta = (Math.PI * 2 * n) / Math.max(1, total); const rho = 0.9 * ((n + 1) / (total + 1)); record.positions = new Map([['current', { theta, rho }]]); record.x = Math.cos(theta) * rho; record.y = Math.sin(theta) * rho; n += 1; }
  const ids = [...nodes.keys()]; const one = new Map(ids.map((id) => [id, 1])); const zero = new Map(ids.map((id) => [id, 0])); return { rootId: treeValue.id, firstPhase: 'current', phases: ['current'], nodes, children, depths, demandById: one, allocatedSpanById: one, radialById: zero, parentRadialById: zero, placementRadiiById: zero, scales: one, angularWidths: one, treeAngularWidths: one, distances: one, placementDistances: one, feasibility: { workspaceScale: 1 } };
}
function admitDocument(treeValue) {
  const nodeCount = countDocumentNodes(treeValue);
  const admission = evaluateContextNodeAccess(largeMapPolicyContext, nodeCount, null);
  if (!admission.ok || admission.decision?.allowed !== true) {
    return { ok: false, nodeCount, message: `This document has ${nodeCount} nodes. Free mode admits up to 300. Launch with ?paidTest=1 for the explicit internal test context (up to 1,000).` };
  }
  return { ok: true, nodeCount, edition: admission.decision.edition };
}
function editorAdmissionAllowed() { const access = evaluateContextNodeAccess(largeMapPolicyContext, graph?.nodes?.size || 0, null); return Boolean(access.ok && access.decision?.allowed === true); }
let rendererBadge = null;
const rendererDiagnosticsVisible = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rendererDiagnostics') === '1';
function setRendererBadge(kind) {
  if (!graphViewport) return;
  if (!rendererBadge) { rendererBadge = document.createElement('div'); rendererBadge.id = 'renderer-mode-badge'; rendererBadge.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:8;pointer-events:none;background:rgba(15,23,42,.92);border:1px solid #475569;border-radius:5px;padding:4px 8px;color:#e2e8f0;font:11px system-ui'; graphViewport.appendChild(rendererBadge); }
  rendererBadge.hidden = !rendererDiagnosticsVisible || kind === 'none';
  rendererBadge.textContent = kind === 'base' ? ('Hypertree comparison · free-app renderer' + (comparisonProjectionRadius !== 240 ? ' · R' + comparisonProjectionRadius : '')) : kind === 'custom' ? 'Custom large-map renderer' : 'Hypertree · standard renderer';
  rendererBadge.dataset.renderer = kind;
  document.body.dataset.renderer = kind;
  window.__M5_RENDERER_MODE__ = kind;
}
function syncLargeMapPresentation() {
  if (!graphViewport || destroying) return;
  const nodeCount = hasMap && tree ? countDocumentNodes(tree) : 0;
  if (!hasMap || !tree) { largeMapView?.destroy(); largeMapView = null; globalThis.__M5_LARGE_MAP_VIEW__ = null; largeMapContainer?.remove(); largeMapContainer = null; if (host) host.style.display = ''; if (labelHost) labelHost.style.display = ''; setRendererBadge(hypertreeComparisonMode ? 'base' : 'none'); return; }
  if (nodeCount <= 300 || hypertreeComparisonMode) {
    largeMapView?.destroy(); largeMapView = null; globalThis.__M5_LARGE_MAP_VIEW__ = null; largeMapContainer?.remove(); largeMapContainer = null;
    if (host) host.style.display = ''; if (labelHost) labelHost.style.display = ''; setRendererBadge(hypertreeComparisonMode ? 'base' : (nodeCount <= 300 ? 'standard' : 'base'));
    return;
  }
  if (!largeMapView) {
    largeMapContainer = document.createElement('div');
    largeMapContainer.style.cssText = 'position:absolute;inset:0;z-index:1';
    graphViewport.appendChild(largeMapContainer);
    if (host) host.style.display = 'none'; if (labelHost) labelHost.style.display = 'none';
    largeMapView = createLargeMapPresentation({
      container: largeMapContainer,
      getTree: () => tree,
      getSelectedId: () => detailsTargetId,
      getDatasetToken: () => datasetToken,
      canInteract: (id, kind) => {
        if (replacementGuard || ownership.blocked() || editorController?.isOpen() || editorController?.isSaving() || deleteConfirmation?.isOpen || attachmentViewer?.isOpen || documentSaving || installingBackupImport || pendingBackupImport) { setShellStatus('Finish the current edit, save, dialog or preview before navigating the large map.'); return false; }
        return true;
      },
      onSelect: (id) => { detailsTargetId = id; if (id === null) attachmentViewer?.close?.({ restoreFocus: false }); publish(); },
      onPreview: (id) => { openAttachmentViewer(id); },
      onEdit: (id, event) => { activateEditorTarget({ id, kind: graph?.nodes?.get(id)?.kind || 'file' }, event); },
      onFolderChange: () => {},
      onStatus: (message) => setShellStatus(message)
    });
  }
  largeMapView.refresh(detailsTargetId, { searchTargetId: searchView?.activeId || null, searchFolderIds: [...searchHighlightIds] }); globalThis.__M5_LARGE_MAP_VIEW__ = largeMapView; setRendererBadge('custom');
}
const baseRadius = () => Math.max(1, Math.min(viewport().width, viewport().height) * 0.42);

function boot(name = fixtureEl.value) {
  if (!FIXTURES[name]) { startEmptyState(); return; }
  if (createMapDialog?.open) { creationTerminal = 'discard'; creationSuspension = null; createMapDialog.close(); }
  destroy();
  persistenceSessionSeq += 1; clearActiveMap(); attachmentIds = new Map(); persistenceBusy = null; replacementGuard = null; pendingReplacement = null; lastPersistenceResult = null; persistenceLastError = null; restoredMapAwaitingSave = false;
  savedMapsDialog?.close({ restoreFocus: false, notify: false }); unsavedMapPrompt?.close({ restoreFocus: false });
  releasePendingCreateCandidate();
  destroying = false;
  tree = FIXTURES[name]();
  graph = loadTree(tree).graph;
  const staged = stageExperimentalV2Layout(graph, { rootId: tree.id, phases: ['current'], nodeOptions: { overridable: true } });
  const refined = refineExperimentalV2Layout(staged, graph, {
    viewport: viewport(), padding: 24, phase: 'current', projectionBaseRadiusCss: baseRadius()
  });
  baseLayout = refined.staged;
  model = createExplorationModel({ graph, baseLayout, structuralRootId: tree.id, phase: 'current' });
  generation = 0;
  datasetToken += 1;
  ownership.reset();
  idAllocator = createEditorIdAllocator({ datasetToken });
  attachmentRegistry = createAttachmentRegistry({ datasetToken });
  history = createEditorHistory();
  if (!historyToolbar) historyToolbar = createHistoryToolbarController({
    undoButton: undoHistoryButton, redoButton: redoHistoryButton,
    getHistory: () => runtimeAccess.history(), getBlockedReason: () => historyBlockedReason(),
    run: (direction) => runtimeAccess.move(direction)
  });
  lastClickDiagnostic = null;
  navigator = null;
  createSurface();
  createEditor();
  startViewportObserver();
  session = createExplorationSession({
    model,
    frame: installFrame,
    invalidate: () => { frameState = null; },
    publish,
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS),
    limits: EXPERIMENTAL_CAMERA_LIMITS
  });
  const result = session.run('initial-overview', () => ({ ok: true, fit: true }), { fit: false, eventKind: 'programmatic' });
  if (result.ok) { hasMap = true; setMapPresentation(true); resetSearchForDataset(); createNavigator(); createNavigation(); publish(); } else { startEmptyState(); }
}

function createSurface() {
  dropFeedback?.clear();
  editorMenu?.close({ restoreFocus: false });
  if (detachEditorContextMenu) { detachEditorContextMenu(); detachEditorContextMenu = null; }
  if (detachLabelContextMenu) { detachLabelContextMenu(); detachLabelContextMenu = null; }
  if (detachLabelClick) { detachLabelClick(); detachLabelClick = null; }
  if (navigation) { navigation.destroy(); navigation = null; }
  if (overlay) { overlay.destroy(); overlay = null; }
  if (surface) { surface.destroy(); surface = null; }
  surface = createCanvasSurface(host, { width: viewport().width, height: viewport().height, dpr: Math.max(1, window.devicePixelRatio || 1) });
  overlay = createLabelOverlay(labelHost, { maxLabels: hypertreeComparisonMode ? 64 : 40, maxWidth: 180, placement: 'around', linkActivation: 'deferred', labelPalette: EXPLORATION_LABEL_PALETTE });
  surface.canvas.style.cursor = 'default';
  surface.canvas.addEventListener('pointermove', updateCanvasCursor);
  surface.canvas.addEventListener('pointerleave', () => { if (hoveredId !== null) { hoveredId = null; scheduleLabelPriorityRefresh(); } });
  surface.canvas.addEventListener('pointerleave', () => { if (surface?.canvas) surface.canvas.style.cursor = 'default'; });
  surface.canvas.addEventListener('click', onCanvasClick);
  detachEditorContextMenu = attachEditorContextMenu({
    canvas: surface.canvas,
    resolve: (event) => {
      const diagnosed = diagnoseEditorTarget({ event, canvas: surface.canvas, frameState, graph });
      if (!diagnosed.ok) {
        lastClickDiagnostic = { reason: 'context-menu-' + diagnosed.reason, operation: 'editor-contextmenu' };
        publish();
        return null;
      }
      return diagnosed.target;
    },
    activate: (target, event) => activateEditorTarget(target, event)
  });
  createDragGesture();
  detachLabelClick = attachLabelClick();
  detachLabelContextMenu = attachLabelContextMenuPath({
    document, overlay, getFrameState: () => frameState, getGraph: () => graph,
    getVisibleSet: () => model.view().visibleSet, getDetails: (id) => model.details(id),
    activate: (target, event) => activateEditorTarget(target, event),
    isTransitioning: () => transitionLabels || Boolean(navigator?.busy),
    onDiagnostic: (diagnostic) => { lastClickDiagnostic = { ...diagnostic, operation: 'editor-contextmenu-label' }; publish(); }
  });
}

function labelPriorityForView(view, selectedId = model?.selectedId ?? null, structuralRootId = model?.structuralRootId ?? null) {
  const selectedNode = selectedId ? graph.nodes.get(selectedId) : null;
  const selectedFolderVisible = selectedNode?.kind === 'folder' && view.visibleSet.has(selectedId);
  const folderId = selectedFolderVisible ? selectedId : view.focusedFolderId;
  return [...new Set([
    view.focusedFolderId,
    ...folderContextLabelPriorityIds({ tree, view, folderId }),
    ...explorationLabelPriorityIds({ view, structuralRootId, selectedId }),
    ...searchResultIds,
    hoveredId
  ].filter(Boolean))];
}
function priorityIds(envModel = model) {
  return labelPriorityForView(envModel.view(), envModel.selectedId, envModel.structuralRootId);
}
function scheduleLabelPriorityRefresh() {
  if (labelPriorityRaf || !overlay || !frameState?.scene || !hasMap || transitionLabels || navigator?.busy) return;
  labelPriorityRaf = requestAnimationFrame(() => { labelPriorityRaf = 0; refreshLabelPriority(); });
}
function refreshLabelPriority() {
  if (!overlay || !frameState?.scene || !model || transitionLabels || navigator?.busy) return;
  overlay.update({ scene: frameState.scene, presentation: presentation(), priorityIds: priorityIds(model), rootId: model.structuralRootId, selectedId: model.selectedId });
}

function attachLabelClick() {
  return attachLabelSelection({
    host: labelHost, overlay,
    getFrameState: () => frameState,
    getDetails: (id) => model.details(id),
    isBlocked: () => Boolean(ownership.blocked() || attachmentViewer?.isOpen || navigator?.busy || dragState || editorController?.isSaving() || editorController?.mode === 'confirm-replace'),
    isClickSuppressed: () => Boolean(labelDragGesture?.clickSuppressed),
    select: (id, meta = null) => {
      const activation = meta?.activation === 'file-name' ? 'file-name' : 'icon';
      lastClickDiagnostic = { reason: 'label-activation', id, activation, viewerRequested: activation === 'file-name', viewerOpened: false };
      const intent = createSelectionIntent({ kind: 'node-select', targetId: id, hitKind: 'file', openAttachment: activation === 'file-name', datasetToken, baseRevision: dataRevision });
      if (editorController?.isOpen() && editorController.dirty) {
        editorPanel.requestSelection(intent);
        publish();
        return;
      }
      executePendingIntent(intent);
    }
  });
}

function createDragGesture() {
  if (dragGesture) dragGesture.destroy();
  if (labelDragGesture) labelDragGesture.destroy();
  dragGesture = createDragGestureFor(surface.canvas, (event) => hitAtEvent(event));
  labelDragGesture = createDragGestureFor(labelHost, (event) => hitAtLabel(event));
}
function createDragGestureFor(target, hitAt) {
  return createNodeDragGesture({
    canvas: target,
    threshold: 4,
    isEnabled: () => !destroying && !replacementGuard && !attachmentViewer?.isOpen && !navigator?.busy && !editorController?.isOpen() && !ownership.blocked(),
    hitAt,
    onStart: ({ id, event }) => {
      suspendNavigation();
      editorMenu?.close({ restoreFocus: false });
      if (surface?.canvas) surface.canvas.style.cursor = 'grabbing';
      dragState = { sourceId: id, subtree: collectSubtreeIds(tree, id), targetId: null, point: { x: event.clientX, y: event.clientY }, started: false, generation, datasetToken, structuralRootId: model.structuralRootId };
    },
    onMove: ({ id, event }) => {
      if (!dragState) return;
      dragState.point = { x: event.clientX, y: event.clientY };
      if (!dragState.started) { dragState.started = true; showGhost(id, event); } else moveGhost(event);
      const hit = hitAtEvent(event);
      dragState.targetId = eligibleTarget(id, hit?.id) ? hit.id : null;
      showTarget(dragState.targetId);
    },
    onDrop: createPointerUpDropHandler({
      getGesture: () => dragState,
      getDragIdentity: () => ({ generation, datasetToken, structuralRootId: model.structuralRootId, frameReady: Boolean(frameState?.hit) }),
      overlay,
      getDetails: (nodeId) => model.details(nodeId),
      hitAtEvent, cleanup: cleanupDrag, feedback, performReparent: (source, target, gesture) => { const result = performReparent(source, target, gesture); syncHistoryControls(); return result; },
      restore: restoreNavigation, publish
    }),
    onCancel: () => {
      cleanupDrag();
      restoreNavigation();
      publish();
    }
  });
}
function hitAtLabel(event) {
  if (!event || !overlay || !frameState?.hit) return null;
  const label = overlay.labelAtPoint?.(event.clientX, event.clientY);
  if (!label) return null;
  const details = model.details(label.id);
  return details?.kind === 'file' ? { id: label.id, point: null } : null;
}

function updateCanvasCursor(event) {
  if (!surface?.canvas) return;
  if (ownership.blocked() || navigator?.busy || editorController?.isSaving() || editorController?.mode === 'confirm-replace') {
    surface.canvas.style.cursor = 'default';
    return;
  }
  if (dragState) { surface.canvas.style.cursor = 'grabbing'; return; }
  const hit = hitAtEvent(event);
  const node = hit ? graph.nodes.get(hit.id) : null;
  const nextHoveredId = node ? node.id : null;
  if (nextHoveredId !== hoveredId) { hoveredId = nextHoveredId; scheduleLabelPriorityRefresh(); }
  surface.canvas.style.cursor = node ? 'pointer' : 'default';
}

function hitAtEvent(event) {
  if (!event || !frameState || !frameState.hit || !surface) return null;
  let point;
  try { point = clientToCanvasCss(surface.canvas, event.clientX, event.clientY); } catch { return null; }
  const id = hitTestNode(frameState.hit, point);
  return id ? { id, point } : null;
}
function eligibleTarget(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  if (dragState?.subtree?.has(targetId)) return false;
  const node = graph.nodes.get(targetId);
  return node?.kind === 'folder';
}
function showGhost(id, event) {
  if (!dragGhostEl) return;
  dragGhostEl.textContent = graph.nodes.get(id)?.name || id;
  dragGhostEl.style.display = 'block';
  moveGhost(event);
}
function drawablePoint(clientX, clientY) {
  if (surface?.canvas) {
    try { return clientToCanvasCss(surface.canvas, clientX, clientY); } catch {}
  }
  const rect = dragGhostEl?.parentElement?.getBoundingClientRect?.();
  return { x: clientX - (rect?.left || 0), y: clientY - (rect?.top || 0) };
}
function moveGhost(event) {
  if (!dragGhostEl) return;
  const point = drawablePoint(event.clientX, event.clientY);
  dragGhostEl.style.left = `${point.x}px`;
  dragGhostEl.style.top = `${point.y}px`;
}
function showTarget(id) {
  if (!dragTargetEl) return;
  const node = id ? frameState?.scene?.nodes?.get(id) : null;
  if (!node) { dragTargetEl.style.display = 'none'; return; }
  dragTargetEl.style.display = 'block';
  dragTargetEl.style.left = `${node.center.x - node.radius - 4}px`;
  dragTargetEl.style.top = `${node.center.y - node.radius - 4}px`;
  dragTargetEl.style.width = `${node.radius * 2 + 8}px`;
  dragTargetEl.style.height = `${node.radius * 2 + 8}px`;
}
function cleanupDrag() {
  dragState = null;
  if (dragGhostEl) { dragGhostEl.style.display = 'none'; dragGhostEl.textContent = ''; }
  if (dragTargetEl) dragTargetEl.style.display = 'none';
}
function captureHistoryView() {
  return {
    focusedFolderId: model?.focusedFolderId ?? null,
    selectedId: model?.selectedId ?? null,
    detailsTargetId,
    camera: session ? { ...session.getState().camera } : null,
    framing: session?.getState().framing ?? 'fit',
    viewport: viewport()
  };
}
function sweepAttachments() {
  if (!attachmentRegistry || !history) return;
  sweepAttachmentOwnership(attachmentRegistry, { tree, entries: [...history.undo, ...history.redo] });
}
function feedback(message) {
  dropFeedback?.show(message);
}
function historyBlockedReason() {
  if (replacementGuard) return 'replacement-pending';
  if (viewerBlocksInteraction(attachmentViewer)) return 'attachment-viewer-open';
  if (deleteConfirmation?.isOpen) return 'delete-confirm-open';
  if (ownership.creationOwned) return 'create-map-open';
  if (ownership.recoveryFailed) return 'editor-inert';
  if (editorController?.isOpen()) return 'editor-form-open';
  if (editorController?.isSaving()) return 'editor-saving';
  if (dragState) return 'drag-active';
  if (navigator?.busy) return 'transition-active';
  if (frameState?.installing || session?.getState().installing) return 'frame-installing';
  return null;
}
function performHistoryMove(direction) {
  if (!history) return null;
  const blocked = historyBlockedReason();
  if (blocked) { if (historyStatusEl) historyStatusEl.textContent = 'Undo/Redo unavailable while editing, dragging, or transitioning.'; return { ok: false, reason: blocked }; }
  const old = { tree, graph, baseLayout, model, session, navigator };
  const result = performMetadataHistoryReplay({
    direction, history, tree, datasetToken, attachmentRegistry,
    graph, baseLayout, model, session,
    structuralRootId: model.structuralRootId,
    viewport: viewport(), baseRadiusCss: baseRadius(), phase: 'current', baseRevision: dataRevision, policyContext: largeMapPolicyContext,
    frame: installFrame,
    invalidate: () => { frameState = null; },
    setCandidateEnv: (env) => { candidateEnv = env; },
    commit: (candidate, candidateSession) => {
      tree = candidate.tree; graph = candidate.graph; baseLayout = candidate.baseLayout; model = candidate.model;
      session = candidateSession; runtimeAccess.advanceRevision(); navigator = null;
      createNavigator(); createNavigation();
    },
    recover: () => {
      tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model;
      session = old.session; navigator = old.navigator; frameState = null;
      const recovered = recoverAuthoritativeSession(old.session);
    if (!recovered) ownership.markRecoveryFailure();
      if (!recovered) { linkFrameReady = false; overlay?.deactivateLinks(); }
      return recovered;
    }
  });
  if (!result.ok) {
    if (historyStatusEl) historyStatusEl.textContent = String(result.message || (direction === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.'));
    publish(); return result;
  }
  scheduleRecoveryCheckpoint();
  requestAutomaticSave();
  const view = result.entry?.viewBefore && direction === 'undo' ? result.entry.viewBefore : result.entry?.viewAfter;
  syncHistoryControls();
  detailsTargetId = view && Object.prototype.hasOwnProperty.call(view, 'detailsTargetId') ? view.detailsTargetId : null;
  if (historyStatusEl) historyStatusEl.textContent = `${direction === 'undo' ? 'Undid' : 'Redid'}: ${result.entry.action}`;
  publish();
  return result;
}
function targetIdOrNull(value) { return typeof value === 'string' ? value : null; }
function syncHistoryControls() {
  if (!history || !undoHistoryButton || !redoHistoryButton) return;
  const blocked = Boolean(historyBlockedReason());
  const undoEntry = history.undo.at(-1);
  const redoEntry = history.redo.at(-1);
  undoHistoryButton.disabled = blocked || !undoEntry;
  redoHistoryButton.disabled = blocked || !redoEntry;
  if (undoHistoryButton.dataset.presentation !== 'icon') undoHistoryButton.textContent = 'Undo';
  if (redoHistoryButton.dataset.presentation !== 'icon') redoHistoryButton.textContent = 'Redo';
  const undoLabel = undoEntry ? 'Undo: ' + undoEntry.action : 'Undo';
  const redoLabel = redoEntry ? 'Redo: ' + redoEntry.action : 'Redo';
  for (const [button, label] of [[undoHistoryButton, undoLabel], [redoHistoryButton, redoLabel]]) {
    button.setAttribute('aria-label', label); button.setAttribute('title', label); button.dataset.tooltip = label;
  }
}
function performReparent(sourceId, targetId, gesture) {
  const old = { tree, graph, baseLayout, model, session, navigator };
  const historyViewBefore = captureHistoryView();
  const move = history ? buildReparentCandidate({ tree, sourceId, targetId, structuralRootId: model.structuralRootId }) : null;
  const historyEntry = move?.ok ? makeReparentHistoryEntry({
    tree, candidateTree: move.candidateTree, sourceId, structuralRootId: model.structuralRootId,
    datasetToken, viewBefore: historyViewBefore, viewAfter: { ...historyViewBefore, detailsTargetId: null }
  }) : null;
  const result = performReparentInstallation({
    tree, graph, model, session,
    sourceId, targetId, gesture,
    generation, datasetToken, structuralRootId: model.structuralRootId, policyContext: largeMapPolicyContext,
    viewport: viewport(), baseRadiusCss: baseRadius(), phase: 'current',
    history, historyEntry, currentDetailsTargetId: detailsTargetId,
    frame: installFrame,
    invalidate: () => { frameState = null; },
    setCandidateEnv: (env) => { candidateEnv = env; },
    commit: (candidate, candidateSession) => {
      tree = candidate.tree; graph = candidate.graph; baseLayout = candidate.baseLayout; model = candidate.model;
      runtimeAccess.advanceRevision();
      detailsTargetId = resolvePostOperationDetails({ operation: 'reparent', currentDetailsTargetId: detailsTargetId, sourceId, model: candidate.model, graph: candidate.graph });
      session = candidateSession; navigator = null;
      createNavigator();
      createNavigation();
    },
    recover: ({ error }) => {
      tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model;
      session = old.session; navigator = old.navigator;
      frameState = null;
      const recovered = recoverAuthoritativeSession(old.session);
    if (!recovered) ownership.markRecoveryFailure();
      if (!recovered) { linkFrameReady = false; overlay?.deactivateLinks(); }
      return recovered;
    }
  });
  if (result.ok) { sweepAttachments(); scheduleRecoveryCheckpoint(); requestAutomaticSave(); syncHistoryControls(); publish(); }
  return result;
}
function frameBoundary(operation, boundary) {
  const key = operation + ':' + boundary;
  p1bFrameCounts[key] = (p1bFrameCounts[key] || 0) + 1;
  if (!globalThis.__M5_P1B_TEST_HOOKS__) return;
  const failure = p1bFrameFailures.find((entry) => entry.operation === operation && entry.boundary === boundary && entry.remaining > 0);
  if (!failure) return;
  failure.remaining -= 1;
  if (failure.remaining <= 0) p1bFrameFailures.splice(p1bFrameFailures.indexOf(failure), 1);
  throw new Error('injected ' + operation + ' ' + boundary + ' callback failure');
}

function highlightedScene(scene, sourceGraph = graph) {
  const themed = themedCanvasScene(scene, activeTheme);
  const ids = sourceGraph === graph ? searchHighlightIds : null;
  if (!ids || ids.size === 0) return { scene: themed, ids: null };
  return { scene: highlightSearchFolderScene(themed, ids, activeTheme), ids };
}

// Test-only visual-state hook used by the isolated browser evidence runner.
globalThis.__SET_SEARCH_ACTIVE__ = (id) => { searchView?.setActive(id); refreshCanvasTheme(); return searchView?.activeId || null; };
function drawCurrentGraphScene(scene, { selectedId = null, sourceGraph = graph } = {}) {
  const highlighted = highlightedScene(scene, sourceGraph);
  return drawGraphScene(surface, highlighted.scene, {
    selectedId,
    highlightedFolderIds: highlighted.ids,
    activeHighlightId: highlighted.ids ? (searchView?.activeId || null) : null,
    highlight: highlighted.ids ? { color: searchHighlightToken(activeTheme).outline, activeWidth: 3.5, activeGap: 7 } : undefined
  });
}

function installFrame({ operation, fit, entry, camera, framing }) {
  linkFrameReady = false;
  overlay?.deactivateLinks();
  const env = candidateEnv || { graph, baseLayout, model };
  const prepared = stageExplorationFrame({
    graph: env.graph, baseLayout: env.baseLayout, view: env.model.view(), viewport: viewport(), baseRadiusCss: baseRadius(),
    fit, entry, camera, framing, fitSubtree: hypertreeComparisonMode, cameraLimits: EXPERIMENTAL_CAMERA_LIMITS, presentation: EXPLORATION_PRESENTATION,
    adapters: {
      draw: (scene) => { frameBoundary(operation, 'draw'); drawCurrentGraphScene(scene, { selectedId: env.model.selectedId, sourceGraph: env.graph }); },
      labels: (scene) => {
        frameBoundary(operation, 'labels');
        if (transitionLabels) {
          overlay.completeTransition({ scene, presentation: presentation(env.graph), priorityIds: priorityIds(env.model), rootId: env.model.structuralRootId, selectedId: env.model.selectedId });
          overlay.update({ scene, presentation: presentation(env.graph), priorityIds: priorityIds(env.model), rootId: env.model.structuralRootId, selectedId: env.model.selectedId });
          transitionLabels = false;
        } else {
          overlay.update({ scene, presentation: presentation(env.graph), priorityIds: priorityIds(env.model), rootId: env.model.structuralRootId, selectedId: env.model.selectedId });
        }
      },
      installHit: () => { frameBoundary(operation, 'installHit'); }
    }
  });
  frameState = {
    scene: prepared.scene, hit: prepared.hit, filtered: prepared.filtered,
    camera: prepared.camera, framing: prepared.framing, operation, fit,
    containment: prepared.containment, fitInfo: prepared.fitInfo
  };
  linkFrameReady = true;
  generation += 1;
  syncController();
  return { camera: prepared.camera, framing: prepared.framing, scene: prepared.scene, hit: prepared.hit, containment: prepared.containment };
}

function installManualCameraFrame(prepared, camera) {
  transitionLabels = false;
  frameState = { scene: prepared.scene, hit: prepared.hit, filtered: prepared.filtered, camera, framing: 'manual', containment: prepared.containment, progress: 1 };
  drawCurrentGraphScene(prepared.scene, { selectedId: model.selectedId, sourceGraph: graph });
  overlay.update({ scene: prepared.scene, presentation: presentation(graph), priorityIds: priorityIds(model), rootId: model.structuralRootId, selectedId: model.selectedId });
  linkFrameReady = true;
  if (labelHost) labelHost.style.pointerEvents = '';
  generation += 1;
  if (navigation) navigation.update({ camera, viewport: viewport(), cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
  publish();
}
function presentation(sourceGraph = graph) {
  const result = new Map();
  for (const [id, node] of sourceGraph.nodes) result.set(id, {
    name: node.name,
    kind: node.kind,
    dataType: node.data?.dataType,
    link: node.data?.link,
    classification: node.data?.classification
  });
  return result;
}

function createNavigation() {
  if (navigation) { navigation.destroy(); navigation = null; }
  const state = session.getState();
  navigation = createMouseNavigationController(surface.canvas, {
    camera: state.camera,
    viewport: viewport(),
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    onCameraChange: (next, meta) => {
      if (!canApplyViewerGuardedCamera({ viewer: attachmentViewer, navigatorBusy: false })) return false;
      if (navigator?.busy) {
        const interrupted = navigator.interruptCamera(next);
        if (!interrupted.ok) return false;
        session.applyCamera(next, { kind: meta.kind, viewport: viewport() });
        installManualCameraFrame(interrupted.prepared, next);
        return true;
      }
      session.applyCamera(next, { kind: meta.kind, viewport: viewport() });
      queueMicrotask(publish);
      return true;
    },
    onError: ({ error: controlError }) => {
      error = String(controlError?.message || controlError);
      publish();
    }
  });
}
function syncController() {
  if (!navigation || !session) return;
  try { navigation.update({ camera: session.getState().camera, viewport: viewport(), cameraLimits: EXPERIMENTAL_CAMERA_LIMITS }); } catch { /* keep prior controller */ }
}

function onCanvasClick(event) {
  if (replacementGuard) { setShellStatus('Finish the pending replacement decision first.'); return; }
  clearTransientShellStatus();
  if (event.button !== 0) return;
  if (ownership.blocked()) return;
  if (editorController?.isSaving()) {
    lastClickDiagnostic = { reason: 'editor-saving', id: null };
    publish();
    return;
  }
  if (navigator?.busy) {
    const current = hitAtEvent(event);
    const kind = current ? graph.nodes.get(current.id)?.kind : null;
    if (kind !== 'folder') {
      lastClickDiagnostic = { reason: current ? 'transition-busy' : 'transition-frame-not-ready', id: current?.id || null };
      publish();
      return;
    }
  }
  if (editorController?.mode === 'confirm-replace') return;
  if (editorController?.isOpen() && editorController.dirty) {
    const intent = resolveClickIntent(event);
    if (!intent) return;
    if (intent.targetId === editorController.targetId) { publish(); return; }
    editorPanel.requestSelection(intent);
    publish();
    return;
  }
  const priorSelectedId = model.selectedId;
  const priorFocusedId = model.focusedFolderId;
  const result = handleExplorationCanvasClick({
    event,
    canvas: surface?.canvas,
    frameState,
    session,
    model,
    graph,
    onFolder: ({ id }) => enterFolder(id),
    onDiagnostic: (diagnostic) => {
      lastClickDiagnostic = diagnostic;
      publish();
    }
  });
  if (result.ok) {
    detailsTargetId = result.reason === 'background-miss' ? null : result.id;
    if (result.kind === 'folder' && result.reason === 'folder-entered') {
      if (result.mode === 'transition') lastClickDiagnostic = { reason: 'transition-start', id: result.id };
      syncController();
    }
  }
}

function openAttachmentViewer(id) {
  if (!attachmentViewer || !session || !model) return false;
  const details = model.details(id);
  if (!details || details.kind !== 'file' || !details.attachment) {
    lastClickDiagnostic = { reason: 'attachment-unavailable', id, activation: 'file-name', viewerRequested: true, viewerOpened: false };
    setInfoStatus('This file has no attachment to preview.', { ttl: 3000 });
    publish();
    return false;
  }
  viewerDiagnosticId = id;
  lastClickDiagnostic = { reason: 'attachment-viewer-requested', id, activation: 'file-name', viewerRequested: true, viewerOpened: false };
  Promise.resolve(attachmentViewer.open({ details, registry: attachmentRegistry })).catch((error) => {
    lastClickDiagnostic = { reason: 'attachment-viewer-error', id, error: String(error?.message || error), viewerRequested: true, viewerOpened: false };
    publish();
  });
  publish();
  return true;
  publish();
}
function enterFolder(id) {
  if (attachmentViewer?.isOpen) return { ok: false, reason: 'viewer-open' };
  if (!navigator) return { ok: false, reason: 'navigator-not-ready' };
  return navigator.enterFolder(id);
}

function createNavigator() {
  let transitionTerminal = null;
  navigator = createExplorationNavigator({
    graph,
    baseLayout,
    model,
    session,
    viewport: viewport(),
    baseRadiusCss: baseRadius(),
    cameraLimits: EXPERIMENTAL_CAMERA_LIMITS,
    fitSubtree: hypertreeComparisonMode,
    presentation: EXPLORATION_PRESENTATION,
    duration: EXPLORATION_TRANSITION_DURATION_MS,
    reducedMotion: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    draw: (scene) => drawCurrentGraphScene(scene, { selectedId: model.selectedId }),
    labels: (scene, meta) => {
      if (!meta || !meta.targetView) throw new Error('transition-label-target-missing');
      const labelInput = { scene, presentation: presentation(), priorityIds: labelPriorityForView(meta.targetView, model.selectedId, model.structuralRootId), rootId: model.structuralRootId, selectedId: model.selectedId };
      if (!transitionLabels) {
        transitionLabels = true;
        return overlay.beginTransition(labelInput);
      }
      return overlay.updateTransition(labelInput);
    },
    onStart: () => {
      transitionTerminal = null;
      linkFrameReady = false;
      overlay?.deactivateLinks();
      editorMenu?.close({ restoreFocus: false });
      if (labelHost) labelHost.style.pointerEvents = 'none';
      transitionLabels = false;
      frameState = null;
      lastClickDiagnostic = { reason: 'transition-start', id: null };
      publish();
    },
    onFrame: ({ prepared, progress, camera, id }) => {
      frameState = { scene: prepared.scene, hit: prepared.hit, filtered: prepared.filtered, camera, framing: 'manual', containment: prepared.containment, progress };
      if (navigation) navigation.update({ camera, viewport: viewport(), cameraLimits: EXPERIMENTAL_CAMERA_LIMITS });
      lastClickDiagnostic = { reason: 'transition-in-progress', id, progress };
      publish();
    },
    onError: ({ error: frameError, id }) => {
      if (transitionTerminal) return;
      const outcome = finalizeTransitionNavigation({
        overlay, transitionLabels, session, id, error: frameError,
        restoreNavigation, suspendNavigation: () => { if (navigation) { navigation.destroy(); navigation = null; } }
      });
      transitionLabels = false;
      if (!outcome.recovered) { frameState = null; linkFrameReady = false; }
      lastClickDiagnostic = { reason: 'transition-frame-failed', id, error: outcome.originalError, cleanupError: outcome.cleanupError, recovered: outcome.recovered };
      transitionTerminal = outcome;
      publish();
      if (labelHost) labelHost.style.pointerEvents = '';
      searchRevealWaiter.settle(id, { ok: false, error: outcome.originalError });
      if (pendingViewportResize) { pendingViewportResize = false; queueMicrotask(() => handleViewportResize()); }
    },
    onSettled: ({ id = null, state = null } = {}) => {
      if (transitionTerminal) return;
      const outcome = finalizeTransitionNavigation({
        overlay, transitionLabels, session, recover: false,
        restoreNavigation, suspendNavigation: () => { if (navigation) { navigation.destroy(); navigation = null; } }
      });
      transitionLabels = false;
      if (!outcome.recovered) { frameState = null; linkFrameReady = false; }
      if (outcome.cleanupError !== null) lastClickDiagnostic = { reason: 'transition-cleanup-failed', error: outcome.cleanupError, recovered: outcome.recovered };
      transitionTerminal = outcome;
      createNavigation();
      searchRevealWaiter.settle(id, { ok: outcome.recovered && state?.completionReason === 'completed' });
      if (labelHost) labelHost.style.pointerEvents = '';
      if (pendingViewportResize) { pendingViewportResize = false; queueMicrotask(() => handleViewportResize()); }
      publish();
    }
  });
}

function suspendNavigation() {
  if (navigation) { navigation.destroy(); navigation = null; }
}
function restoreNavigation() {
  if (destroying || !surface || !session) return;
  if (!navigation) createNavigation();
}

function fitGraph() {
  if (viewerBlocksInteraction(attachmentViewer)) { lastClickDiagnostic = { reason: 'attachment-viewer-open' }; publish(); return; }
  const blocked = fitBlockReason({
    gesture: dragState, navigatorBusy: Boolean(navigator?.busy),
    editorBusy: Boolean(editorController?.isSaving() || ownership.blocked())
  });
  if (blocked) {
    lastClickDiagnostic = { reason: blocked, operation: 'fit' };
    publish();
    return;
  }
  session.run('fit', () => ({ ok: true, fit: true }), { fit: false, eventKind: 'user' });
  syncController(); publish();
}
function createEditor() {
  editorAppliedOperation = null;
  if (deleteConfirmation) { deleteConfirmation.destroy(); deleteConfirmation = null; }
  for (const stale of [...overlayHost.querySelectorAll('.delete-confirm-backdrop')]) stale.remove();
  if (editorMenu) editorMenu.destroy();
  if (editorPanel) editorPanel.destroy();
  editorController = createEditorController();
  if (!attachmentViewer) attachmentViewer = createAttachmentViewer({
    document, host: overlayHost,
    onState: ({ state, message }) => {
      lastClickDiagnostic = { reason: 'attachment-viewer-state', id: viewerDiagnosticId, state, viewerRequested: true, viewerOpened: state === 'ready', error: state === 'error' || state === 'unavailable' || state === 'review' || state === 'unsupported' ? message : null };
      if (state === 'unavailable' || state === 'review' || state === 'unsupported' || state === 'error') setShellStatus(String(message || 'This file cannot be previewed.'));
      publish();
    }
  });
  editorMenu = createEditorContextMenu({
    document,
    host: overlayHost,
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    onAction: (target, action) => chooseEditorAction(target, action)
  });
  deleteConfirmation = createDeleteConfirmation({ document, host: overlayHost, onConfirm: (value) => executeDeleteConfirmation(value), onCancel: () => { lastClickDiagnostic = { reason: 'delete-cancelled' }; publish(); } });
  editorPanel = createEditorPanel({
    document, summaryHost: detailsEl, editorHost, controller: editorController,
    canEdit: () => !ownership.blocked() && !destroying && !navigator?.busy && !dragState && editorAdmissionAllowed(),
    attachments: () => attachmentRegistry,
    getIdentity: () => ({ datasetToken, baseRevision: dataRevision }),
    onSave: (value) => saveEditorAction(value),
    onFormShown: () => { revealDetailsForEditor(); syncPersistenceControls(); },
    onState: (state) => { if (state?.reason === 'editor-cancelled' || state?.reason === 'editor-applied-closed' || state?.reason === 'editor-applied-replaced') { editorAppliedOperation = null; if (state.reason === 'editor-cancelled') { const pending = pendingBackupImport; if (pending) { pendingBackupImport = null; pending.registry?.clear?.(); setShellStatus('Backup import cancelled. The editor draft was preserved.'); } } } if (state?.reason === 'editor-continued' && pendingBackupImport) { const pending = pendingBackupImport; pendingBackupImport = null; pending.registry?.clear?.(); setShellStatus('Backup import cancelled. The editor draft was preserved.'); } syncPersistenceControls(); syncDetailsToggleState(); publish(); },
    onRetryApplied: () => retryAppliedEditorPersistence(),
    onSaveAs: () => saveAppliedEditorAs(),
    onDiscardIntent: (intent) => handlePendingIntent(intent)
  });
}
function appliedOperationOwner({ targetId, action }) {
  return { session: persistenceSessionSeq, datasetToken, revision: dataRevision, ownership: documentOwnershipSeq, formToken: editorPanel?.getFormToken?.() ?? null, controller: editorController, targetId, action, documentName: activeDocument.name, documentHandle: activeDocument.handle, persisting: false };
}
function appliedOperationOwns(operation) {
  return Boolean(operation
    && editorAppliedOperation === operation
    && operation.session === persistenceSessionSeq
    && operation.datasetToken === datasetToken
    && operation.controller === editorController
    && operation.formToken === editorPanel?.getFormToken?.()
    && editorController?.isOpen());
}
async function saveAppliedEditorAs() {
  const operation = editorAppliedOperation;
  if (!operation || !appliedOperationOwns(operation)) return { ok: false, reason: 'no-applied-edit' };
  const result = await saveCurrentDocument({ context: 'editor-save-as', saveAs: true, allowEditorOpen: true });
  if (result?.ok) {
    if (editorPanel?.completeAppliedFromPersistence?.() === true) editorAppliedOperation = null;
  } else if (result?.reason !== 'conflict-cancelled' && result?.reason !== 'cancelled') {
    editorPanel?.showSaveError?.(UNSAVED_MESSAGE);
  }
  return result;
}

async function retryAppliedEditorPersistence() {
  const operation = editorAppliedOperation;
  if (!operation) return { ok: false, message: 'No applied edit is waiting for persistence.' };
  if (operation.persisting) return { ok: false, message: 'A persistence retry is already running.' };
  if (!appliedOperationOwns(operation)) { if (editorAppliedOperation === operation) editorAppliedOperation = null; return { ok: false, message: 'The applied form no longer owns this retry.' }; }
  operation.persisting = true;
  try {
    let persisted;
    try { persisted = await saveCurrentDocument({ context: 'editor', capturedRevision: operation.revision, allowEditorOpen: true, expectedOwnership: operation.ownership, expectedSession: operation.session, expectedDataset: operation.datasetToken }); }
    catch (error) { persisted = { ok: false, message: String(error?.message || error) }; }
    if (!appliedOperationOwns(operation)) return { ok: false, reason: 'stale' };
    if (persisted?.handoff) return { ok: false, applied: true, handoff: true, message: 'Download started. FileOrbit cannot confirm that the file was saved. Retry Save or Close; the change is already applied.' };
    if (persisted?.ok) { pendingEditorConflictCompletion = false; if (editorAppliedOperation === operation) editorAppliedOperation = null; return { ok: true }; }
    if (persisted?.reason === 'stale-generation') pendingEditorConflictCompletion = true;
    automaticSaveFailure = null;
    automaticSavePending = null;
    syncAutomaticSaveFeedback();
    return { ok: false, applied: true, message: UNSAVED_MESSAGE };
  } finally { operation.persisting = false; }
}
async function saveEditorAction({ action, name, description, dataType, link, linkProvided, file, classification, attachmentId, targetId, datasetToken: draftToken, baseRevision: draftRevision, formToken: saveFormToken }) {
  if (editorAppliedOperation) { if (editorAppliedOperation.formToken === editorPanel?.getFormToken?.()) return retryAppliedEditorPersistence(); editorAppliedOperation = null; }
  if (ownership.recoveryFailed) return { ok: false, message: 'Editing is inert after a failed recovery.' };
  if (navigator?.busy) return { ok: false, message: 'A transition is active.', reason: 'transition-busy' };
  if (dragState) return { ok: false, message: 'A drag is active.', reason: 'drag-busy' };
  if (!editorController || editorController.mode !== 'saving') return { ok: false, reason: 'not-saving', message: 'Editor form is not active.' };
  const old = { tree, graph, baseLayout, model, session, navigator };
  const historyViewBefore = captureHistoryView();
  const historyViewAfter = { ...historyViewBefore, detailsTargetId: targetId };
  const commit = (candidate, candidateSession) => {
    tree = candidate.tree;
    graph = candidate.graph;
    baseLayout = candidate.baseLayout;
    model = candidate.model;
    session = candidateSession;
    runtimeAccess.advanceRevision();
    if (action === 'add-folder' || action === 'add-data') {
      detailsTargetId = resolvePostOperationDetails({ operation: action, parentId: targetId, model: candidate.model, graph: candidate.graph });
    } else {
      detailsTargetId = targetId;
    }
    navigator = null;
    createNavigator();
    createNavigation();
  };
  const recover = () => {
    tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model;
    session = old.session; navigator = old.navigator;
    frameState = null;
    const recovered = recoverAuthoritativeSession(old.session);
    if (!recovered) ownership.markRecoveryFailure();
    if (!recovered) { linkFrameReady = false; overlay?.deactivateLinks(); }
    return recovered;
  };
  const base = {
    history, historyViewBefore, historyViewAfter,
    tree, graph, baseLayout, model, session,
    datasetToken: draftToken ?? datasetToken,
    baseRevision: draftRevision ?? dataRevision, policyContext: largeMapPolicyContext,
    expectedDatasetToken: datasetToken, expectedRevision: dataRevision,
    structuralRootId: model.structuralRootId,
    viewport: viewport(), baseRadiusCss: baseRadius(), phase: 'current',
    frame: installFrame,
    invalidate: () => { frameState = null; },
    setCandidateEnv: (env) => { candidateEnv = env; },
    commit, recover
  };
  let attachmentMetadata = null;
  if (action === 'add-data' && dataType === 'file') {
    attachmentMetadata = attachmentRegistry.metadata(attachmentId);
    if (!attachmentMetadata) return { ok: false, reason: 'attachment-missing', message: 'The pending attachment is no longer available.', field: 'file' };
    if (!attachmentMetadata.classification) return { ok: false, reason: 'attachment-classification-missing', message: 'The pending file is not classified.', field: 'file' };
  }
  let result;
  if (action === 'rename') {
    result = performRenameInstallation({ ...base, targetId, draftName: name });
  } else if (action === 'add-folder' || action === 'add-data') {
    result = performAddChildInstallation({
      ...base,
      parentId: targetId,
      kind: action === 'add-folder' ? 'folder' : 'file',
      draftName: name,
      draftDescription: description,
      draftLink: link,
      draftDataType: dataType,
      draftAttachment: attachmentMetadata,
      parentDepth: baseLayout.depths?.get(targetId),
      allocator: idAllocator
    });
  } else if (action === 'edit-details') {
    result = performMetadataInstallation({ ...base, targetId, description, link, linkProvided });
  } else if (action === 'edit-folder') {
    result = performEditFolderInstallation({ ...base, targetId, draftName: name, draftDescription: description });
  } else if (action === 'edit-data') {
    result = performEditDataInstallation({ ...base, targetId, draftName: name, description, link, linkProvided });
  } else {
    result = { ok: false, reason: 'unknown-action', message: 'Unsupported editor action.' };
  }
  if (!result.ok) { publish(); return result; }
  if (attachmentMetadata) attachmentRegistry.commit(attachmentMetadata.attachmentId);
  sweepAttachments();
  publish();
  if (!mapDirty()) return { ...result, reason: 'noop', noPersistence: true };
  scheduleRecoveryCheckpoint();
  const owner = appliedOperationOwner({ targetId, action });
  editorAppliedOperation = owner;
  let persisted;
  try { persisted = await saveCurrentDocument({ context: 'editor', capturedRevision: owner.revision, allowEditorOpen: true, expectedOwnership: owner.ownership, expectedSession: owner.session, expectedDataset: owner.datasetToken }); }
  catch (error) { persisted = { ok: false, message: String(error?.message || error) }; }
  if (!appliedOperationOwns(owner)) return { ok: false, reason: 'stale' };
  if (persisted?.handoff) return { ok: false, applied: true, handoff: true, message: 'Download started. FileOrbit cannot confirm that the file was saved. Retry Save or Close; the change is already applied.' };
  if (persisted?.ok) { if (editorAppliedOperation === owner) editorAppliedOperation = null; return { ...result, persisted: true }; }
  if (persisted?.reason === 'stale-generation') pendingEditorConflictCompletion = true;
  automaticSaveFailure = null;
  automaticSavePending = null;
  syncAutomaticSaveFeedback();
  return { ok: false, applied: true, reason: 'applied-unsaved', message: UNSAVED_MESSAGE, persistence: persisted };
}

function resolveClickIntent(event) {
  if (!frameState || !surface) return null;
  let point;
  try { point = clientToCanvasCss(surface.canvas, event.clientX, event.clientY); } catch { return null; }
  const id = hitTestNode(frameState.hit, point);
  if (!id) return createSelectionIntent({ kind: 'background-clear', datasetToken, baseRevision: dataRevision });
  const node = graph.nodes.get(id);
  if (!node) return null;
  return createSelectionIntent({ kind: node.kind === 'folder' ? 'folder-enter' : 'node-select', targetId: id, hitKind: node.kind, datasetToken, baseRevision: dataRevision });
}

function handlePendingIntent(intent) {
  if (!intent) return;
  if (intent?.kind === 'backup-import') {
    const request = pendingBackupImport; pendingBackupImport = null;
    if (!request || intent.requestId !== request.id || request.session !== persistenceSessionSeq || request.dataset !== datasetToken || request.revision !== dataRevision) { setShellStatus('The map changed before the editor draft was resolved. Backup import was cancelled.'); request?.registry?.clear?.(); return; }
    editorPanel?.clear?.(); pendingBackupImport = request;
    requestBackupReplacementDecision(request).catch((error) => { request.registry?.clear?.(); setShellStatus('Backup import failed: ' + String(error?.message || error)); });
    return;
  }
  if (intent?.kind === 'create-map') { startCreateMap({ skipDirty: true }); return; }
  if (intent?.kind === 'open-map') {
    const request = pendingOpenRequest;
    pendingOpenRequest = null;
    if (!request || intent.requestId !== request.id || request.session !== persistenceSessionSeq || request.datasetToken !== datasetToken) {
      setShellStatus('The map changed before the editor draft was resolved. Open was cancelled.');
      return;
    }
    requestOpenSavedMaps({ skipDraft: true });
    return;
  }
  if (intent?.kind === 'search-activate') { activateSearchResult(intent.result, { skipDirty: true }).catch((error) => searchView?.showError(String(error?.message || error))); return; }
  if (intent?.kind === 'delete-request') {
    const checked = validateDeleteIntent({ intent, datasetToken, baseRevision: dataRevision, graph, visibleSet: model.view().visibleSet });
    if (!checked.ok) { lastClickDiagnostic = { reason: checked.reason, id: intent.target?.id ?? null }; publish(); return; }
    requestDeleteConfirmation(intent.target, intent.action, { expectedDatasetToken: intent.datasetToken, expectedBaseRevision: intent.baseRevision, afterDiscard: true });
    return;
  }
  if (intent.kind === 'editor-target' || intent.kind === 'editor-action') {
    resumeEditorAction({
      target: intent, editorController, graph, visibleSet: model.view().visibleSet,
      datasetToken, baseRevision: dataRevision,
      getDetails: (id) => model.details(id),
      openAction: (details, action) => editorPanel.openAction(details, action),
      requestPrompt: (pending) => editorPanel.requestSelection(pending),
      onDiagnostic: (diagnostic) => { lastClickDiagnostic = diagnostic; }
    });
    publish();
    return;
  }
  executePendingIntent(intent);
}
function activateEditorTarget(target, event) {
  const blocked = editorActivationBlockReason({
    editorInert: ownership.blocked(), navigatorBusy: Boolean(navigator?.busy), dragOwned: Boolean(dragState),
    editorSaving: Boolean(editorController?.isSaving()), frameReady: Boolean(frameState?.hit) || Boolean(largeMapView?.isActive()), replacementPending: Boolean(replacementGuard)
  });
  if (blocked) {
    lastClickDiagnostic = { reason: 'context-menu-blocked', cause: blocked, id: target?.id ?? null };
    publish();
    return false;
  }
  if (!event || event.type !== 'contextmenu' || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    lastClickDiagnostic = { reason: 'context-menu-invalid-event', id: target?.id ?? null };
    publish(); return false;
  }
  const details = model.details(target.id);
  if (!details || details.kind !== target.kind || (!model.view().visibleSet.has(target.id) && !largeMapView?.isActive()) || !graph.nodes.get(target.id)) {
    lastClickDiagnostic = { reason: 'context-menu-stale-or-invisible', id: target?.id ?? null };
    publish(); return false;
  }
  const canonical = createEditorTarget({
    id: target.id, hitKind: target.kind, name: details.name, datasetToken, baseRevision: dataRevision
  });
  const opened = openEditorMenu({ target: { ...canonical, isRoot: target.id === model.structuralRootId }, event, openMenu: (value) => editorMenu.open(value) });
  lastClickDiagnostic = { reason: opened ? 'context-menu-opened' : 'context-menu-open-failed', id: target.id };
  publish();
  return opened;
}
function chooseEditorAction(target, action) {
  try {
    return dispatchEditorMenuAction({ action, target, requestDelete: requestDeleteConfirmation, dispatchEditor: runEditorMenuAction });
  } catch (error) {
    lastClickDiagnostic = { reason: 'menu-action-failed', id: target?.id ?? null, error: String(error?.message || error) };
    publish();
    return { ok: false, reason: 'menu-action-failed', error };
  }
}
const runEditorMenuAction = createEditorMenuAdapter({
  getIdentity: () => ({ datasetToken, baseRevision: dataRevision }),
  choose: chooseEditorActionFlow,
  getDependencies: () => ({
    editorController, graph, visibleSet: model.view().visibleSet,
    getDetails: (id) => model.details(id),
    openAction: (details, selectedAction) => editorPanel.openAction(details, selectedAction),
    requestPrompt: (pending) => editorPanel.requestSelection(pending),
    onDiagnostic: (diagnostic) => { lastClickDiagnostic = diagnostic; }
  })
});
function chooseEditorTarget(target) {
  return chooseEditorAction(target, 'rename');
}function executePendingIntent(intent) {
  if (!intent || ownership.blocked()) return;
  const checked = validateSelectionIntent({ intent, datasetToken, baseRevision: dataRevision, graph, visibleSet: model.view().visibleSet });
  if (!checked.ok) {
    lastClickDiagnostic = { reason: checked.reason, id: intent.targetId || null };
    publish();
    return;
  }
  if (intent.kind === 'background-clear') {
    const result = session.run('clear-selection', () => { model.clearSelection(); return { ok: true, fit: false }; }, { fit: false, eventKind: 'user' });
    if (result.ok) detailsTargetId = null;
    if (!result.ok) lastClickDiagnostic = { reason: 'background-frame-failed', error: result.error?.message };
    publish();
    return;
  }
  const node = checked.node;
  if (node.kind === 'folder') {
    const priorFocused = model.focusedFolderId;
    const result = enterFolder(intent.targetId);
    if (result.ok) detailsTargetId = intent.targetId;
    syncController();
  } else {
    const priorSelected = model.selectedId;
    const result = session.run('select-file', () => ({ ...model.select(intent.targetId), fit: false }), { fit: false, eventKind: 'user' });
    if (!result.ok) lastClickDiagnostic = { reason: 'pending-select-failed', id: intent.targetId, error: result.error?.message };
    if (result.ok) { detailsTargetId = intent.targetId; if (intent.openAttachment) openAttachmentViewer(intent.targetId); }
  }
  publish();
}
function refreshCanvasTheme() {
  if (!surface || !frameState?.scene || !model || navigator?.busy || creationSuspension || !hasMap) return;
  drawCurrentGraphScene(frameState.scene, { selectedId: model.selectedId });
}
function publish(state = session?.getState()) {
  syncSearchControls();
  if (destroying) return;
  syncPersistenceControls();
  if (creationSuspension) { syncHistoryControls(); window.__M5_EXPLORATION_STATUS__ = { hasMap, datasetToken, creationSuspended: true, editor: { mode: editorController?.mode || 'closed', dirty: Boolean(editorController?.dirty), saving: Boolean(editorController?.saving), inert: ownership.recoveryFailed, creationOwned: ownership.creationOwned } }; return; }
  if (!hasMap) { syncHistoryControls(); return; }
  if (!state) return;
  if (overlay) {
    if (linkFrameReady && !transitionLabels && state.hitActive && frameState?.hit) overlay.activateLinks();
    else if (!transitionLabels) overlay.deactivateLinks();
  }
  const view = model.view();
  const details = detailsTargetId ? model.details(detailsTargetId) : null;
  const containment = frameState?.containment || null;
  const status = {
  hasMap,
    structuralRootId: model.structuralRootId,
    datasetToken,
    focusedFolderId: model.focusedFolderId,
    focusedStructuralDepth: view.focusedStructuralDepth,
    contextCount: view.contextCount,
    subtreeCount: view.subtreeCount,
    contextOverlapCount: view.contextOverlapCount,
    displayRootId: frameState?.filtered?.focusedFolderId || null,
    selectedId: model.selectedId,
    detailsTargetId,
    editorTargetId: editorController?.targetId || null,
    editorAction: editorController?.action || null,
    idCounter: idAllocator?.counter ?? null,
    menuTargetId: editorMenu?.target?.id || null,
    menuOpen: Boolean(editorMenu?.isOpen),
    ancestorCount: view.ancestorIds.length,
    descendantCount: view.descendantIds.length - 1,
    visibleCount: view.visibleIds.length,
    totalCount: graph?.nodes.size || 0,
    hiddenCount: (graph?.nodes.size || 0) - view.visibleIds.length,
    visibleEdgeCount: view.visibleEdgeCount,
    focusedCenterError: containment?.centerError ?? null,
    framingMode: state.framing,
    camera: state.camera,
    containment: containment ? {
      contained: containment.contained,
      containedCount: containment.containedCount,
      totalCount: containment.totalCount,
      centeredId: containment.centeredId,
      centerError: containment.centerError
    } : null,
    generation,
    hitActive: Boolean(frameState?.hit),
    labelMetrics: overlay?.getMetrics?.() || null,
    linkReady: linkFrameReady,
    lastEvent: state.lastEvent,
    lastClickDiagnostic,
    drag: dragState ? { sourceId: dragState.sourceId, targetId: dragState.targetId, started: dragState.started } : null,
    feedback: dragFeedbackEl ? dragFeedbackEl.textContent : '',
    transition: navigator?.busy ? { active: navigator.busy, state: navigator.transition.getState(), durationMs: navigator.transition.duration } : null,
    error: state.error ? String(state.error.message || state.error) : error,
    installing: state.installing,
    fitProjection: { width: viewport().width, height: viewport().height, radius: baseRadius() * (baseLayout?.feasibility.workspaceScale || 1) },
    lifecycle: { installing: state.installing, hitActive: Boolean(frameState?.hit) },
    revision: dataRevision,
    revision: dataRevision,
    persistence: { hasMap, mapId: activeMap?.mapId || null, generation: activeMap?.generation || null, savedRevision: activeMap?.savedRevision ?? null, dirty: mapDirty(), busy: persistenceBusy, guard: Boolean(replacementGuard), unavailable: Boolean(persistenceUnavailable), lastResult: lastPersistenceResult },
    visibleNodeIds: [...view.visibleIds],
    hitNodeIds: frameState?.hit ? frameState.hit.nodes.filter((node) => node.kind === 'folder').map((node) => node.id) : [],
    editor: { mode: editorController?.mode || 'closed', dirty: Boolean(editorController?.dirty), saving: Boolean(editorController?.saving), inert: ownership.recoveryFailed, creationOwned: ownership.creationOwned, limit: EDITOR_MAX_NODES },
    controller: navigation ? navigation.getState() : null
  };
  syncHistoryControls();
  window.__M5_EXPLORATION_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
  errorEl.textContent = status.error || '';
  countsEl.textContent = `${status.visibleCount} visible / ${status.totalCount} total`;
  renderDetails(details);
  syncLargeMapPresentation();
  if (searchQuery && tree && (lastSearchDataset !== datasetToken || lastSearchRevision !== dataRevision)) runSearch();
}
function renderDetails(details) {
  if (detailsEl) { const node = detailsTargetId ? graph?.nodes.get(detailsTargetId) : null; detailsEl.textContent = node ? `${node.name} · ${node.kind}` : (hasMap ? 'Select an item to view details' : 'No map loaded'); }
  if (detailsDescriptionEl) { const detailNode = detailsTargetId === tree?.id ? tree : tree?.children?.find?.((child) => child.id === detailsTargetId);
    const rootShown = Boolean(tree?.name && detailsEl.textContent.startsWith(`${tree.name} ·`));
    const description = details?.description ?? nodeDescription(detailNode) ?? (rootShown ? nodeDescription(tree) : null); const value = typeof description === 'string' && description.length ? description : null; detailsDescriptionEl.textContent = value || ''; detailsDescriptionEl.hidden = !value; }
  editorPanel?.setDetails(details);
}
function startViewportObserver() {
  if (resizeObserver || typeof ResizeObserver !== 'function' || !graphViewport) return;
  resizeObserver = new ResizeObserver(() => scheduleViewportResize());
  resizeObserver.observe(graphViewport);
}
function stopViewportObserver() {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  if (resizeFrame !== null) { cancelAnimationFrame(resizeFrame); resizeFrame = null; }
  lastViewportSize = { width: -1, height: -1 };
}
function scheduleViewportResize() {
  if (resizeFrame !== null) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    handleViewportResize();
  });
}
function handleViewportResize() {
  if (!baseLayout || !session) return;
  const size = viewport();
  if (size.width <= 0 || size.height <= 0) return;
  if (navigator?.busy) { pendingViewportResize = true; return; }
  if (size.width === lastViewportSize.width && size.height === lastViewportSize.height) return;
  lastViewportSize = size;
  deleteConfirmation?.close({ restoreFocus: false });
  const state = session.getState();
  const outcome = performViewportResizeAction({
    session, fit: state.framing === 'fit',
    cancelTransition: () => { if (navigator) { navigator.cancel('resize'); navigator = null; } },
    teardown: () => {
      if (dragGesture) { dragGesture.destroy(); dragGesture = null; }
      if (labelDragGesture) { labelDragGesture.destroy(); labelDragGesture = null; }
      editorMenu?.close({ restoreFocus: false });
      cleanupDrag();
      if (navigation) { navigation.destroy(); navigation = null; }
      if (overlay) { overlay.destroy(); overlay = null; }
      if (surface) { surface.destroy(); surface = null; }
      transitionLabels = false;
      linkFrameReady = false;
    },
    recreate: () => { createSurface(); destroying = false; },
    createNavigator: () => createNavigator(),
    createNavigation: () => createNavigation(),
    onFailure: ({ reason, error }) => {
      navigationInert = true;
      frameState = null;
      linkFrameReady = false;
      lastViewportSize = { width: -1, height: -1 };
      if (navigation) { navigation.destroy(); navigation = null; }
      lastClickDiagnostic = { reason, error: String(error?.message || error || 'resize failed') };
    },
    onSuccess: () => { navigationInert = false; }
  });
  publish();
  if (!outcome.ok) return;
}

let lastSearchDataset = null;
let lastSearchRevision = null;
function resetSearchForDataset() {
  clearTransientShellStatus();
  hoveredId = null;
  setSearchHighlightIds([]);
  searchRevealWaiter.cancel('dataset-replaced');
  pendingSearchActivation = null;
  searchQuery = '';
  searchResultIds = new Set();
  searchPage = 1; searchPageCount = 1;
  if (searchInput) searchInput.value = '';
  if (searchView) { if (hasMap) searchView.showInitial(); else searchView.showNoMap(); }
  lastSearchDataset = null; lastSearchRevision = null;
}
function clearSearch() {
  setSearchHighlightIds([]);
  searchQuery = '';
  searchResultIds = new Set();
  searchPage = 1; searchPageCount = 1;
  if (searchInput) { searchInput.value = ''; searchInput.focus?.(); }
  if (searchView) searchView.showInitial();
  refreshLabelPriority();
  lastSearchDataset = null; lastSearchRevision = null;
}
function setSearchHighlightIds(ids) {
  const next = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  const changed = next.size !== searchHighlightIds.size || [...next].some((id) => !searchHighlightIds.has(id));
  searchHighlightIds = next;
  if (searchHighlightStatusEl) searchHighlightStatusEl.textContent = next.size > 0 ? `Search highlights ${next.size} folder${next.size === 1 ? '' : 's'} containing matching results.` : '';
  if (changed) refreshCanvasTheme();
}

function goToSearchPage(delta) {
  if (!searchQuery || !searchView) return;
  searchPage = Math.max(1, Math.min(searchPageCount || 1, searchPage + Number(delta || 0)));
  runSearch();
}
function runSearch({ resetPage = false } = {}) {
  if (!searchView || !searchInput) return;
  const raw = String(searchInput.value ?? '');
  if (raw.trim() && detailsPanel?.dataset.collapsed === 'true') setDetailsCollapsed(false);
  searchQuery = raw;
  if (resetPage) searchPage = 1; if (!tree || raw.trim().length === 0) { setSearchHighlightIds([]); searchResultIds = new Set(); searchPage = 1; searchPageCount = 1; searchView.showInitial(); refreshLabelPriority(); lastSearchDataset = datasetToken; lastSearchRevision = dataRevision; return; }
  const payload = searchTree(tree, raw, { page: searchPage, datasetToken, revision: dataRevision }); searchPage = payload.ok ? payload.page : 1; searchPageCount = payload.ok ? payload.pageCount : 0;
  setSearchHighlightIds(payload.ok ? payload.folderIds : []);
  searchResultIds = new Set(payload.ok ? payload.results.map((result) => result.id) : []);
  searchView.render(payload);
  refreshLabelPriority();
  lastSearchDataset = datasetToken; lastSearchRevision = dataRevision;
}
async function navigateSearchParent({ folderId, targetId, datasetToken: token, revision }) {
  if (folderId === model.focusedFolderId) return { ok: true, immediate: true };
  const wait = searchRevealWaiter.begin({ folderId, targetId, parentId: folderId, datasetToken: token, revision });
  if (!wait.ok) return wait;
  const nav = enterFolder(folderId);
  if (!nav.ok) { searchRevealWaiter.clear(); return { ok: false, reason: nav.reason, message: 'Could not reveal the result scope.' }; }
  if (nav.mode !== 'transition') { searchRevealWaiter.clear(); return { ok: true, immediate: true }; }
  try { await wait.promise; } catch (error) { return { ok: false, reason: 'navigation-failed', message: String(error?.message || error) }; }
  return { ok: true, immediate: false };
}
function selectSearchData(result) {
  const checked = validateSearchActivation({ tree, id: result.id, datasetToken, revision: dataRevision, expectedDatasetToken: result.datasetToken, expectedRevision: result.revision });
  if (!checked.ok) { runSearch(); searchView?.showError(checked.message); return false; }
  if (largeMapView?.isActive()) { detailsTargetId = result.id; searchView?.setActive(result.id); largeMapView.reveal(result.id); publish(); const mapped = model.details(result.id); if (mapped?.dataType === 'file' && mapped.attachment) openAttachmentViewer(result.id); return true; }
  const run = session.run('select-file', () => ({ ...model.select(result.id), fit: false }), { fit: false, eventKind: 'user' });
  if (!run.ok) { searchView?.showError('The result could not be selected.'); return false; }
  detailsTargetId = result.id;
  searchView?.setActive(result.id);
  refreshCanvasTheme();
  publish();
  const details = model.details(result.id);
  if (details?.dataType === 'file' && details.attachment) openAttachmentViewer(result.id);
  return true;
}
async function activateSearchResult(result, { skipDirty = false } = {}) {
  if (replacementGuard) return { ok: false, reason: 'replacement-pending' };
  if (!result || !searchView) return { ok: false, reason: 'search-unavailable' };
  if (ownership.blocked() || deleteConfirmation?.isOpen || editorController?.isSaving() || dragState || navigator?.busy || attachmentViewer?.isOpen) {
    searchView.showError('Finish the current action or close the open dialog before activating a result.');
    return { ok: false, reason: 'blocked' };
  }
  const checked = validateSearchActivation({ tree, id: result.id, datasetToken, revision: dataRevision, expectedDatasetToken: result.datasetToken, expectedRevision: result.revision });
  if (!checked.ok) { runSearch(); searchView.showError(checked.message); return checked; }
  if (editorController?.isOpen()) {
    if (editorController.dirty && !skipDirty) {
      const decision = editorPanel.requestSelection({ kind: 'search-activate', result });
      if (decision.blocked) return { ok: false, reason: 'dirty-prompt', blocked: true };
    }
    if (editorController.isOpen()) editorController.cancel();
  }
  const token = datasetToken; const revision = dataRevision;
  if (largeMapView?.isActive()) {
    const revealed = largeMapView.reveal(result.id);
    if (!revealed) { searchView.showError('The result could not be revealed in the large-map presentation.'); return { ok: false, reason: 'reveal-failed' }; }
    if (datasetToken !== token || dataRevision !== revision) { searchView.showError('The map changed. Search again.'); runSearch(); return { ok: false, reason: 'stale' }; }
    detailsTargetId = result.id; searchView.setActive(result.id); publish();
    const mapped = model.details(result.id);
    if (mapped?.dataType === 'file' && mapped.attachment) openAttachmentViewer(result.id);
    return { ok: true, kind: checked.node.kind === 'folder' ? 'folder' : 'data', id: result.id };
  }
  if (checked.node.kind === 'folder') {
    if (model.focusedFolderId !== result.id) {
      const nav = await navigateSearchParent({ folderId: result.id, targetId: result.id, datasetToken: token, revision });
      if (!nav.ok) { searchView.showError(nav.message || 'The folder could not be opened.'); return nav; }
    }
    if (datasetToken !== token || dataRevision !== revision) { searchView.showError('The map changed. Search again.'); runSearch(); return { ok: false, reason: 'stale' }; }
    detailsTargetId = result.id;
    searchView.setActive(result.id);
    refreshCanvasTheme();
    publish();
    return { ok: true, kind: 'folder', id: result.id };
  }
  if (!checked.parent) { searchView.showError('The data node has no parent scope.'); return { ok: false, reason: 'missing-parent' }; }
  if (model.focusedFolderId !== checked.parent.id || !model.view().visibleSet.has(result.id)) {
    const nav = await navigateSearchParent({ folderId: checked.parent.id, targetId: result.id, datasetToken: token, revision });
    if (!nav.ok) { searchView.showError(nav.message || 'The parent folder could not be opened.'); return nav; }
    if (datasetToken !== token || dataRevision !== revision) { searchView.showError('The map changed. Search again.'); runSearch(); return { ok: false, reason: 'stale' }; }
    const refreshed = validateSearchActivation({ tree, id: result.id, datasetToken, revision: dataRevision, expectedDatasetToken: token, expectedRevision: revision });
    if (!refreshed.ok || model.focusedFolderId !== checked.parent.id || !model.view().visibleSet.has(result.id)) {
      searchView.showError('The result is no longer visible in the installed frame.'); runSearch(); return { ok: false, reason: 'stale' };
    }
  }
  return selectSearchData(result) ? { ok: true, kind: 'data', id: result.id } : { ok: false, reason: 'selection-failed' };
}

function setMapPresentation(visible) {
  if (emptyState) emptyState.hidden = visible;
  if (host) host.hidden = !visible;
  if (labelHost) { labelHost.hidden = !visible; labelHost.style.visibility = visible ? 'visible' : 'hidden'; labelHost.style.pointerEvents = ''; }
  if (searchResultsHost) searchResultsHost.hidden = false;
  if (detailsEl) detailsEl.hidden = !visible;
  if (editorHost) editorHost.hidden = !visible;
  if (searchInput) { searchInput.disabled = !visible; searchInput.placeholder = visible ? 'Search map' : 'Create a map to search'; }
  if (fitButton) fitButton.disabled = !visible;
}
function countRecoveryTree(tree) {
  let folders = 0; let files = 0;
  const visit = (node) => {
    if (!node) return;
    if (node.kind === 'folder') folders += 1; else if (node.kind === 'file') files += 1;
    for (const child of node.children || []) visit(child);
  };
  visit(tree);
  return { folders, files };
}
function recoveryCandidateView(candidate) {
  const workspace = candidate.workspace; const checkpoint = candidate.checkpoint;
  const counts = countRecoveryTree(checkpoint.tree);
  return {
    workspaceId: workspace.workspaceId, workspaceToken: workspace.workspaceToken,
    checkpointId: checkpoint.checkpointId, checkpointGeneration: checkpoint.checkpointGeneration,
    name: checkpoint.tree?.name || workspace.documentName || 'Recovered map',
    capturedAt: checkpoint.createdAt || checkpoint.updatedAt || workspace.updatedAt,
    folderCount: counts.folders, fileCount: counts.files,
    nodeCount: checkpoint.nodeCount, attachmentBytes: checkpoint.attachmentBytes
  };
}
async function listRecoveryCandidateViews() {
  if (!persistenceRepository) return [];
  const candidates = await persistenceRepository.listRecoveryCandidates();
  return candidates.map(recoveryCandidateView);
}
function cancelRecoveryRequest(reason = 'cancelled') {
  const request = activeRecoveryRequest;
  if (!request) return false;
  request.cancelled = true; request.cancelReason = reason;
  activeRecoveryRequest = null;
  recoveryOperationToken += 1;
  recoveryOperationInFlight = false;
  startupRecoveryToken += 1;
  if (recoveryDialog?.isOpen) recoveryDialog.close({ restoreFocus: false, notify: false });
  return true;
}
function cancelStartupRecovery({ close = true } = {}) {
  startupRecoveryToken += 1;
  recoveryDiscoveryPending = false;
  cancelRecoveryRequest('workflow-start');
  if (close && recoveryDialog?.isOpen) recoveryDialog.close({ restoreFocus: false, notify: false });
}
async function startRecoveryDiscovery() {
  if (startupRecoveryAttempted || !persistenceRepository || !recoveryDialog || !recoveryScheduler) return;
  startupRecoveryAttempted = true;
  const token = ++startupRecoveryToken;
  recoveryDiscoveryPending = true;
  try {
    const views = await listRecoveryCandidateViews();
    if (token !== startupRecoveryToken || hasMap || destroying || persistenceBusy) return;
    if (!views.length) return;
    recoveryDialog.show(views);
  } catch (error) {
    if (token === startupRecoveryToken && !hasMap && !destroying) recoveryDiagnostic = { code: 'recovery-discovery-failed', message: String(error?.message || error) };
  } finally {
    if (token === startupRecoveryToken) recoveryDiscoveryPending = false;
  }
}
function createRecoveryRequest(kind, record) {
  return { id: ++recoveryOperationToken, kind, record: { ...record }, initialSession: persistenceSessionSeq, initialDataset: datasetToken, startupToken: startupRecoveryToken, cancelled: false, claim: null, runtime: null, child: null, installed: false, committedSession: null, committedDataset: null, destructiveStarted: false };
}
function requestIsActive(request) { return Boolean(request && activeRecoveryRequest === request && !request.cancelled && request.id === recoveryOperationToken && !destroying); }
function preInstallOwned(request) { return requestIsActive(request) && !hasMap && persistenceSessionSeq === request.initialSession && datasetToken === request.initialDataset; }
function postInstallOwned(request) { return requestIsActive(request) && hasMap && request.installed && persistenceSessionSeq === request.committedSession && datasetToken === request.committedDataset && attachmentRegistry === request.runtime?.registry; }
function finishRecoveryRequest(request) { if (activeRecoveryRequest === request) { activeRecoveryRequest = null; if (recoveryOperationToken === request.id) recoveryOperationToken += 1; recoveryOperationInFlight = false; } }
async function installRecoveredRuntime(runtime, request) {
  const prior = { hasMap, tree, graph, baseLayout, model, session, navigator, attachmentRegistry, history, idAllocator, detailsTargetId, datasetToken, dataRevision, activeMap, activeDocument, persistenceSessionSeq };
  if (hasMap) return { ok: false, reason: 'not-empty' };
  ensureCreateMapRuntime();
  prepareCandidateLabelContext();
  const current = () => preInstallOwned(request);
  let committed = false;
  const result = installCandidateEnvironment({
    candidate: runtime,
    operation: 'recovery-install',
    prepare: () => ({ ok: true, fit: true }),
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), initialFraming: 'fit',
    frame: installFrame,
    invalidate: () => { frameState = null; },
    setCandidateEnv: (env) => { candidateEnv = env; },
    beforeCommit: () => current() ? { ok: true } : { ok: false, message: 'The recovery request changed before installation.' },
    commit: (candidate, candidateSession) => {
      if (!current()) throw new Error('The recovery request changed before installation.');
      tree = candidate.tree; graph = candidate.graph; baseLayout = candidate.baseLayout; model = candidate.model;
      session = candidateSession; attachmentRegistry = candidate.registry; attachmentIds = new Map(candidate.attachmentIds);
      datasetToken = candidate.datasetToken; dataRevision = 0;
      clearActiveMap(); resetActiveDocument(); restoredMapAwaitingSave = true;
      creationSuspension = null; creationTerminal = null; persistenceSessionSeq += 1; lastPersistenceResult = null; persistenceLastError = null;
      history = createEditorHistory(); idAllocator = createEditorIdAllocator({ datasetToken });
      detailsTargetId = tree.id; hasMap = true; ownership.clearRecoveryFailure();
      setMapPresentation(true); resetSearchForDataset(); navigator = null; createNavigator(); createNavigation();
      oldAttachmentCleanup: {
        prior.attachmentRegistry?.clear?.();
        prior.history?.clear?.();
      }
      committed = true;
      lastClickDiagnostic = { reason: 'recovery-installed', id: tree.id };
    },
    recover: () => {
      runtimeAccess.dispose(runtime);
      return false;
    }
  });
  if (!result.ok) {
    if (!committed) startEmptyState();
    return result;
  }
  publish();
  return { ...result, committed: true };
}
async function releaseRecoveryClaim(record, claimId) {
  if (!claimId) return false;
  try { await persistenceRepository.releaseRecoveryClaim({ workspaceId: record.workspaceId, claimId }); return true; } catch { return false; }
}
async function releaseRecoveryRequestClaim(request) {
  const claimId = request?.claim?.claimId; const record = request?.record;
  if (!claimId || !record) return false;
  request.claim = null;
  return releaseRecoveryClaim(record, claimId);
}
async function recoverRecoveryCandidate(record) {
  if (!record || recoveryOperationInFlight || hasMap || destroying) return { ok: false, reason: 'busy' };
  const request = createRecoveryRequest('recover', record);
  activeRecoveryRequest = request; recoveryOperationInFlight = true;
  recoveryDialog?.setBusy(true); recoveryDialog?.setStatus('Preparing the recovery copy…');
  try {
    request.claim = await persistenceRepository.claimRecoverySource({
      workspaceId: record.workspaceId, expectedCheckpointGeneration: record.checkpointGeneration, expectedCheckpointId: record.checkpointId, ttlMs: 120000
    });
    if (!preInstallOwned(request)) { await releaseRecoveryRequestClaim(request); return { ok: false, reason: 'cancelled' }; }
    if (request.claim.checkpointGeneration !== record.checkpointGeneration || request.claim.checkpointId !== record.checkpointId) throw Object.assign(new Error('The recovery copy changed.'), { code: 'recovery-source-advanced' });
    const loaded = await persistenceRepository.loadRecoveryCheckpoint(record.workspaceId, record.checkpointGeneration);
    if (!preInstallOwned(request)) { await releaseRecoveryRequestClaim(request); return { ok: false, reason: 'cancelled' }; }
    if (!loaded?.checkpoint || loaded.checkpoint.checkpointId !== record.checkpointId) throw Object.assign(new Error('The recovery copy is incomplete or changed.'), { code: 'recovery-checkpoint-changed' });
    if (recoveryAfterClaimGate) { const gate = recoveryAfterClaimGate; recoveryAfterClaimGate = null; await gate; }
    request.runtime = reconstructSavedMapRuntime({
      loaded: { map: { mapId: null, generation: null, attachmentBytes: loaded.checkpoint.attachmentBytes, nodeCount: loaded.checkpoint.nodeCount }, document: { tree: loaded.checkpoint.tree, generation: null }, attachments: loaded.attachments },
      datasetToken: datasetToken + 1, viewport: viewport()
    });
    request.child = await persistenceRepository.createRecoveryWorkspace({
      forkedFrom: { workspaceId: record.workspaceId, workspaceToken: record.workspaceToken, checkpointId: record.checkpointId, checkpointGeneration: record.checkpointGeneration },
      claimId: request.claim.claimId, documentName: record.name, origin: 'recovery', sourceMapId: null
    });
    if (!preInstallOwned(request)) { runtimeAccess.dispose(request.runtime); request.runtime = null; await releaseRecoveryRequestClaim(request); return { ok: false, reason: 'cancelled' }; }
    const installedResult = await installRecoveredRuntime(request.runtime, request);
    if (!installedResult.ok) {
      runtimeAccess.dispose(request.runtime); request.runtime = null;
      await releaseRecoveryRequestClaim(request);
      if (requestIsActive(request)) { recoveryDialog?.setBusy(false); recoveryDialog?.setStatus('Recovery could not be installed. The recovery copy was preserved.', 'error'); }
      return installedResult;
    }
    request.installed = true; request.committedSession = persistenceSessionSeq; request.committedDataset = datasetToken;
    if (!postInstallOwned(request)) { await releaseRecoveryRequestClaim(request); return { ok: true, installed: true, cancelled: true }; }
    if (recoveryAfterInstallGate) { const gate = recoveryAfterInstallGate; recoveryAfterInstallGate = null; await gate; }
    if (!postInstallOwned(request)) { await releaseRecoveryRequestClaim(request); return { ok: true, installed: true, cancelled: true }; }
    let adopted = null;
    if (postInstallOwned(request)) {
      adopted = await recoveryScheduler?.adoptWorkspace({
        workspaceId: request.child.workspace.workspaceId, workspaceToken: request.child.workspace.workspaceToken,
        session: request.committedSession, dataset: request.committedDataset,
        authorized: () => postInstallOwned(request)
      });
      if (adopted) request.adoptedOwner = adopted;
    }
    if (!postInstallOwned(request)) {
      const current = recoveryScheduler?.workspace;
      if (request.adoptedOwner && current === request.adoptedOwner && current.workspaceId === request.child.workspace.workspaceId && current.workspaceToken === request.child.workspace.workspaceToken && current.active) recoveryScheduler.invalidate();
      await releaseRecoveryRequestClaim(request); return { ok: true, installed: true, cancelled: true };
    }
    if (!adopted) {
      recoveryDiagnostic = { code: 'recovery-adoption-failed', message: 'Recovered work is installed, but its recovery workspace could not be adopted.' };
      setShellStatus('Recovered unsaved work. Save to create a .orbit file. Recovery durability could not be secured.');
      if (recoveryDialog?.isOpen) recoveryDialog.close({ restoreFocus: false, notify: false });
      await releaseRecoveryRequestClaim(request);
      return { ok: true, installed: true, adopted: false };
    }
    let checkpointSecured = false;
    try { checkpointSecured = await recoveryScheduler.checkpointNow(); } catch {}
    if (!postInstallOwned(request)) { await releaseRecoveryRequestClaim(request); return { ok: true, installed: true, cancelled: true }; }
    if (checkpointSecured) {
      try {
        const childCheckpoint = await persistenceRepository.loadRecoveryCheckpoint(request.child.workspace.workspaceId);
        if (!postInstallOwned(request)) { await releaseRecoveryRequestClaim(request); return { ok: true, installed: true, cancelled: true }; }
        if (childCheckpoint?.checkpoint) {
          request.supersessionStarted = true;
          await persistenceRepository.supersedeRecoverySource({
            sourceWorkspaceId: record.workspaceId, sourceWorkspaceToken: record.workspaceToken,
            sourceCheckpointId: record.checkpointId, sourceCheckpointGeneration: record.checkpointGeneration,
            childWorkspaceId: request.child.workspace.workspaceId, childCheckpointGeneration: childCheckpoint.checkpoint.checkpointGeneration
          });
        } else if (postInstallOwned(request)) {
          recoveryDiagnostic = { code: 'recovery-child-incomplete', message: 'Recovered child checkpoint was not complete; the source copy was preserved.' };
        }
      } catch (error) { if (postInstallOwned(request)) recoveryDiagnostic = { code: error?.code || 'recovery-supersede-failed', message: String(error?.message || error) }; }
    } else if (postInstallOwned(request)) {
      recoveryDiagnostic = { code: 'recovery-child-checkpoint-failed', message: 'Recovered work is installed, but a durable child checkpoint was not created; the source copy was preserved.' };
    }
    await releaseRecoveryRequestClaim(request);
    if (postInstallOwned(request)) {
      setShellStatus(checkpointSecured ? 'Recovered unsaved work. Save to create a .orbit file.' : 'Recovered unsaved work. Save to create a .orbit file. Recovery durability could not be secured.');
      if (recoveryDialog?.isOpen) recoveryDialog.close({ restoreFocus: false, notify: false });
    }
    return { ok: true, installed: true, checkpointSecured };
  } catch (error) {
    if (request.runtime && !request.installed) runtimeAccess.dispose(request.runtime);
    if (!request.installed) request.runtime = null;
    await releaseRecoveryRequestClaim(request);
    if (requestIsActive(request) && !request.installed) { recoveryDialog?.setBusy(false); recoveryDialog?.setStatus('The recovery copy changed or could not be loaded. Refresh the list and try again.', 'error'); }
    return { ok: false, error };
  } finally {
    const wasActive = activeRecoveryRequest === request;
    finishRecoveryRequest(request);
    if (wasActive && !request.installed && recoveryDialog?.isOpen) recoveryDialog.setBusy(false);
  }
}
async function refreshRecoveryDialog(request = null) {
  if (request && !requestIsActive(request)) return [];
  try {
    const views = await listRecoveryCandidateViews();
    if (request && !requestIsActive(request)) return [];
    if (!recoveryDialog?.isOpen) return [];
    if (!views.length) { recoveryDialog.close({ restoreFocus: false, notify: false }); return []; }
    recoveryDialog.setCandidates(views); return views;
  } catch { return []; }
}
async function discardRecoveryCandidate(record) {
  if (!record || recoveryOperationInFlight || hasMap || destroying) return { ok: false, reason: 'busy' };
  const request = createRecoveryRequest('discard', record);
  activeRecoveryRequest = request; recoveryOperationInFlight = true;
  const discardOwned = () => requestIsActive(request) && !hasMap && persistenceSessionSeq === request.initialSession && datasetToken === request.initialDataset;
  recoveryDialog?.setBusy(true); recoveryDialog?.setStatus('Preparing to discard the selected recovery copy…');
  try {
    request.claim = await persistenceRepository.claimRecoverySource({
      workspaceId: record.workspaceId, expectedCheckpointGeneration: record.checkpointGeneration, expectedCheckpointId: record.checkpointId, ttlMs: 120000
    });
    if (!discardOwned()) { await releaseRecoveryRequestClaim(request); return { ok: false, reason: 'cancelled' }; }
    if (recoveryAfterClaimGate) { const gate = recoveryAfterClaimGate; recoveryAfterClaimGate = null; await gate; }
    if (!discardOwned()) { await releaseRecoveryRequestClaim(request); return { ok: false, reason: 'cancelled' }; }
    request.destructiveStarted = true;
    if (recoveryDiscardStartGate) { const gate = recoveryDiscardStartGate; recoveryDiscardStartGate = null; await gate; }
    await persistenceRepository.discardRecoveryWorkspace({
      workspaceId: record.workspaceId, workspaceToken: record.workspaceToken, claimId: request.claim.claimId,
      expectedCheckpointGeneration: record.checkpointGeneration, expectedCheckpointId: record.checkpointId
    });
    request.claim = null;
    if (!requestIsActive(request)) return { ok: true, destructiveStarted: true, cancelled: true };
    await refreshRecoveryDialog(request);
    return { ok: true };
  } catch (error) {
    await releaseRecoveryRequestClaim(request);
    if (requestIsActive(request)) { await refreshRecoveryDialog(request); recoveryDialog?.setStatus('That recovery copy changed or is in use. The list was refreshed; nothing was deleted.', 'error'); }
    return { ok: false, error };
  } finally {
    const wasActive = activeRecoveryRequest === request;
    finishRecoveryRequest(request);
    if (wasActive && recoveryDialog?.isOpen) recoveryDialog.setBusy(false);
  }
}
function startEmptyState() {
  resetActiveDocument();
  hasMap = false; creationSuspension = null; creationTerminal = null;
  syncSearchControls();
  persistenceSessionSeq += 1; clearActiveMap(); attachmentIds = new Map(); persistenceBusy = null; replacementGuard = null; pendingReplacement = null; lastPersistenceResult = null; persistenceLastError = null; restoredMapAwaitingSave = false;
  if (attachmentViewer?.isOpen) attachmentViewer.close();
  editorMenu?.close({ restoreFocus: false });
  cleanupDrag();
  tree = null; graph = null; baseLayout = null; model = null; session = null; navigator = null;
  if (navigation) { navigation.destroy(); navigation = null; }
  frameState = null; transitionLabels = false; linkFrameReady = false;
  history = null; historyToolbar?.sync();
  if (undoHistoryButton) undoHistoryButton.disabled = true;
  if (redoHistoryButton) redoHistoryButton.disabled = true;
  if (emptyState) emptyState.hidden = false;
  if (host) host.hidden = true;
  if (labelHost) { labelHost.hidden = true; labelHost.style.visibility = ''; labelHost.style.pointerEvents = ''; }
  if (detailsEl) { detailsEl.hidden = false; detailsEl.textContent = 'No map loaded'; }
  if (editorHost) { editorHost.hidden = true; editorHost.replaceChildren?.(); }
  if (searchResultsHost) searchResultsHost.hidden = false;
  if (searchInput) { searchInput.disabled = true; searchInput.value = ''; searchInput.placeholder = 'Create a map to search'; }
  if (fitButton) fitButton.disabled = true;
  searchQuery = ''; lastSearchDataset = null; lastSearchRevision = null;
  searchView?.showNoMap();
  window.__M5_EXPLORATION_STATUS__ = { hasMap: false, editor: { mode: 'closed', dirty: false, saving: false, inert: ownership.recoveryFailed, creationOwned: ownership.creationOwned } };
  if (createMapInitializationError) setShellStatus('Create Map failed to initialize: ' + String(createMapInitializationError?.message || createMapInitializationError));
}
function prepareCandidateLabelContext() {
  if (!labelHost) return;
  labelHost.hidden = false;
  labelHost.replaceChildren();
  labelHost.style.visibility = 'hidden';
  labelHost.style.pointerEvents = 'none';
}
function suspendMapForCreation() {
  const hadMap = hasMap && Boolean(tree && model && session);
  creationSuspension = hadMap ? {
    hasMap: true, focusedFolderId: model.focusedFolderId, selectedId: model.selectedId,
    detailsTargetId, camera: { ...session.getState().camera }, framing: session.getState().framing,
    viewport: viewport(), searchQuery, searchValue: searchInput?.value ?? '', datasetToken, revision: dataRevision
  } : { hasMap: false };
  syncSearchControls();
  creationTerminal = 'pending';
  if (attachmentViewer?.isOpen) attachmentViewer.close();
  editorMenu?.close({ restoreFocus: false });
  cleanupDrag();
  if (host) host.hidden = true;
  if (labelHost) { labelHost.hidden = true; labelHost.style.visibility = ''; labelHost.style.pointerEvents = ''; }
  if (detailsEl) detailsEl.hidden = true;
  if (editorHost) editorHost.hidden = true;
  if (searchResultsHost) searchResultsHost.hidden = true;
  if (emptyState) emptyState.hidden = true;
  if (searchInput) searchInput.disabled = true;
  if (fitButton) fitButton.disabled = true;
  overlay?.deactivateLinks();
  frameState = hadMap ? frameState : null;
  linkFrameReady = false;
}
function restoreSuspendedMap() {
  const suspended = creationSuspension; creationSuspension = null;
  if (!suspended || !suspended.hasMap) { startEmptyState(); return true; }
  if (ownership.recoveryFailed) {
    hasMap = false;
    if (emptyState) emptyState.hidden = false;
    if (host) host.hidden = true;
    if (labelHost) labelHost.hidden = true;
    if (detailsEl) { detailsEl.hidden = false; detailsEl.textContent = 'Map unavailable after recovery failure'; }
    if (editorHost) editorHost.hidden = true;
    if (searchResultsHost) searchResultsHost.hidden = false;
    searchView?.showNoMap();
    if (searchInput) { searchInput.disabled = true; searchInput.value = ''; searchInput.placeholder = 'Create a map to search'; }
    if (fitButton) fitButton.disabled = true;
    return false;
  }
  if (!session || !model || !tree) { startEmptyState(); return false; }
  hasMap = true;
  detailsTargetId = suspended.detailsTargetId;
  searchQuery = suspended.searchQuery;
  if (searchInput) { searchInput.value = suspended.searchValue; searchInput.disabled = false; searchInput.placeholder = 'Search map'; }
  if (fitButton) fitButton.disabled = false;
  if (emptyState) emptyState.hidden = true;
  const fit = suspended.framing === 'fit';
  const outcome = performViewportResizeAction({
    session,
    fit,
    cancelTransition: () => {
      if (navigator) { navigator.cancel('restore'); navigator = null; }
    },
    teardown: () => {
      if (dragGesture) { dragGesture.destroy(); dragGesture = null; }
      if (labelDragGesture) { labelDragGesture.destroy(); labelDragGesture = null; }
      editorMenu?.close({ restoreFocus: false });
      cleanupDrag();
      if (navigation) { navigation.destroy(); navigation = null; }
      if (overlay) { overlay.destroy(); overlay = null; }
      if (surface) { surface.destroy(); surface = null; }
      transitionLabels = false; linkFrameReady = false;
    },
    recreate: () => {
      if (host) host.hidden = false;
      if (labelHost) { labelHost.hidden = false; labelHost.style.visibility = 'visible'; labelHost.style.pointerEvents = ''; }
      createSurface(); destroying = false;
    },
    createNavigator: () => createNavigator(),
    createNavigation: () => createNavigation(),
    onFailure: ({ error }) => {
      lastCreationRestoreFailure = `The previous map could not be restored. ${String(error?.message || error || '')}`;
      frameState = null; linkFrameReady = false; navigationInert = true;
      ownership.markRecoveryFailure();
      if (host) host.hidden = true;
      if (labelHost) labelHost.hidden = true;
      if (editorHost) editorHost.hidden = true;
      if (searchResultsHost) searchResultsHost.hidden = true;
      if (detailsEl) { detailsEl.hidden = false; detailsEl.textContent = 'Map unavailable after restoration failure'; }
    }
  });
  if (!outcome.ok) return false;
  navigationInert = false;
  ownership.clearRecoveryFailure();
  if (emptyState) emptyState.hidden = true;
  if (host) host.hidden = false;
  if (labelHost) labelHost.hidden = false;
  if (detailsEl) detailsEl.hidden = false;
  if (editorHost) editorHost.hidden = false;
  if (searchResultsHost) searchResultsHost.hidden = false;
  if (searchQuery) runSearch(); else searchView?.showInitial();
  publish();
  return true;
}
function ensureCreateMapRuntime() {
  if (!surface) createSurface();
  if (!editorPanel) createEditor();
  if (!historyToolbar) historyToolbar = createHistoryToolbarController({
    undoButton: undoHistoryButton, redoButton: redoHistoryButton,
    getHistory: () => runtimeAccess.history(), getBlockedReason: () => historyBlockedReason(),
    run: (direction) => runtimeAccess.move(direction)
  });
  startViewportObserver();
}
function releasePendingCreateCandidate() {
  try { pendingCreateCandidate?.registry?.clear?.(); } catch {}
  pendingCreateCandidate = null;
}
function resetActiveDocument() { invalidateDocumentSave(); invalidateAutomaticSave(); resetDocumentOwnership(); orbitCurrentEntryKey = null; orbitCurrentSeq += 1; renderOrbitPanel(); }
function mapDirty() {
  if (!hasMap) return false;
  if (activeDocument.active && activeDocument.savedRevision !== null) return dataRevision !== activeDocument.savedRevision;
  return documentIsDirty(dataRevision);
}
function replacementNeedsConfirmation() {
  return Boolean(hasMap && mapDirty() && (dataRevision > 0 || activeMap?.mapId));
}
function persistenceBlockedReason({ ignoreEditor = false } = {}) {
  if (persistenceUnavailable) return persistenceUnavailable;
  if (persistenceBusy) return 'Storage is ' + persistenceBusy + '.';
  if (persistenceBlocked) return 'Storage is blocked by another FileOrbit tab. Close other tabs and retry.';
  if (ownership.blocked()) return 'Finish the current Create Map/Open operation first.';
  if (deleteConfirmation?.isOpen) return 'Finish the delete confirmation first.';
  if (!ignoreEditor && editorController?.isOpen()) return 'Finish or cancel the editor form first.';
  if (!ignoreEditor && editorController?.isSaving()) return 'Wait for the editor save to finish.';
  if (dragState) return 'Finish the drag first.';
  if (navigator?.busy) return 'Wait for the transition to finish.';
  if (session?.getState()?.installing) return 'Wait for the frame installation to finish.';
  return null;
}
function openRequestBlockedReason() {
  if (persistenceUnavailable) return persistenceUnavailable;
  if (persistenceBlocked) return 'Storage is blocked by another FileOrbit tab. Close other tabs and retry.';
  if (persistenceBusy) return 'Storage is ' + persistenceBusy + '.';
  if (ownership.blocked()) return 'Finish the current Create Map/Open operation first.';
  if (deleteConfirmation?.isOpen) return 'Finish the delete confirmation first.';
  if (editorController?.isSaving()) return 'Wait for the editor save to finish.';
  if (dragState) return 'Finish the drag first.';
  if (navigator?.busy) return 'Wait for the transition to finish.';
  if (session?.getState()?.installing) return 'Wait for the frame installation to finish.';
  return null;
}
function syncPersistenceControls() {
  if (saveStateEl) {
    let text = 'No map';
    let state = 'none';
    if (hasMap) {
      if (documentSaving) { text = 'Saving…'; state = 'dirty'; }
      else if (persistenceBusy === 'saving') { text = 'Saving to IndexedDB…'; state = 'dirty'; }
      else if (persistenceBusy === 'loading') { text = 'Loading…'; state = 'dirty'; }
      else if (persistenceUnavailable) { text = 'Storage unavailable'; state = 'error'; }
      else if (persistenceLastError) { text = persistenceLastError; state = 'error'; }
      else if (persistenceBlocked) { text = 'Storage blocked'; state = 'error'; }
      else if (!mapDirty()) { text = activeDocument.active ? 'Saved' : 'Saved to IndexedDB on this device'; state = 'saved'; }
      else if (restoredMapAwaitingSave) { text = 'Restored map — not saved yet'; state = 'dirty'; }
      else { text = 'Unsaved changes'; state = 'dirty'; }
    }
    saveStateEl.textContent = text;
    saveStateEl.dataset.state = state;
    saveStateEl.removeAttribute('title');
  }
  if (documentNameEl) {
    const baseName = hasMap ? (activeDocument.active ? (activeDocument.name || tree?.name || 'Untitled map') : (tree?.name || 'Unsaved map')) : 'No document';
    const outsideOrbit = Boolean(hasMap && activeDocument.active && activeDocument.origin === 'orbit' && (!orbitState.snapshot().handle || orbitCurrentEntryKey === null));
    documentNameEl.textContent = baseName + (outsideOrbit ? ' — outside Orbit' : '');
    documentNameEl.title = outsideOrbit ? 'This document is not currently listed in the active Orbit.' : baseName;
  }
  const editorRouting = Boolean(hasMap && editorController?.isOpen() && !editorController?.isSaving() && !persistenceBusy && !persistenceUnavailable && !persistenceBlocked && !ownership.blocked() && !navigator?.busy && !dragState && !session?.getState()?.installing && !replacementGuard);
  const saveBusy = Boolean(documentSaving || documentSaveInFlight);
  const saveAvailable = Boolean(!saveBusy && (editorRouting || (hasMap && mapDirty() && !persistenceBlockedReason() && !replacementGuard)));
  const openAvailable = Boolean(!openRequestBlockedReason() && !replacementGuard);
  const saveText = saveStateEl?.textContent || 'No map';
  const saveVisualState = saveStateEl?.dataset.state || 'none';
  const saveDescription = hasMap ? `Save changes (${saveText})` : 'Save changes';
  renderOrbitPanel();
  for (const button of saveMapButtons) {
    button.dataset.available = saveAvailable ? 'true' : 'false';
    button.dataset.state = saveVisualState;
    button.disabled = !saveAvailable;
    const label = button.id === 'settings-save' ? saveDescription : (hasMap ? `Save (${saveText})` : 'Save');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    if (button.id === 'settings-save') button.dataset.state = saveVisualState;
    if (saveAvailable) button.removeAttribute('aria-disabled'); else button.setAttribute('aria-disabled', 'true');
  }
  const saveAsAvailable = Boolean(hasMap && !persistenceBusy && !documentSaving && !documentSaveInFlight && !replacementGuard && !editorController?.isOpen() && !ownership.blocked());
  for (const button of saveAsButtons) { button.dataset.available = saveAsAvailable ? 'true' : 'false'; button.disabled = !saveAsAvailable; if (saveAsAvailable) button.removeAttribute('aria-disabled'); else button.setAttribute('aria-disabled', 'true'); }
  for (const button of openMapButtons) {
    button.dataset.available = openAvailable ? 'true' : 'false';
    button.disabled = !openAvailable;
    if (openAvailable) button.removeAttribute('aria-disabled'); else button.setAttribute('aria-disabled', 'true');
  }
  if (copyMapButton) {
    const copyAvailable = Boolean(hasMap && !copyMapBusy && !orbitWorkspaceBusy && !persistenceBusy && !replacementGuard && !pendingBackupImport && !installingBackupImport && !documentSaving && !documentSaveInFlight && !editorController?.isOpen() && !navigator?.busy && !dragState && !ownership.blocked());
    copyMapButton.dataset.available = copyAvailable ? 'true' : 'false';
    copyMapButton.disabled = !copyAvailable;
    if (copyAvailable) copyMapButton.removeAttribute('aria-disabled'); else copyMapButton.setAttribute('aria-disabled', 'true');
    const copyMenuButton = document.querySelector('#more-copy-map');
    if (copyMenuButton) { copyMenuButton.disabled = !copyAvailable; copyMenuButton.setAttribute('aria-disabled', String(!copyAvailable)); }
    copyMapButton.setAttribute('aria-label', 'Copy Map');
    copyMapButton.setAttribute('title', 'Copy Map');
    copyMapButton.title = 'Copy Map';
    copyMapButton.setAttribute('data-tooltip', 'Copy Map');
  }
  if (!destroying && !documentSaveInFlight && !documentSaveQueueActive && automaticSavePending && !automaticSaveBlocked) queueMicrotask(maybeRunAutomaticSave);
  syncSidebarTooltips();
}
function releaseReplacementGuard(token = null) {
  if (token !== null && replacementGuard?.token !== token) return false;
  replacementGuard = null;
  syncPersistenceControls();
  publish();
  return true;
}
function setPersistenceBusy(value) {
  persistenceBusy = value;
  syncPersistenceControls();
  publish();
}
function persistenceErrorMessage(error) {
  const code = String(error?.code || '');
  if (code === 'quota-exceeded') return 'Browser storage quota was exceeded. Free browser storage or delete a saved map, then retry.';
  if (code === 'library-limit') return 'The FileOrbit saved-map library is at its application capacity. Delete a saved map to free space.';
  if (code === 'idb-unavailable' || code === 'idb-open-failed') return 'Browser storage is unavailable or denied. You can keep working, but Save/Open will not persist until storage is available.';
  if (code === 'idb-versionchange' || code === 'schema-version-mismatch') return 'The saved-map schema changed in another tab or is newer than this app. Reload FileOrbit; storage was not erased.';
  if (code === 'idb-blocked') return 'Browser storage is blocked. Close other FileOrbit tabs and retry.';
  if (code === 'transaction-aborted' || code === 'transaction-failed') return 'The storage transaction was aborted; the last saved version and the current map were preserved. Retry when ready.';
  if (code === 'attachment-missing' || code === 'record-inconsistent' || code === 'usage-inconsistent' || code === 'missing-reference') return 'Saved data is incomplete or inconsistent. The current map was preserved; choose another saved version or save a new copy.';
  return String(error?.message || error || 'Storage operation failed.');
}
function openSaveConflict() {
  if (!saveConflictDialog || !activeMap?.mapId) return;
  if (saveConflictDialog.isOpen) return;
  const guard = { token: ++persistenceRequestSeq, session: persistenceSessionSeq, datasetToken, revision: dataRevision, intent: 'conflict' };
  conflictGuard = guard; conflictIdentity = { session: persistenceSessionSeq, datasetToken, revision: dataRevision, mapId: activeMap.mapId, generation: activeMap.generation };
  replacementGuard = guard; syncPersistenceControls();
  saveConflictDialog.show({ message: 'A newer saved version exists. Local changes were not overwritten.' });
  saveConflictDialog.setError('Choose how to resolve the conflict.');
}
function conflictIdentityCurrent() {
  return Boolean(conflictIdentity && conflictGuard && replacementGuard === conflictGuard
    && conflictIdentity.session === persistenceSessionSeq && conflictIdentity.datasetToken === datasetToken && conflictIdentity.revision === dataRevision);
}
function releaseConflictGuard() {
  const token = conflictGuard?.token ?? null;
  conflictGuard = null; conflictIdentity = null;
  if (token !== null) releaseReplacementGuard(token);
}
function cancelSaveConflict() {
  if (saveConflictDialog?.isOpen) saveConflictDialog.close({ restoreFocus: false });
  releaseConflictGuard();
  setShellStatus('Save conflict cancelled. Local changes were preserved.');
}
async function resolveConflictReload() {
  if (!conflictIdentityCurrent()) { saveConflictDialog?.setError('The map changed. This conflict action is stale.'); return; }
  const mapId = conflictIdentity.mapId;
  if (saveConflictDialog?.isOpen) saveConflictDialog.close({ restoreFocus: false });
  releaseConflictGuard();
  pendingEditorConflictCompletion = false;
  await openSavedMap(mapId);
}
async function resolveConflictSaveCopy() {
  if (!conflictIdentityCurrent()) { saveConflictDialog?.setError('The map changed. This conflict action is stale.'); return; }
  if (saveConflictDialog?.isOpen) saveConflictDialog.close({ restoreFocus: false });
  releaseConflictGuard();
  const result = await saveActiveMap({ internal: true, newCopy: true, ignoreEditor: true });
  if (!result?.ok) setShellStatus('Save as new copy failed: ' + String(result?.message || 'unknown error'));
  else setRoutineStatus('Saved local map as a new copy. The original saved map was not changed.');
  if (result?.ok && pendingEditorConflictCompletion) { if (typeof editorPanel?.completeAppliedFromPersistence !== 'function') { setShellStatus('Editor completion API is unavailable.'); return; } const op = editorAppliedOperation; const owns = Boolean(op && op.session === persistenceSessionSeq && op.datasetToken === datasetToken && op.formToken === editorPanel.getFormToken()); if (owns && editorPanel.completeAppliedFromPersistence() === true) editorAppliedOperation = null; pendingEditorConflictCompletion = false; }
}

async function saveActiveMap({ internal = false, newCopy = false, ignoreEditor = false } = {}) {
  if (!hasMap || !tree || !attachmentRegistry) return { ok: false, reason: 'no-map', message: 'There is no map to save.' };
  if (!internal && replacementGuard) return { ok: false, reason: 'replacement-pending', message: 'Finish the pending replacement decision first.' };
  const blocked = persistenceBlockedReason({ ignoreEditor });
  if (blocked) { setShellStatus(blocked); return { ok: false, reason: 'blocked', message: blocked }; }
  let snapshot;
  try {
    snapshot = runtimeAccess.snapshot({
      mapping: attachmentIds,
      mapId: newCopy ? null : (activeMap?.mapId ?? null),
      expectedGeneration: newCopy ? null : (activeMap?.generation ?? null),
      datasetToken,
      allocateAttachmentId: createAttachmentId
    });
  } catch (error) {
    const message = `Save failed: ${String(error?.message || error)}`;
    setShellStatus(message); publish();
    return { ok: false, reason: error?.code || 'snapshot-failed', message, error };
  }
  const operation = ++saveOperationToken;
  const session = persistenceSessionSeq;
  const originDataset = datasetToken;
  const capturedRevision = dataRevision;
  persistenceBusy = 'saving';
  syncPersistenceControls(); publish();
  try {
    saveInvocationCount += 1;
    let feedbackScope = beginShellFeedback('Saving map in this browser…');
    if (p1bSaveDelay > 0) { const wait = p1bSaveDelay; p1bSaveDelay = 0; await new Promise((resolve) => setTimeout(resolve, wait)); }
    if (p1bSaveGate) { const gate = p1bSaveGate; await gate.promise; if (p1bSaveGate === gate) p1bSaveGate = null; }
    const result = await persistenceRepository.save(snapshot);
    if (session !== persistenceSessionSeq || originDataset !== datasetToken) {
      lastClickDiagnostic = { reason: 'save-stale-session', mapId: result.mapId };
      return { ...result, staleSession: true };
    }
    if (operation !== saveOperationToken) return { ...result, staleOperation: true };
    setActiveMap({ mapId: result.mapId, generation: result.generation, savedRevision: result.savedRevision });
    lastPersistenceResult = { mapId: result.mapId, generation: result.generation, wroteAttachmentCount: result.wroteAttachmentCount, skippedAttachmentCount: result.skippedAttachmentCount, savedRevision: result.savedRevision }; restoredMapAwaitingSave = false;
    persistenceLastError = null;
    attachmentIds = result.mapping;
    persistenceBusy = null;
    lastClickDiagnostic = { reason: 'save-complete', id: activeMap.mapId };
    feedbackScope = renewShellFeedbackScope(feedbackScope);
    resolveShellFeedback(feedbackScope, 'Saved to IndexedDB on this device.');
    syncPersistenceControls(); publish();
    return result;
  } catch (error) {
    if (session === persistenceSessionSeq && originDataset === datasetToken && operation === saveOperationToken) {
      persistenceBusy = null;
      persistenceLastError = 'Save failed';
      lastClickDiagnostic = { reason: 'save-failed', error: String(error?.message || error) };
      setShellStatus(`Save failed: ${String(error?.message || error)}`);
      syncPersistenceControls(); publish();
      if (error?.code === 'stale-generation' && activeMap?.mapId && !replacementGuard && !newCopy) {
        persistenceBusy = null; persistenceLastError = 'Save conflict';
        openSaveConflict();
        publish();
      }
    }
    return { ok: false, reason: error?.code || 'save-failed', message: String(error?.message || error), error, capturedRevision };
  }
}
async function deleteSavedMap(record) {
  if (!persistenceRepository || !record?.mapId) return;
  try {
    const result = await persistenceRepository.remove(record.mapId, { expectedGeneration: record.generation });
    if (activeMap?.mapId === record.mapId) {
      clearActiveMap(); restoredMapAwaitingSave = false;
      persistenceSessionSeq += 1;
      lastPersistenceResult = null;
      setRoutineStatus('Deleted the saved copy. The open map remains in memory and is now unsaved.');
    } else {
      setRoutineStatus('Deleted the saved map from this browser.');
    }
    if (savedMapsDialog?.isOpen) await refreshSavedMaps();
    syncPersistenceControls(); publish();
    return result;
  } catch (error) {
    savedMapsDialog?.setError(`Delete failed: ${String(error?.message || error)}`);
    setShellStatus(`Delete failed: ${String(error?.message || error)}`);
    throw error;
  }
}
async function requestPersistentStorage() {
  if (!persistenceRepository) return { status: 'unavailable', granted: false };
  const result = await persistenceRepository.requestPersist();
  if (savedMapsDialog?.isOpen) { savedMapsDialog.setPersistResult(result); try { savedMapsDialog.setUsage(await persistenceRepository.usage()); } catch {} }
  return result;
}
function cancelBlockedPersistence() {
  if (!persistenceBlocked) return false;
  persistenceRepository?.close();
  persistenceBlocked = false; persistenceBusy = null;
  setRoutineStatus('Blocked storage open cancelled. The current map was preserved.');
  syncPersistenceControls(); publish();
  return true;
}
async function refreshSavedMaps() {
  if (!savedMapsDialog?.isOpen) return;
  const token = ++savedMapsRequestToken;
  savedMapsDialog.setBusy(true);
  try {
    const records = await persistenceRepository.list();
    if (!savedMapsDialog?.isOpen || token !== savedMapsRequestToken) return;
    savedMapsDialog.setRecords(records);
    try { const usage = await persistenceRepository.usage(); if (savedMapsDialog?.isOpen && token === savedMapsRequestToken) savedMapsDialog.setUsage(usage); } catch { /* listing remains usable */ }
  } catch (error) {
    if (savedMapsDialog?.isOpen && token === savedMapsRequestToken) savedMapsDialog.setError(`Saved maps could not be loaded: ${String(error?.message || error)}`);
  }
}
function showSavedMapsLibrary({ guard = null } = {}) {
  if (!savedMapsDialog) { setShellStatus(persistenceUnavailable || 'Saved maps are unavailable.'); releaseReplacementGuard(); return false; }
  if (savedMapsDialog.isOpen) return true;
  if (guard) { replacementGuard = guard; savedMapsLibraryGuardToken = guard.token; }
  savedMapsDialog.show();
  refreshSavedMaps();
  syncPersistenceControls();
  return true;
}
function requestOpenSavedMaps({ skipDraft = false } = {}) {
  const hardBlocked = openRequestBlockedReason();
  if (hardBlocked && !replacementGuard) { setShellStatus(hardBlocked); return false; }
  if (!skipDraft && editorController?.isOpen() && editorController.dirty) {
    const request = { id: ++openRequestSeq, session: persistenceSessionSeq, datasetToken, revision: dataRevision };
    pendingOpenRequest = request;
    editorPanel?.requestSelection({ kind: 'open-map', requestId: request.id, datasetToken, baseRevision: dataRevision });
    return false;
  }
  if (editorController?.isOpen()) { editorController.cancel(); editorPanel?.clear?.(); }
  if (replacementNeedsConfirmation()) {
    pendingReplacement = { intent: 'open' };
    unsavedMapPrompt?.show({ text: 'This map has changes that are not saved in this browser. Save before opening another map?' });
    return false;
  }
  return showSavedMapsLibrary();
}
async function saveBeforeReplacement() {
  if (!pendingReplacement || !unsavedMapPrompt) return;
  const guard = { token: ++persistenceRequestSeq, session: persistenceSessionSeq, datasetToken, revision: dataRevision, ownership: documentOwnershipSeq, intent: pendingReplacement.intent };
  replacementGuard = guard;
  unsavedMapPrompt.setBusy(true);
  syncPersistenceControls();
  const result = await saveCurrentDocument({ context: 'replacement', capturedRevision: guard.revision, allowReplacement: true, replacementToken: guard.token, expectedOwnership: guard.ownership, expectedSession: guard.session, expectedDataset: guard.datasetToken });
  if (result?.handoff) {
    releaseReplacementGuard();
    unsavedMapPrompt.setBusy(false);
    unsavedMapPrompt.showError('Download started, but saving this document could not be confirmed. Choose Discard or Cancel to decide how to continue.');
    syncPersistenceControls(); publish();
    return;
  }
  if (!result?.ok) {
    releaseReplacementGuard();
    unsavedMapPrompt.setBusy(false);
    unsavedMapPrompt.showError(result?.message || 'The map could not be saved.');
    syncPersistenceControls(); publish();
    return;
  }
  if (guard.session !== persistenceSessionSeq || guard.datasetToken !== datasetToken || guard.revision !== dataRevision) {
    releaseReplacementGuard();
    unsavedMapPrompt.setBusy(false);
    unsavedMapPrompt.showError('The map changed while saving. Review the newer changes before replacing.');
    syncPersistenceControls(); publish();
    return;
  }
  unsavedMapPrompt.close({ restoreFocus: false });
  const intent = pendingReplacement.intent;
  const backupRequest = pendingReplacement.backupRequest || null;
  pendingReplacement = null;
  if (intent === 'backup') {
    releaseReplacementGuard();
    if (!backupRequest) { setShellStatus('The pending backup import was lost.'); return; }
    pendingBackupImport = backupRequest;
    resumeBackupImport(backupRequest).catch((error) => { backupRequest.registry?.clear?.(); setShellStatus('Backup import failed: ' + String(error?.message || error)); });
  } else if (intent === 'create') {
    const started = startCreateMap({ skipDirty: true, skipUnsaved: true });
    releaseReplacementGuard();
    if (!started) setShellStatus('The map was saved, but Create Map could not start.');
  } else {
    showSavedMapsLibrary({ guard });
  }
}
function discardAndContinueReplacement() {
  const intent = pendingReplacement?.intent;
  const backupRequest = pendingReplacement?.backupRequest || null;
  pendingReplacement = null;
  releaseReplacementGuard();
  if (intent === 'backup') {
    if (!backupRequest) { setShellStatus('The pending backup import was lost.'); return; }
    pendingBackupImport = backupRequest;
    resumeBackupImport(backupRequest).catch((error) => { backupRequest.registry?.clear?.(); setShellStatus('Backup import failed: ' + String(error?.message || error)); });
  } else if (intent === 'create') startCreateMap({ skipDirty: true, skipUnsaved: true });
  else if (intent === 'open') showSavedMapsLibrary();
}
function cancelReplacement() {
  pendingReplacement = null;
  clearPendingBackupImport();
  releaseReplacementGuard();
  setRoutineStatus('Replacement cancelled. The current map was not changed.');
}
async function openSavedMap(mapId) {
  cancelStartupRecovery();
  claimDocumentOwnership();
  if (!mapId || !persistenceRepository) return;
  let guard = replacementGuard;
  if (!guard || guard.intent !== 'open' || guard.session !== persistenceSessionSeq || guard.datasetToken !== datasetToken) {
    guard = { token: ++persistenceRequestSeq, session: persistenceSessionSeq, datasetToken, revision: dataRevision, intent: 'open' };
    replacementGuard = guard;
  }
  savedMapsLibraryGuardToken = null;
  const guardToken = guard.token;
  const currentGuard = () => replacementGuard === guard && guard.session === persistenceSessionSeq && guard.datasetToken === datasetToken && guard.revision === dataRevision;
  const operation = ++openOperationToken;
  const priorSession = persistenceSessionSeq;
  persistenceBusy = 'loading';
  syncPersistenceControls(); publish();
  let loaded; let candidate; let feedbackScope = null;
  try {
    feedbackScope = beginShellFeedback('Loading saved map…');
    if (p1bOpenDelay > 0) { const wait = p1bOpenDelay; p1bOpenDelay = 0; await new Promise((resolve) => setTimeout(resolve, wait)); }
    if (p1bOpenFailStage === 'load') { p1bOpenFailStage = null; throw new Error('injected open load failure'); }
    loaded = await persistenceRepository.load(mapId);
    candidate = reconstructSavedMapRuntime({ loaded, datasetToken: datasetToken + 1, viewport: viewport() });
    if (operation !== openOperationToken || priorSession !== persistenceSessionSeq) { candidate.dispose(); releaseReplacementGuard(guardToken); return; }
    if (!currentGuard()) { candidate.dispose(); throw new Error('The map changed before the saved map could be installed.'); }
  } catch (error) {
    if (operation === openOperationToken && priorSession === persistenceSessionSeq) {
      persistenceBusy = null;
      persistenceLastError = 'Open failed';
      setShellStatus('Open failed: ' + String(error?.message || error));
      if (savedMapsDialog?.isOpen) savedMapsDialog.setError('Open failed: ' + String(error?.message || error));
      syncPersistenceControls(); publish();
    }
    releaseReplacementGuard(guardToken);
    return;
  }
  const old = { tree, graph, baseLayout, model, session, navigator, attachmentRegistry, history, idAllocator, detailsTargetId, datasetToken, dataRevision };
  let recoveryError = null; let installResult = null;
  try {
    ensureCreateMapRuntime();
    ownership.beginCreation();
    suspendMapForCreation();
    prepareCandidateLabelContext();
    installResult = installCandidateEnvironment({
      candidate,
      operation: 'open-saved-map',
      prepare: () => ({ ok: true, fit: true }),
      initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), initialFraming: 'fit',
      frame: installFrame,
      invalidate: () => { frameState = null; },
      setCandidateEnv: (env) => { candidateEnv = env; },
      beforeCommit: () => currentGuard() ? { ok: true } : { ok: false, message: 'The map changed before replacement.' },
      commit: (candidateValue, candidateSession) => {
        if (!currentGuard()) throw new Error('The map changed before replacement.');
        tree = candidateValue.tree; graph = candidateValue.graph; baseLayout = candidateValue.baseLayout; model = candidateValue.model;
        session = candidateSession; attachmentRegistry = candidateValue.registry; attachmentIds = new Map(candidateValue.attachmentIds);
        createEditor();
        datasetToken += 1; dataRevision = 0;
        setActiveMap({ mapId: loaded.map.mapId, generation: loaded.map.generation, savedRevision: 0 }); resetActiveDocument(); lastPersistenceResult = null; persistenceLastError = null;
        persistenceSessionSeq += 1; restoredMapAwaitingSave = false;
        history = createEditorHistory(); idAllocator = createEditorIdAllocator({ datasetToken });
        detailsTargetId = tree.id; hasMap = true; creationSuspension = null; creationTerminal = null;
        old.attachmentRegistry?.clear(); old.history?.clear();
        setMapPresentation(true); resetSearchForDataset(); navigator = null; createNavigator(); createNavigation();
        ownership.releaseCreation(); ownership.clearRecoveryFailure();
      },
      recover: () => {
        candidate.registry.clear();
        tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model;
        session = old.session; navigator = old.navigator; attachmentRegistry = old.attachmentRegistry;
        history = old.history; idAllocator = old.idAllocator; detailsTargetId = old.detailsTargetId;
        datasetToken = old.datasetToken; dataRevision = old.dataRevision; frameState = null;
        const recovered = recoverAuthoritativeSession(old.session);
        if (!recovered) { recoveryError = new Error('Previous frame recovery failed.'); ownership.markRecoveryFailure(); }
        return recovered;
      }
    });
    if (!installResult.ok) throw installResult.error || new Error(installResult.message || 'Saved map installation failed');
    persistenceBusy = null;
    lastClickDiagnostic = { reason: 'open-saved-map-complete', id: loaded.map.mapId };
    await establishRecoveryWorkspace({ origin: 'library', baseline: false });
    feedbackScope = renewShellFeedbackScope(feedbackScope);
    resolveShellFeedback(feedbackScope, 'Opened saved map from this browser.');
    syncPersistenceControls(); publish();
    releaseReplacementGuard(guardToken);
  } catch (error) {
    if (operation !== openOperationToken || priorSession !== persistenceSessionSeq) {
      candidate.registry.clear();
      releaseReplacementGuard(guardToken);
      return;
    }
    candidate.registry.clear();
    const suspended = Boolean(creationSuspension);
    if (recoveryError) {
      ownership.markRecoveryFailure();
      creationTerminal = 'failure';
      if (detailsEl) { detailsEl.hidden = false; detailsEl.textContent = 'Map unavailable after recovery failure'; }
    } else if (installResult?.recovered) {
      creationSuspension = null; creationTerminal = null;
      ownership.releaseCreation();
      setMapPresentation(true);
    } else if (suspended) {
      const restored = restoreSuspendedMap();
      ownership.releaseCreation();
      if (!restored) ownership.markRecoveryFailure();
    } else {
      tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model;
      session = old.session; navigator = old.navigator; attachmentRegistry = old.attachmentRegistry;
      history = old.history; idAllocator = old.idAllocator; detailsTargetId = old.detailsTargetId;
      datasetToken = old.datasetToken; dataRevision = old.dataRevision;
    }
    persistenceBusy = null;
    persistenceLastError = 'Open failed';
    setShellStatus('Open failed: ' + persistenceErrorMessage(error) + (recoveryError ? ' Recovery failed: ' + String(recoveryError.message) : ''));
    syncPersistenceControls(); publish();
    releaseReplacementGuard(guardToken);
  }
}
async function preflightOrbitFilename(directory, filename, isCurrent) {
  if (!directory || typeof directory.values !== 'function') return { ok: false, reason: 'no-orbit', message: 'No Orbit directory is active.' };
  const result = await orbitAdapter.enumerateTopLevelMaps(directory, { isCurrent });
  if (!isCurrent()) return { ok: false, reason: 'stale', stale: true, message: '' };
  if (!result?.ok) return { ok: false, reason: result?.reason || 'preflight-failed', message: result?.message || 'Could not check the Orbit destination name.' };
  if (result.truncated) return { ok: false, reason: 'preflight-incomplete', message: 'The Orbit filename check was incomplete; no destination was created.' };
  const key = orbitNameKey(filename);
  if ((result.entries || []).some((entry) => orbitNameKey(entry.name) === key)) return { ok: false, reason: 'exists', message: 'A file with that name already exists in this Orbit.' };
  return { ok: true, entries: result.entries || [] };
}

async function chooseCreationFolderForDialog() {
  const dialog = createMapDialog;
  if (!dialog?.open) return { ok: false, stale: true };
  if (!orbitAdapter.supported) return { ok: false, message: 'Folder-based saving is not available in this browser. You can still create a standalone map.' };
  const seq = ++creationFolderSeq;
  const session = persistenceSessionSeq;
  const dataset = datasetToken;
  const picked = await orbitAdapter.pickDirectory();
  if (!dialog.open || createMapDialog !== dialog || seq !== creationFolderSeq || session !== persistenceSessionSeq || dataset !== datasetToken) return { ok: false, stale: true };
  if (!picked?.ok) {
    return {
      ok: false,
      message: picked?.reason === 'cancelled'
        ? 'Location selection cancelled. Your map details were kept.'
        : picked?.reason === 'permission-denied'
          ? 'Folder access was not granted. Your map details were kept.'
          : 'The folder could not be selected. Your map details were kept.'
    };
  }
  const adopted = await orbitState.adoptDirectory(picked.handle, { name: picked.name, permission: picked.permission || 'granted' });
  if (!dialog.open || createMapDialog !== dialog || seq !== creationFolderSeq || session !== persistenceSessionSeq || dataset !== datasetToken) return { ok: false, stale: true };
  if (!adopted?.ok) return { ok: false, message: adopted?.message || 'The folder list could not be read. Your map details were kept.' };
  createDraftDestinationMode = 'orbit';
  renderOrbitPanel();
  dialog.refreshSaveLocation();
  return { ok: true, name: picked.name || picked.handle?.name || 'selected folder' };
}


function startCreateMap({ skipDirty = false, skipUnsaved = false } = {}) {
  cancelStartupRecovery();
  if (ownership.recoveryFailed || creationSuspension) { setShellStatus('Interaction is unavailable after a recovery failure.'); return false; }
  if (replacementGuard && !skipUnsaved) { setShellStatus('Finish the pending replacement decision first.'); return false; }
  if (createMapDialog?.open) return true;
  if (orbitWorkspaceBusy) { setShellStatus('Finish the current Orbit write before creating another map.'); return false; }
  if (!createMapDialog) { setShellStatus(createMapInitializationError ? 'Create Map failed to initialize: ' + String(createMapInitializationError?.message || createMapInitializationError) : 'Create Map is not available.'); return false; }
  if (destroying || deleteConfirmation?.isOpen || navigator?.busy || dragState || editorController?.isSaving() || editorController?.mode === 'saving') {
    setShellStatus('Finish the current transition, drag, or save before creating a map.');
    return false;
  }
  claimDocumentOwnership();
  if (!skipDirty && editorController?.isOpen() && editorController.dirty) {
    editorPanel?.requestSelection({ kind: 'create-map' });
    return false;
  }
  if (!skipUnsaved && replacementNeedsConfirmation()) {
    pendingReplacement = { intent: 'create' };
    unsavedMapPrompt?.show({ text: 'This map has changes that are not saved in this browser. Save before creating another map?' });
    return false;
  }
  if (editorController?.isOpen()) { editorController.cancel(); editorPanel?.clear?.(); }
  if (attachmentViewer?.isOpen) attachmentViewer.close();
  creationTerminalHandled = false; lastCreationRestoreFailure = null;
  creationFolderSeq += 1;
  createDraftDestinationMode = orbitState.snapshot().handle && orbitState.snapshot().phase !== 'blocked' ? 'orbit' : 'standalone';
  ownership.beginCreation();
  suspendMapForCreation();
  createMapDialog.show();
  publish();
}
async function prepareCreateMapWithToken({ mapName, description = null, files = [], folders = [], token }) {
  const isCurrent = () => token === createMapOperation && Boolean(createMapDialog?.open);
  const result = await prepareCreateMapCandidate({
    mapName, description, files, folders, datasetToken: datasetToken + 1, isCurrent
  });
  if (!isCurrent()) { if (result.ok) result.registry.clear(); return { ok: false, reason: 'stale-selection', message: 'The selection changed.' }; }
  if (!result.ok) { releasePendingCreateCandidate(); return result; }
  releasePendingCreateCandidate();
  pendingCreateCandidate = result;
  return { ...result, selection: { files, folders } };
}
async function prepareCreateMapSelection({ mapName, description = null, files, folders, selectionSeq }) {
  const token = ++createMapOperation;
  releasePendingCreateCandidate();
  return prepareCreateMapWithToken({ mapName, description, files, folders, token });
}
async function prepareCreateMapDrop({ entries, mapName }) {
  const token = ++createMapOperation;
  releasePendingCreateCandidate();
  const isCurrent = () => token === createMapOperation && Boolean(createMapDialog?.open);
  const collected = await collectDirectorySelection({ entries, maxNodes: EDITOR_MAX_NODES, isCurrent });
  if (!isCurrent()) return { ok: false, reason: 'stale-selection', message: 'The selection changed.' };
  if (!collected.ok) return collected;
  return prepareCreateMapWithToken({ mapName, files: collected.files, folders: collected.folders, token });
}
let backupOperation = 0;
let backupFileInput = null;
let backupCancelButton = document.querySelector('#backup-cancel'); backupCancelButton?.addEventListener('click', () => cancelBackup());
let backupOwnerSession = null;
let backupOwnerDataset = null;
const backupDownloads = createDownloadResourceManager();
let backupStartGate = null;
let backupFeedbackScope = null;
let backupImportHashGates = [];
let p1bImportPreparationFailure = false;
let backupImportCommitCount = 0;
function backupBusy() { return typeof persistenceBusy === 'string' && persistenceBusy.startsWith('backup'); }
function backupOwnerActive(owner) { return Boolean(owner && owner.operation === backupOperation && backupOwnerSession === owner.session && backupOwnerDataset === owner.dataset && persistenceSessionSeq === owner.session && datasetToken === owner.dataset); }
function finishBackupOwner(owner, busy, committed = false) {
  const owns = Boolean(owner && owner.operation === backupOperation && backupOwnerSession === owner.session && backupOwnerDataset === owner.dataset && (committed || (persistenceSessionSeq === owner.session && datasetToken === owner.dataset)));
  if (!owns || persistenceBusy !== busy) return false;
  persistenceBusy = null; if (backupCancelButton) backupCancelButton.hidden = true; backupOwnerSession = null; backupOwnerDataset = null; syncPersistenceControls(); publish(); return true;
}
function invalidateBackup() { backupOperation += 1; backupFeedbackScope = null; backupDownloads.cleanupAll(); if (backupBusy()) persistenceBusy = null; if (backupCancelButton) backupCancelButton.hidden = true; backupOwnerSession = null; backupOwnerDataset = null; }
function cancelBackup() { if (!backupBusy()) return false; const cancelledScope = backupFeedbackScope; invalidateBackup(); resolveShellFeedback(cancelledScope, 'Download cancelled. The current map was not changed.'); syncPersistenceControls(); publish(); return true; }
async function downloadBackup() {
  if (editorController?.isOpen()) { setShellStatus('Save or Close the editor form before downloading a copy.'); return { ok: false, reason: 'editor-open' }; }
  if (!hasMap || !tree || !attachmentRegistry) { setShellStatus('There is no map to download.'); return { ok: false, reason: 'no-map' }; }
  if (persistenceBusy || replacementGuard) { if (!backupBusy()) setShellStatus('Finish the current save, open, or replacement operation before downloading.'); return { ok: false, reason: 'busy' }; }
  const operation = ++backupOperation; const owner = { operation, session: persistenceSessionSeq, dataset: datasetToken }; const capturedName = tree.name;
  backupOwnerSession = owner.session; backupOwnerDataset = owner.dataset; persistenceBusy = 'backup-export'; if (backupCancelButton) backupCancelButton.hidden = false; syncPersistenceControls(); const feedbackScope = beginShellFeedback('Preparing download…'); backupFeedbackScope = feedbackScope;
  const isCancelled = () => !backupOwnerActive(owner);
  let downloadRecord = null;
  if (backupStartGate) { const gate = backupStartGate; await gate.promise; if (isCancelled()) return { ok: false, reason: 'cancelled' }; }
  try {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this browser.');
    const source = runtimeAccess.serializationState();
    const encoded = await encodeBackup({ tree: source.tree, registry: source.registry, mapName: capturedName, sourceMapId: activeMap?.mapId || null, cryptoApi: globalThis.crypto, isCancelled, policyContext: largeMapPolicyContext });
    if (isCancelled()) return { ok: false, reason: 'cancelled' };
    if (typeof URL?.createObjectURL !== 'function' || typeof document?.createElement !== 'function') throw new Error('Browser download is unavailable.');
    const anchor = document.createElement('a');
    const downloadUrl = URL.createObjectURL(encoded.blob);
    downloadRecord = backupDownloads.own({ url: downloadUrl, anchor });
    anchor.href = downloadUrl; anchor.download = safeDocumentFilename(capturedName); anchor.hidden = true;
    try { document.body.append(anchor); anchor.click(); } finally { anchor.remove(); }
    renewShellFeedbackScope(feedbackScope);
    resolveShellFeedback(feedbackScope, 'Download prepared. Browser download handoff started; saving the file is not guaranteed.');
    backupFeedbackScope = null;
    return { ok: true, blob: encoded.blob, filename: anchor.download };
  } catch (error) {
    if (error?.code === 'backup-cancelled') return { ok: false, reason: 'cancelled' };
    if (downloadRecord) backupDownloads.cleanup(downloadRecord);
    backupFeedbackScope = null;
    if (!isCancelled()) setShellStatus('Download failed: ' + String(error?.message || error));
    return { ok: false, error };
  } finally { finishBackupOwner(owner, 'backup-export'); }
}
async function pickCreationDestination(title) {
  const suggested = safeDocumentFilename(title || 'FileOrbit map');
  if (!documentAdapter.writableSupported) return { ok: true, handle: null, name: suggested, forceDownload: true, mode: 'download' };
  const picked = await documentAdapter.pickSave(suggested);
  if (!picked.ok) {
    const reason = picked.reason || 'save-picker-failed';
    const message = reason === 'cancelled'
      ? 'Create Map cancelled at the save picker. Your title and selection were kept.'
      : reason === 'permission-denied'
        ? 'Create Map could not save because write permission was not granted. Your title and selection were kept.'
        : 'Create Map could not open the save picker. Your title and selection were kept.';
    return { ok: false, reason, keepDraft: true, message };
  }
  return { ok: true, handle: picked.handle, name: picked.handle?.name || suggested, forceDownload: false, mode: 'writable' };
}

﻿﻿let libraryEditOriginalId = null;
let libraryEditToken = 0;

function isLibraryEditCurrent(token, originalId) {
  return !destroying && token === libraryEditToken && libraryEditDialog?.open
    && libraryCollection?.snapshot().selectedId === originalId;
}

async function chooseEditReplacementFolder() {
  if (destroying || !libraryEditDialog?.open) return { ok: false, reason: 'stale' };
  const token = libraryEditToken;
  const picked = await orbitAdapter.pickDirectory({ mode: 'read' });
  if (destroying || token !== libraryEditToken || !libraryEditDialog.open) return { ok: false, reason: 'stale' };
  return picked;
}

function openLibraryEdit() {
  if (destroying || !libraryCollection || !libraryEditDialog || libraryEditDialog.open || permissionDialog?.open) return;
  const selected = libraryCollection.snapshot().selected;
  if (!selected) return;
  libraryEditOriginalId = selected.id;
  libraryEditToken += 1;
  libraryEditDialog.show(selected);
}

async function activateRelinkedLibrary(record, originalId, token) {
  if (!record || !isLibraryEditCurrent(token, originalId)) return { ok: false, reason: 'stale' };
  const displayToken = ++mapLibraryRestoreToken;
  await orbitState.restoreDirectory(record.handle, { name: record.name, permission: 'granted', enumerate: true });
  if (destroying || displayToken !== mapLibraryRestoreToken || token !== libraryEditToken) return { ok: false, reason: 'stale' };
  libraryCollection.markAccess(record.id, { permission: 'granted', phase: 'ready', error: null, lastListedAt: Date.now() });
  await syncOrbitCurrentEntry();
  libraryListOpen = false;
  libraryPendingName = null;
  renderOrbitPanel();
  return { ok: true };
}

async function applyLibraryEdit(draft) {
  const originalId = libraryEditOriginalId;
  const token = ++libraryEditToken;
  if (destroying || !draft?.handle || !originalId || !libraryEditDialog?.open) return { ok: false, reason: 'stale' };
  const snapshot = libraryCollection?.snapshot();
  const original = snapshot?.libraries.find((record) => record.id === originalId);
  if (!original || snapshot.selectedId !== originalId) return { ok: false, reason: 'stale', message: 'The selected Map Library changed before Apply.' };
  const queried = await orbitAdapter.queryReadPermission(draft.handle);
  if (destroying || token !== libraryEditToken) return { ok: false, reason: 'stale' };
  if (!queried?.ok || queried.permission !== 'granted') {
    return { ok: false, reason: 'permission-required', message: 'Read access to the replacement folder is required. Choose the folder again or cancel.' };
  }
  const listing = await orbitAdapter.enumerateTopLevelMaps(draft.handle, { isCurrent: () => !destroying && token === libraryEditToken && libraryEditDialog.open });
  if (destroying || token !== libraryEditToken) return { ok: false, reason: 'stale' };
  if (!listing?.ok) return { ok: false, reason: listing?.reason || 'listing-failed', message: 'The replacement folder could not be read. The original Library connection is unchanged.' };
  const linked = await libraryCollection.relink(originalId, draft.handle, draft.name);
  if (destroying || token !== libraryEditToken) return { ok: false, reason: 'stale' };
  if (!linked.ok) {
    if (linked.reason === 'already-linked') {
      const selected = await selectLibraryFromCollection(linked.existingId);
      if (destroying || token !== libraryEditToken) return { ok: false, reason: 'stale' };
      if (selected?.ok) {
        libraryEditOriginalId = null;
        setInfoStatus('This folder is already linked. Its existing Map Library has been selected.', { ttl: 5000 });
        return { ok: true, alreadyLinked: true };
      }
      return selected || { ok: false, reason: 'selection-failed' };
    }
    if (linked.reason === 'identity-unverified') return { ok: false, reason: 'identity-unverified', message: 'The replacement folder could not be identity-checked. Nothing was changed; you can retry or cancel.' };
    return linked;
  }
  if (linked.noChange) {
    libraryEditOriginalId = null;
    setInfoStatus('The selected folder is already this Library’s linked folder. No changes were made.', { ttl: 4000 });
    return { ok: true, noChange: true };
  }
  const activated = await activateRelinkedLibrary(linked.library, originalId, token);
  if (!activated.ok) return activated;
  libraryEditOriginalId = null;
  setInfoStatus('Linked folder changed. The open map and its save destination were not changed.', { ttl: 5000 });
  return { ok: true, library: linked.library };
}

const libraryEditButton = document.querySelector('#library-edit');

const libraryListAction = document.querySelector('#library-list-action');
const libraryCollectionEl = document.querySelector('#library-collection');
const libraryCollectionListEl = document.querySelector('#library-collection-list');
const libraryCollectionStatusEl = document.querySelector('#library-collection-status');
const libraryCollectionEmptyEl = document.querySelector('#library-collection-empty');
const libraryLinkButton = document.querySelector('#library-link');
const libraryCollectionRefreshButton = document.querySelector('#library-collection-refresh');
const librarySelectedEl = document.querySelector('#library-selected');

function collectionStatusText(status) {
  if (!status) return '';
  if (status.error === 'permission-required' || status.permission === 'prompt') return 'Reconnect needed';
  if (status.error === 'permission-denied' || status.permission === 'denied') return 'Access denied';
  if (status.phase === 'blocked') return 'Unavailable';
  if (status.phase === 'listing') return 'Refreshing…';
  return '';
}

function renderLibraryCollection() {
  if (!libraryCollectionEl || !librarySelectedEl) return;
  libraryCollectionEl.hidden = !libraryListOpen;
  librarySelectedEl.hidden = libraryListOpen;
  if (!libraryListOpen || !libraryCollectionListEl) return;
  const snapshot = libraryCollection?.snapshot?.() || { libraries: [], selectedId: null };
  libraryCollectionListEl.replaceChildren();
  const names = snapshot.libraries.map((record) => record.name);
  for (const record of snapshot.libraries) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.libraryId = record.id;
    button.setAttribute('aria-current', String(record.id === snapshot.selectedId));
    const name = document.createElement('span');
    name.className = 'library-collection-name';
    name.textContent = record.name;
    const meta = document.createElement('span');
    meta.className = 'library-collection-meta';
    const status = collectionStatusText(libraryCollection?.getStatus?.(record.id));
    const duplicateName = names.filter((value) => value === record.name).length > 1;
    const identifier = duplicateName ? ` · #${record.id.slice(0, 6)}` : '';
    meta.textContent = `${status || 'Linked'}${identifier}`;
    button.append(name, meta);
    button.addEventListener('click', () => { void selectLibraryFromCollection(record.id); });
    item.appendChild(button);
    libraryCollectionListEl.appendChild(item);
  }
  if (libraryCollectionEmptyEl) libraryCollectionEmptyEl.hidden = snapshot.libraries.length !== 0;
  if (libraryCollectionStatusEl) libraryCollectionStatusEl.textContent = snapshot.libraries.length ? `${snapshot.libraries.length} linked ${snapshot.libraries.length === 1 ? 'Library' : 'Libraries'}.` : '';
}

async function selectLibraryFromCollection(id) {
  if (destroying || !libraryCollection) return { ok: false, reason: 'unavailable' };
  const current = libraryCollection.snapshot();
  const record = current.libraries.find((item) => item.id === id);
  if (!record) { setInfoStatus('That Map Library is no longer in the collection.', { ttl: 4000 }); return { ok: false, reason: 'unknown-library' }; }
  const token = ++mapLibraryRestoreToken;
  libraryListOpen = false;
  libraryPendingName = record.name;
  renderOrbitPanel();
  const selected = await libraryCollection.select(id, { persist: true });
  if (destroying || token !== mapLibraryRestoreToken) return { ...(selected || {}), stale: true };
  if (!selected?.library) { libraryPendingName = null; renderOrbitPanel(); setShellStatus('That Map Library could not be selected.'); return selected; }
  if (!selected.persisted) setShellStatus('Map Library selected for this session, but the selection could not be remembered.');
  const queried = mapLibraryReadQueryOverride ? { ok: true, permission: mapLibraryReadQueryOverride } : await orbitAdapter.queryReadPermission(record.handle);
  mapLibraryReadQueryOverride = null;
  if (destroying || token !== mapLibraryRestoreToken) return { ok: false, reason: 'stale' };
  if (!queried?.ok || queried.permission === 'denied') {
    await orbitState.restoreDirectory(record.handle, { name: record.name, permission: 'denied' });
    if (destroying || token !== mapLibraryRestoreToken) return { ok: false, reason: 'stale' };
    libraryCollection.markAccess(record.id, { permission: 'denied', phase: 'blocked', error: 'permission-denied' });
  } else {
    const permission = queried.permission === 'granted' ? 'granted' : 'prompt';
    await orbitState.restoreDirectory(record.handle, { name: record.name, permission, enumerate: permission === 'granted' });
    if (destroying || token !== mapLibraryRestoreToken) return { ok: false, reason: 'stale' };
    libraryCollection.markAccess(record.id, { permission, phase: permission === 'granted' ? 'ready' : 'blocked', error: permission === 'granted' ? null : 'permission-required', lastListedAt: permission === 'granted' ? Date.now() : null });
    if (permission === 'granted') await syncOrbitCurrentEntry();
  }
  if (destroying || token !== mapLibraryRestoreToken) return { ok: false, reason: 'stale' };
  libraryPendingName = null;
  renderOrbitPanel();
  orbitPanel?.focusAction?.();
  return { ok: true, library: selected.library, persisted: selected.persisted, permission: queried.permission };
}

async function refreshLibraryCollectionStatus() {
  if (!libraryCollection || destroying) return { ok: false, reason: 'unavailable' };
  const token = ++libraryCollectionRefreshToken;
  const snapshot = libraryCollection.snapshot();
  if (libraryCollectionStatusEl) libraryCollectionStatusEl.textContent = 'Refreshing Library status…';
  for (const record of snapshot.libraries) {
    const queried = await orbitAdapter.queryReadPermission(record.handle);
    if (destroying || token !== libraryCollectionRefreshToken) return { ok: false, reason: 'stale' };
    if (!queried?.ok || queried.permission === 'denied') libraryCollection.markAccess(record.id, { permission: 'denied', phase: 'blocked', error: 'permission-denied' });
    else if (queried.permission === 'granted') libraryCollection.markAccess(record.id, { permission: 'granted', phase: record.id === libraryCollection.snapshot().selectedId ? 'ready' : 'idle', error: null });
    else libraryCollection.markAccess(record.id, { permission: 'prompt', phase: 'blocked', error: 'permission-required' });
  }
  if (destroying || token !== libraryCollectionRefreshToken) return { ok: false, reason: 'stale' };
  renderLibraryCollection();
  return { ok: true };
}

if (libraryListAction) libraryListAction.addEventListener('click', () => {
  if (destroying) return;
  libraryListOpen = true;
  libraryPendingName = null;
  renderOrbitPanel();
  (libraryCollectionListEl?.querySelector('button') || libraryLinkButton)?.focus?.();
});
if (libraryLinkButton) libraryLinkButton.addEventListener('click', () => { if (!destroying) void requestLibraryConnection(); });
if (libraryEditButton) libraryEditButton.addEventListener('click', () => { if (!destroying) openLibraryEdit(); });
if (libraryCollectionRefreshButton) libraryCollectionRefreshButton.addEventListener('click', () => { if (!destroying) void refreshLibraryCollectionStatus(); });

function renderOrbitPanel() {
  if (!orbitPanel) return;
  let busy = false;
  try { busy = Boolean(orbitWorkspaceBusy || documentSaving || persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport); } catch { busy = false; }
  const canAdd = Boolean(hasMap && !busy);
  const snapshot = orbitState.snapshot();
  orbitPanel.render(snapshot, { supported: orbitAdapter.supported, currentKey: orbitCurrentEntryKey, busy, pendingName: libraryPendingName });
  const selectedLibrary = libraryCollection?.snapshot().selected;
  if (libraryEditButton) {
    libraryEditButton.hidden = !selectedLibrary || libraryListOpen || Boolean(libraryPendingName);
    libraryEditButton.disabled = busy || Boolean(libraryPendingName);
  }
  renderLibraryCollection();
  if (createMapDialog?.open) createMapDialog.refreshSaveLocation?.();
  syncSidebarTooltips();
}

async function syncOrbitCurrentEntry() {
  const token = ++orbitCurrentSeq;
  const handle = activeDocument.active ? activeDocument.handle : null;
  if (!handle || !orbitState.snapshot().handle) { orbitCurrentEntryKey = null; renderOrbitPanel(); return; }
  let result;
  try { result = await orbitState.matchEntry(handle); } catch { result = { ok: false, reason: 'comparison-failed' }; }
  if (destroying || token !== orbitCurrentSeq) return;
  if (!activeDocument.active || activeDocument.handle !== handle) return;
  orbitCurrentEntryKey = result.ok && result.matched ? result.matched.key : null;
  renderOrbitPanel();
}

async function persistMapLibraryHandle(handle, name) {
  if (globalThis.__M5_DISABLE_LIBRARY_PERSISTENCE__) return { ok: true, skipped: true };
  if (!libraryCollection || !handle || destroying) return { ok: false, reason: 'unavailable' };
  const result = await libraryCollection.adopt(handle, { name, permission: 'granted' });
  if (destroying) return { ...(result || {}), stale: true };
  if (!result?.ok) {
    const message = result?.reason === 'identity-unverified'
      ? 'The directory could not be compared with existing Map Libraries. It was not merged or remembered.'
      : 'Map Library is connected for this session, but its collection record could not be saved.';
    setShellStatus(message);
    return result;
  }
  if (!result.persisted) {
    setShellStatus('Map Library is connected for this session, but this directory could not be remembered. You may need to choose it again after reloading.');
  }
  return result;
}

async function restoreMapLibraryFromSettings() {
  if (mapLibraryStorageFailureForTest || globalThis.__M5_MAP_LIBRARY_STORAGE_FAIL__) { setInfoStatus('Map Library could not be restored from this browser. The app remains usable; choose a directory again.', { ttl: 6000 }); return; }
  if (globalThis.__M5_DISABLE_LIBRARY_PERSISTENCE__) return;
  const token = ++mapLibraryRestoreToken;
  if (!libraryCollection) {
    if (!destroying) setInfoStatus('Map Library settings storage is unavailable. Choose a directory for this session.', { ttl: 5000 });
    return;
  }
  const loaded = await libraryCollection.initialize();
  if (destroying || token !== mapLibraryRestoreToken) return;
  if (!loaded?.ok) {
    const message = loaded?.reason === 'invalid-collection-record'
      ? 'The saved Map Library collection is invalid and was not opened. Choose a directory to create a new session connection.'
      : 'Map Library could not be restored from this browser. The app remains usable; choose a directory again.';
    setInfoStatus(message, { ttl: 6000 });
    renderOrbitPanel();
    return;
  }
  const record = loaded.selectedId ? loaded.libraries.find((library) => library.id === loaded.selectedId) : null;
  if (!record?.handle) return;
  if (mapLibraryRestoreDelayForTest > 0) await new Promise((resolve) => setTimeout(resolve, mapLibraryRestoreDelayForTest));
  if (destroying || token !== mapLibraryRestoreToken) return;
  const queried = await orbitAdapter.queryReadPermission(record.handle);
  if (destroying || token !== mapLibraryRestoreToken) return;
  if (!queried?.ok) {
    await orbitState.restoreDirectory(record.handle, { name: record.name, permission: 'denied' });
    if (destroying || token !== mapLibraryRestoreToken) return;
    libraryCollection.markAccess(record.id, { permission: 'denied', phase: 'blocked', error: 'permission-query-failed' });
    renderOrbitPanel();
    return;
  }
  const permission = queried.permission === 'granted' ? 'granted' : queried.permission === 'denied' ? 'denied' : 'prompt';
  await orbitState.restoreDirectory(record.handle, { name: record.name, permission, enumerate: permission === 'granted' });
  if (destroying || token !== mapLibraryRestoreToken) return;
  libraryCollection.markAccess(record.id, { permission, phase: permission === 'granted' ? 'ready' : 'blocked', error: permission === 'granted' ? null : 'permission-required' });
  renderOrbitPanel();
}

async function reconnectMapLibrary() {
  const snapshot = orbitState.snapshot();
  if (!snapshot.handle || destroying) return;
  const token = ++mapLibraryRestoreToken;
  const queried = mapLibraryReadQueryOverride
    ? { ok: true, permission: mapLibraryReadQueryOverride }
    : await orbitAdapter.queryReadPermission(snapshot.handle);
  mapLibraryReadQueryOverride = null;
  if (destroying || token !== mapLibraryRestoreToken) return;
  const selectedLibraryId = libraryCollection?.snapshot().selectedId || null;
  if (queried?.ok && queried.permission === 'granted') {
    await orbitState.restoreDirectory(snapshot.handle, { name: snapshot.name, permission: 'granted', enumerate: true });
    if (destroying || token !== mapLibraryRestoreToken) return;
    const state = orbitState.snapshot();
    if (state.error) { libraryCollection?.markAccess(selectedLibraryId, { permission: 'granted', phase: 'blocked', error: 'listing-failed' }); setShellStatus('Map Library permission was granted, but its files could not be listed: ' + String(state.error.message || state.error.reason || 'unknown error')); }
    else { libraryCollection?.markAccess(selectedLibraryId, { permission: 'granted', phase: 'ready', error: null, lastListedAt: Date.now() }); await persistMapLibraryHandle(snapshot.handle, snapshot.name); setInfoStatus('Map Library reconnected. The current map was not changed.', { ttl: 4000 }); }
    renderOrbitPanel();
    return;
  }
  if (!queried?.ok || queried.permission === 'denied') {
    libraryCollection?.markAccess(selectedLibraryId, { permission: 'denied', phase: 'blocked', error: 'permission-denied' });
    await orbitState.restoreDirectory(snapshot.handle, { name: snapshot.name, permission: 'denied' });
    if (destroying || token !== mapLibraryRestoreToken) return;
    setShellStatus('Map Library access was not granted. Choose another directory or try Reconnect again.');
    renderOrbitPanel();
    return;
  }
  mapLibraryPermissionRequestCount += 1;
  const requested = mapLibraryPermissionOverride ? { ok: mapLibraryPermissionOverride !== 'denied', permission: mapLibraryPermissionOverride } : await orbitAdapter.requestReadPermission(snapshot.handle);
  mapLibraryPermissionOverride = null;
  if (destroying || token !== mapLibraryRestoreToken) return;
  if (!requested?.ok || requested.permission === 'denied') {
    libraryCollection?.markAccess(selectedLibraryId, { permission: 'denied', phase: 'blocked', error: 'permission-denied' });
    await orbitState.restoreDirectory(snapshot.handle, { name: snapshot.name, permission: 'denied' });
    if (destroying || token !== mapLibraryRestoreToken) return;
    setShellStatus('Map Library access was not granted. Choose another directory or try Reconnect again.');
    renderOrbitPanel();
    return;
  }
  await orbitState.restoreDirectory(snapshot.handle, { name: snapshot.name, permission: 'granted', enumerate: true });
  if (destroying || token !== mapLibraryRestoreToken) return;
  const state = orbitState.snapshot();
  if (state.error) { libraryCollection?.markAccess(selectedLibraryId, { permission: 'granted', phase: 'blocked', error: 'listing-failed' }); setShellStatus('Map Library permission was granted, but its files could not be listed: ' + String(state.error.message || state.error.reason || 'unknown error')); }
  else { libraryCollection?.markAccess(selectedLibraryId, { permission: 'granted', phase: 'ready', error: null, lastListedAt: Date.now() }); await persistMapLibraryHandle(snapshot.handle, snapshot.name); setInfoStatus('Map Library reconnected. The current map was not changed.', { ttl: 4000 }); }
  renderOrbitPanel();
}

async function requestLibraryConnection() {
  if (destroying || permissionDialog?.open) return { ok: false, reason: 'busy' };
  if (!permissionDialog) return openOrbit();
  const accepted = await permissionDialog.showLibraryConnection();
  if (!accepted || destroying) return { ok: false, reason: 'cancelled' };
  return openOrbit();
}

async function openOrbit({ deferStatus = false } = {}) {
  mapLibraryRestoreToken += 1;
  if (destroying) return { ok: false, reason: 'stale', stale: true };
  if (orbitWorkspaceBusy) { if (!deferStatus) setShellStatus('Finish the current Orbit write before switching or closing Orbit.'); return { ok: false, reason: 'busy' }; }
  const ownership = claimDocumentOwnership();
  const previousLibrary = orbitState.snapshot();
  let statusMessage = null; let statusKind = 'actionable';
  const publishStatus = (message, kind = 'actionable') => { statusMessage = message; statusKind = kind; if (!deferStatus) { if (kind === 'routine') setRoutineStatus(message); else setShellStatus(message); } };
  orbitDocumentOpenSeq += 1;
  if (pendingBackupImport?.documentMeta?.origin === 'orbit') clearPendingBackupImport();
  const pending = orbitState.openDirectory({ mode: 'read' });
  renderOrbitPanel();
  const result = await pending;
  if (destroying) return { ok: false, reason: 'stale', stale: true, ownership, statusMessage };
  if (result?.ok) {
    libraryListOpen = false;
    libraryPendingName = null;
    const snapshot = orbitState.snapshot();
    publishStatus('Map Library connected: ' + (result.state?.name || snapshot.name || 'directory') + '.', 'routine');
    await persistMapLibraryHandle(snapshot.handle, snapshot.name);
    await syncOrbitCurrentEntry();
  } else if (result?.reason === 'cancelled') {
    publishStatus('Orbit selection cancelled. The current Orbit and map were preserved.', 'routine');
  } else if (result?.reason === 'unsupported') {
    publishStatus('Directory selection is not supported in this browser.', 'routine');
  } else if (result?.reason === 'permission-denied') {
    publishStatus('Orbit write permission was not granted. The current Orbit and map were preserved.');
  } else if (result?.reason !== 'stale') {
    publishStatus('Could not open Map Library: ' + String(result?.message || result?.reason || 'unknown error'));
    if (previousLibrary?.handle) {
      await orbitState.restoreDirectory(previousLibrary.handle, { name: previousLibrary.name, permission: previousLibrary.permission === 'prompt' ? 'prompt' : previousLibrary.permission || 'denied', enumerate: previousLibrary.permission === 'granted' });
    }
  }
  renderOrbitPanel();
  return { ...(result || {}), ownership, statusMessage, statusKind };
}

async function refreshOrbit({ deferStatus = false } = {}) {
  if (destroying || !orbitState.snapshot().handle) return { ok: false, reason: 'no-orbit' };
  if (orbitWorkspaceBusy) { if (!deferStatus) setShellStatus('Finish the current Orbit write before refreshing the list.'); return { ok: false, reason: 'busy' }; }
  const pending = orbitState.refresh();
  renderOrbitPanel();
  const result = await pending;
  if (destroying) return { ...(result || {}), stale: true, statusMessage: null };
  let statusMessage = null; let statusKind = 'actionable';
  if (result?.ok) {
    await syncOrbitCurrentEntry();
    statusMessage = result.truncated ? 'Orbit refreshed; the list is truncated.' : 'Orbit refreshed.'; statusKind = 'routine';
  } else if (result?.reason !== 'stale') {
    statusMessage = 'Orbit refresh failed: ' + String(result?.message || result?.reason || 'unknown error');
  }
  if (statusMessage && !deferStatus) { if (statusKind === 'routine') setRoutineStatus(statusMessage); else setShellStatus(statusMessage); }
  renderOrbitPanel();
  return { ...(result || {}), statusMessage, statusKind };
}

function closeOrbit() {
  if (destroying) return;
  if (orbitWorkspaceBusy) { setShellStatus('Finish the current Orbit write before closing Orbit.'); return; }
  orbitDocumentOpenSeq += 1;
  if (pendingBackupImport?.documentMeta?.origin === 'orbit') clearPendingBackupImport();
  orbitState.close();
  orbitCurrentEntryKey = null;
  orbitCurrentSeq += 1;
  renderOrbitPanel();
  orbitPanel?.focusAction?.();
  setRoutineStatus('Orbit closed. The current map and its destination were preserved.');
}

async function askOrbitConflict({ filename, reason, allowOverwrite = true }) {
  if (!orbitConflictDialog) return { decision: 'cancel' };
  let copyPick = null;
  const decision = await orbitConflictDialog.show({
    filename,
    reason,
    allowOverwrite,
    onSaveCopy: () => {
      copyPick = documentAdapter.writableSupported
        ? documentAdapter.pickSave(safeDocumentFilename(filename))
        : Promise.resolve({ ok: false, reason: 'unsupported' });
    }
  });
  if (decision !== 'copy') return { decision };
  const picked = copyPick ? await copyPick : { ok: false, reason: 'unsupported' };
  return { decision, picked };
}

async function resolveCopyDestination(candidate, original) {
  if (!candidate) return { ok: false, reason: 'copy-identity-missing' };
  if (candidate === original) return { ok: true, distinct: false, same: true };
  const comparators = [];
  if (typeof candidate.isSameEntry === 'function') comparators.push(() => candidate.isSameEntry(original));
  if (typeof original?.isSameEntry === 'function') comparators.push(() => original.isSameEntry(candidate));
  if (comparators.length === 0) return { ok: false, reason: 'copy-identity-unavailable' };
  try {
    for (const compare of comparators) {
      if (await compare()) return { ok: true, distinct: false, same: true };
    }
    return { ok: true, distinct: true, same: false };
  } catch {
    return { ok: false, reason: 'copy-identity-failed' };
  }
}


async function protectOrbitOverwrite({ handle, name, owns, approval = null, interactive = true }) {
  if (!activeDocument.active || activeDocument.origin !== 'orbit') {
    return { ok: true, handle, name, approval: null, copied: false };
  }
  if (!activeDocument.baseline) {
    return { ok: false, reason: 'unprotected-baseline', message: 'This Orbit document has no overwrite baseline. Reopen it before saving.' };
  }
  const acceptCopy = async (decision) => {
    if (!decision.picked?.ok) return { ok: false, reason: decision.picked?.reason || 'cancelled', cancelled: decision.picked?.reason === 'cancelled' };
    const identity = await resolveCopyDestination(decision.picked.handle, handle);
    if (!owns()) return { ok: false, reason: 'stale', stale: true };
    if (!identity.ok) return { ok: false, reason: identity.reason, cancelled: true, message: 'Save a Copy could not prove a different destination; the original was not overwritten.' };
    if (!identity.distinct) return { ok: false, reason: 'same-destination', cancelled: true, message: 'Save a Copy selected the original destination; the save was cancelled. Use Save and choose Overwrite explicitly.' };
    return { ok: true, handle: decision.picked.handle, name: decision.picked.handle?.name || name, approval: null, copied: true };
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await preflightOverwrite({
      baseline: activeDocument.baseline,
      handle,
      documentIdentity: activeDocument.documentIdentity,
      approval,
      isCurrent: owns,
      cryptoApi: globalThis.crypto
    });
    if (!owns()) return { ok: false, reason: 'stale', stale: true };
    if (result.ok) return { ok: true, handle, name, approval, copied: false };
    if (result.reason === 'approval-stale') { approval = null; continue; }
    if (result.reason === 'not-found') {
      return { ok: false, reason: 'not-found', actionable: true, message: 'The destination file no longer exists. Save a Copy or reopen the file.' };
    }
    if (result.reason === 'unverifiable') {
      if (!interactive) return { ok: false, reason: 'conflict', actionable: true, message: 'The file changed or cannot be verified. Choose Retry or Save As.' };
      const decision = await askOrbitConflict({ filename: name, reason: 'unverifiable', allowOverwrite: false });
      if (!owns()) return { ok: false, reason: 'stale', stale: true };
      if (decision.decision === 'copy') return acceptCopy(decision);
      return { ok: false, reason: 'conflict-cancelled', cancelled: true, message: UNSAVED_MESSAGE };
    }
    if (result.reason === 'conflict') {
      if (!interactive) return { ok: false, reason: 'conflict', actionable: true, message: 'The file changed externally. Choose Retry or Save As.' };
      const decision = await askOrbitConflict({ filename: name, reason: 'changed', allowOverwrite: true });
      if (!owns()) return { ok: false, reason: 'stale', stale: true };
      if (decision.decision === 'copy') return acceptCopy(decision);
      if (decision.decision !== 'overwrite') return { ok: false, reason: 'conflict-cancelled', cancelled: true, message: UNSAVED_MESSAGE };
      const approved = createOverwriteApproval(result.conflict);
      if (!approved.ok) return { ok: false, reason: approved.reason || 'unverifiable', unverifiable: true };
      approval = approved.approval;
      continue;
    }
    return { ok: false, reason: result.reason || 'preflight-failed', message: result.message || 'The destination could not be verified.' };
  }
  return { ok: false, reason: 'conflict-stale', message: 'The destination changed while the conflict was being resolved. Try again.' };
}

function snapshotCopyAttachments(sourceTree, sourceRegistry) {
  const copyTree = structuredClone(sourceTree);
  const ids = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const id = node.data?.attachmentId;
    if (id) ids.add(String(id));
    for (const child of node.children || []) visit(child);
  };
  visit(copyTree);
  const registry = createAttachmentRegistry({ datasetToken });
  for (const id of ids) {
    const record = sourceRegistry.get(id);
    if (!record) { registry.clear(); return { ok: false, reason: 'attachment-missing', message: 'A referenced attachment is unavailable.' }; }
    const adopted = registry.adopt({ attachmentId: id, file: record.file, metadata: record.metadata });
    if (!adopted.ok) { registry.clear(); return { ok: false, reason: adopted.reason || 'attachment-copy-failed', message: adopted.message || 'An attachment could not be retained.' }; }
    registry.commit(id);
  }
  return { ok: true, tree: copyTree, registry };
}

let copyMapOperation = 0;
let copyEncodingGate = null;
async function sameDirectoryHandle(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  for (const [left, right] of [[a, b], [b, a]]) {
    if (typeof left?.isSameEntry === 'function') {
      try { if (await left.isSameEntry(right)) return true; } catch {}
    }
  }
  return false;
}
async function copyCurrentMap() {
  if (copyMapBusy) { setShellStatus('Copy Map is already in progress.'); return { ok: false, reason: 'busy' }; }
  copyMapBusy = true;
  if (copyMapButton) { copyMapButton.disabled = true; copyMapButton.dataset.available = 'false'; }
  try { return await runCopyMap(); }
  finally { copyMapBusy = false; syncPersistenceControls(); }
}
async function runCopyMap() {
  if (destroying || !hasMap || !tree || !attachmentRegistry) { setShellStatus('There is no map to copy.'); return { ok: false, reason: 'no-map' }; }
  if (editorController?.isOpen()) { setShellStatus('Finish or close the editor draft before copying the map.'); return { ok: false, reason: 'editor-open' }; }
  if (!orbitAdapter.supported) { setShellStatus('Folder copy is not available in this browser. Download remains available.'); return { ok: false, reason: 'unsupported' }; }
  if (orbitWorkspaceBusy || persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport || documentSaveInFlight || navigator?.busy || dragState) {
    setShellStatus('Finish the current save, replacement, or navigation before copying the map.'); return { ok: false, reason: 'busy' };
  }
  const owner = Object.freeze({ operation: ++copyMapOperation, ownership: documentOwnershipSeq, session: persistenceSessionSeq, dataset: datasetToken, documentHandle: activeDocument.handle, documentIdentity: activeDocument.documentIdentity, revision: dataRevision });
  const current = () => !destroying && owner.operation === copyMapOperation
    && owner.ownership === documentOwnershipSeq
    && owner.session === persistenceSessionSeq
    && owner.dataset === datasetToken
    && owner.documentHandle === activeDocument.handle
    && owner.documentIdentity === activeDocument.documentIdentity
    && owner.revision === dataRevision;
  let picked;
  try { picked = await orbitAdapter.pickDirectory(); }
  catch (error) { picked = { ok: false, reason: 'picker-failed', message: String(error?.message || error) }; }
  if (!current()) return { ok: false, stale: true };
  if (!picked?.ok) {
    if (picked?.reason === 'cancelled') setRoutineStatus('Copy cancelled. The current map and folder were not changed.');
    else if (picked?.reason === 'permission-denied') setShellStatus('Folder access was not granted. The current map and folder were not changed.');
    else if (picked?.reason === 'unsupported') setShellStatus('Folder copy is not available in this browser. Download remains available.');
    else setShellStatus('The copy destination could not be selected. The current map and folder were not changed.');
    return { ok: false, reason: picked?.reason || 'picker-failed', cancelled: picked?.reason === 'cancelled' };
  }
  const filename = safeDocumentFilename(activeDocument.name || tree.name || 'FileOrbit map');
  const collision = await preflightOrbitFilename(picked.handle, filename, current);
  if (!current()) return { ok: false, stale: true };
  if (!collision.ok) {
    setShellStatus(collision.reason === 'exists' ? 'A file with that name already exists in the selected folder. The copy was not created.' : collision.message || 'The copy destination could not be checked. The copy was not created.');
    return { ok: false, reason: collision.reason || 'preflight-failed' };
  }
  const snapshot = snapshotCopyAttachments(tree, attachmentRegistry);
  if (!snapshot.ok) { setShellStatus(snapshot.message || 'The current map could not be copied.'); return { ok: false, reason: snapshot.reason || 'snapshot-failed' }; }
  let encoded;
  const encodeGate = copyEncodingGate;
  const encodeCrypto = encodeGate ? { subtle: { digest: async (...args) => { encodeGate.started = true; await encodeGate.promise; return globalThis.crypto.subtle.digest(...args); } } } : globalThis.crypto;
  try { encoded = await encodeBackup({ tree: snapshot.tree, registry: snapshot.registry, mapName: filename, sourceMapId: activeMap?.mapId || null, cryptoApi: encodeCrypto, policyContext: largeMapPolicyContext }); }
  catch (error) {
    if (!current()) return { ok: false, stale: true };
    setShellStatus('Copy Map could not prepare the copy: ' + String(error?.message || error));
    return { ok: false, reason: 'encode-failed' };
  }
  finally { snapshot.registry.clear(); }
  if (!current()) return { ok: false, stale: true };
  let created;
  try { created = await orbitAdapter.createMapFile(picked.handle, filename, { isCurrent: current }); }
  catch (error) { if (!current()) return { ok: false, stale: true }; setShellStatus('The copy file could not be created: ' + String(error?.message || error)); return { ok: false, reason: 'create-failed' }; }
  if (!current()) return { ok: false, stale: true };
  if (!created.ok) {
    setShellStatus(created.reason === 'exists' ? 'A file with that name already exists in the selected folder. The copy was not created.' : created.message || 'The copy file could not be created.');
    return { ok: false, reason: created.reason || 'create-failed' };
  }
  let written;
  try { written = await documentAdapter.write(created.handle, encoded.blob); }
  catch (error) { if (!current()) return { ok: false, stale: true }; setShellStatus('The copy file was created, but the copy could not be confirmed. The source map was not changed.'); return { ok: false, reason: 'write-failed' }; }
  if (!current()) return { ok: false, stale: true };
  if (!written.ok) { setShellStatus('The copy file was created, but the copy could not be confirmed. The source map was not changed.'); return { ok: false, reason: written.reason || 'write-failed' }; }
  const folderName = String(picked.name || picked.handle?.name || 'selected folder');
  const connected = orbitState.snapshot();
  if (connected.handle && await sameDirectoryHandle(picked.handle, connected.handle)) { if (current()) await refreshOrbit({ deferStatus: true }); }
  if (!current()) return { ok: false, stale: true };
  setRoutineStatus('Map copied to ' + folderName + '.');
  return { ok: true, name: filename, folder: folderName };
}


async function openOrbitEntry(entry) {
  if (destroying || !entry?.handle) return;
  if (!/\.orbit$/i.test(entry.name || '')) { setShellStatus('Only .orbit files are supported. Choose a .orbit file.'); return; }
  if (orbitWorkspaceBusy) { setShellStatus('Finish the current Orbit write before opening another map.'); return; }
  if (editorAppliedOperation || editorController?.isSaving()) { setShellStatus('Finish the applied editor Save or Retry before opening an Orbit map.'); return; }
  if (persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport) { setShellStatus('Finish the current save, open, or replacement before opening an Orbit map.'); return; }
  const ownership = claimDocumentOwnership();
  const ownerSession = persistenceSessionSeq; const ownerDataset = datasetToken;
  const token = ++orbitDocumentOpenSeq;
  clearOpenErrorStatus();
  const identity = 'orbit:' + (++orbitDocumentSeq);
  const ownerCurrent = () => !destroying && ownership === documentOwnershipSeq && token === orbitDocumentOpenSeq;
  const sessionCurrent = () => ownerSession === persistenceSessionSeq && ownerDataset === datasetToken;
  let file;
  try { file = await entry.handle.getFile(); }
  catch (error) {
    if (ownerCurrent() && sessionCurrent()) setOpenErrorStatus(error?.name === 'NotFoundError' ? 'That Orbit map no longer exists. Refresh the list.' : 'Could not read that Orbit map.', token);
    return;
  }
  if (!ownerCurrent() || !sessionCurrent()) return;
  if (!(file.size <= MAX_ORBIT_BASELINE_BYTES)) { if (ownerCurrent() && sessionCurrent()) setOpenErrorStatus('That Orbit map exceeds the supported file size.', token); return; }
  const opened = await createOpenedContentBaseline({
    handle: entry.handle,
    bytes: file,
    observed: { size: file.size, lastModified: file.lastModified },
    binding: { handle: entry.handle, documentIdentity: identity, revision: 0 },
    cryptoApi: globalThis.crypto,
    isCurrent: () => ownerCurrent() && sessionCurrent()
  });
  if (!ownerCurrent() || !sessionCurrent()) return;
  if (!opened.ok) { if (ownerCurrent() && sessionCurrent()) setOpenErrorStatus('Could not establish an open baseline: ' + String(opened.message || opened.reason || 'unknown error'), token); return; }
  const result = await importBackupFile(file, {
    name: entry.name,
    handle: entry.handle,
    mode: 'writable',
    origin: 'orbit',
    documentIdentity: identity,
    openedBaseline: opened.baseline,
    orbitToken: token,
    ownership,
    legacy: false
  });
  if (!ownerCurrent()) {
    if (pendingBackupImport?.documentMeta?.ownership === ownership) clearOwnedBackupImport(pendingBackupImport);
    if (installingBackupImport?.documentMeta?.ownership === ownership) clearOwnedBackupImport(installingBackupImport);
    return;
  }
  if (result?.ok) { clearOpenErrorStatus(); if (result.pending === 'map' || result.pending === 'editor') setShellStatus('Finish the current map/editor decision to open the Orbit map.'); else setRoutineStatus('Opened ' + entry.name + '.'); syncOrbitCurrentEntry(); }
  else if (result?.reason !== 'stale' && result?.reason !== 'cancelled') setOpenErrorStatus('Could not open Orbit map: ' + String(result?.error?.message || result?.reason || 'unknown error'), token);
  renderOrbitPanel();
}

function browserBusy() {
  try { return Boolean(orbitWorkspaceBusy || documentSaving || persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport || fileOpenBrowser?.isBusy); } catch { return false; }
}

async function connectFolder() {
  const blocked = openRequestBlockedReason();
  if (blocked) { setShellStatus(blocked); return { ok: false, reason: 'blocked' }; }
  const result = await openOrbit();
  if (result?.reason === 'cancelled') showTransientStatus('Orbit selection cancelled. The current Orbit and map were preserved.');
  if (result?.ok) {
    setRailExpanded(true);
    orbitPanel?.setRailExpanded?.(true);
    orbitPanel?.focusAction?.();
  }
  return result;
}

function browserEmptySnapshot(phase = 'idle', error = null) {
  return { phase, handle: null, name: '', path: [], folders: [], files: [], error, truncated: false, canConnect: false };
}
function browserSnapshotFor(pathValue, phase, entries = [], { error = null, truncated = false } = {}) {
  const current = pathValue[pathValue.length - 1];
  const folders = entries.filter((entry) => entry.kind === 'folder')
    .map((entry) => ({ ...entry, key: 'folder:' + entry.name }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  const files = entries.filter((entry) => entry.kind !== 'folder')
    .map((entry) => ({ ...entry, key: 'file:' + entry.name }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  return { phase, handle: current?.handle || null, name: current?.name || '', path: pathValue.map((part, index) => ({ index, key: 'path:' + index + ':' + part.name, name: part.name })), folders, files, error, truncated, canConnect: Boolean(current?.handle) };
}
async function listBrowserPath(nextPath, { initial = false } = {}) {
  if (!fileOpenBrowser?.isOpen) return { ok: false, reason: 'stale' };
  const request = fileOpenBrowser.requestId; const session = persistenceSessionSeq; const dataset = datasetToken;
  const sequence = ++browserListingSeq;
  const current = () => Boolean(fileOpenBrowser?.isOpen && fileOpenBrowser.requestId === request && fileOpenBrowser.owns(session, dataset) && sequence === browserListingSeq && session === persistenceSessionSeq && dataset === datasetToken);
  fileOpenBrowser.update({ ...(browserSnapshot || browserEmptySnapshot('listing')), phase: 'listing' }, { busy: true });
  let result;
  try { result = await orbitAdapter.enumerateBrowserEntries(nextPath[nextPath.length - 1].handle, { isCurrent: current }); }
  catch (error) { result = { ok: false, reason: 'enumerate-failed', message: String(error?.message || error) }; }
  if (!current()) return { ok: false, reason: 'stale' };
  if (!result?.ok) {
    const message = result?.reason === 'permission-denied' ? 'Folder permission was denied. Choose another folder or restore access.' : (result?.message || 'The folder contents could not be listed.');
    if (!initial) {
      fileOpenBrowser.update({ ...(browserSnapshot || browserEmptySnapshot('blocked')), phase: 'blocked', error: { message } }, { busy: false });
    } else {
      browserPath = nextPath;
      browserSnapshot = browserSnapshotFor(nextPath, 'blocked', [], { error: { message } });
      fileOpenBrowser.update(browserSnapshot, { busy: false });
    }
    return { ...result, message };
  }
  browserPath = nextPath;
  browserSnapshot = browserSnapshotFor(nextPath, 'ready', result.entries || [], { truncated: Boolean(result.truncated) });
  fileOpenBrowser.update(browserSnapshot, { busy: false });
  return { ok: true, entries: result.entries || [], truncated: Boolean(result.truncated) };
}
async function openFileBrowser() {
  if (destroying) return;
  if (editorAppliedOperation || editorController?.isSaving()) { setShellStatus('Finish the applied editor Save or Retry before opening a document.'); return; }
  if (persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport) { setShellStatus('Finish the current save, open, or backup operation first.'); return; }
  const blocked = openRequestBlockedReason();
  if (blocked) { setShellStatus(blocked); return; }
  if (!fileOpenBrowser) { setShellStatus('Orbit Folder browser is unavailable. No folder was connected.'); return; }
  const connected = orbitState.snapshot();
  fileOpenBrowser.show({ session: persistenceSessionSeq, dataset: datasetToken });
  const request = fileOpenBrowser.requestId;
  const session = persistenceSessionSeq;
  const dataset = datasetToken;
  const sequence = ++browserListingSeq;
  const owns = () => browserRequestIsCurrent({
    dialogOpen: Boolean(fileOpenBrowser?.isOpen),
    request, currentRequest: fileOpenBrowser?.requestId,
    session, dataset, sequence, currentSequence: browserListingSeq,
    currentSession: persistenceSessionSeq, currentDataset: datasetToken,
    dialogOwns: fileOpenBrowser?.owns(session, dataset)
  });
  if (!connected.handle || connected.phase === 'blocked') {
    if (!owns()) return;
    browserPath = [];
    browserSnapshot = browserEmptySnapshot(connected.phase === 'blocked' ? 'blocked' : 'idle', connected.phase === 'blocked' ? { message: 'The connected folder is unavailable. Choose another folder.' } : null);
    fileOpenBrowser.update(browserSnapshot, { busy: false });
    return;
  }
  const candidatePath = [{ handle: connected.handle, name: String(connected.name || connected.handle.name || 'Orbit') }];
  browserSnapshot = browserSnapshotFor(candidatePath, 'listing');
  fileOpenBrowser.update(browserSnapshot, { busy: true });
  const permission = await orbitAdapter.queryReadPermission(connected.handle);
  if (!owns()) {
    if (fileOpenBrowser?.isOpen && fileOpenBrowser.requestId === request && !fileOpenBrowser.owns(session, dataset)) {
      fileOpenBrowser.close({ restoreFocus: false });
    }
    return;
  }
  if (!permission.ok || permission.permission === 'denied') {
    browserPath = [];
    browserSnapshot = browserEmptySnapshot('blocked', { message: 'The connected folder is not authorized. Choose another folder.' });
    fileOpenBrowser.update(browserSnapshot, { busy: false });
    return;
  }
  browserPath = candidatePath;
  browserSnapshot = browserSnapshotFor(candidatePath, 'listing');
  fileOpenBrowser.update(browserSnapshot, { busy: true });
  await listBrowserPath(candidatePath, { initial: true });
}
async function chooseFolderForBrowser() {
  if (!fileOpenBrowser?.isOpen) return { ok: false, reason: 'stale' };
  const request = fileOpenBrowser.requestId; const session = persistenceSessionSeq; const dataset = datasetToken;
  const operation = { request, session, dataset }; browserOperation = operation;
  const picked = await orbitAdapter.pickDirectory({ mode: 'read' });
  if (browserOperation === operation) browserOperation = null;
  if (!fileOpenBrowser?.isOpen || fileOpenBrowser.requestId !== request || !fileOpenBrowser.owns(session, dataset)) return { ...(picked || {}), stale: true };
  if (!picked?.ok) {
    const message = picked?.reason === 'cancelled' ? 'Folder selection cancelled. The current folder and map were preserved.' : picked?.reason === 'permission-denied' ? 'Folder permission was not granted. The current folder and map were preserved.' : 'The folder could not be selected. The current folder and map were preserved.';
    fileOpenBrowser.update(browserSnapshot || browserEmptySnapshot(), { busy: false });
    fileOpenBrowser.setBusy(false, message);
    setShellStatus(message);
    return picked;
  }
  const nextPath = [{ handle: picked.handle, name: String(picked.name || picked.handle.name || 'Orbit') }];
  browserSnapshot = browserSnapshotFor(nextPath, 'listing');
  fileOpenBrowser.update(browserSnapshot, { busy: true });
  return listBrowserPath(nextPath, { initial: true });
}
async function refreshBrowser() {
  if (!fileOpenBrowser?.isOpen || browserPath.length === 0) { fileOpenBrowser?.setBusy(false); return { ok: false, reason: 'no-folder' }; }
  return listBrowserPath([...browserPath]);
}
async function navigateBrowserFolder(entry) {
  if (!fileOpenBrowser?.isOpen || !entry?.handle) return;
  const nextPath = [...browserPath, { handle: entry.handle, name: String(entry.name || entry.handle.name || 'Folder') }];
  await listBrowserPath(nextPath);
}
async function navigateBrowserBreadcrumb(index) {
  if (!fileOpenBrowser?.isOpen || !Number.isSafeInteger(index) || index < 0 || index >= browserPath.length) return;
  if (index === browserPath.length - 1) return;
  await listBrowserPath(browserPath.slice(0, index + 1));
}
async function navigateBrowserUp() {
  if (!fileOpenBrowser?.isOpen || browserPath.length <= 1) return;
  await listBrowserPath(browserPath.slice(0, -1));
}
async function connectBrowserFolder() {
  if (!fileOpenBrowser?.isOpen || browserPath.length === 0) return { ok: false, reason: 'no-folder' };
  const request = fileOpenBrowser.requestId; const session = persistenceSessionSeq; const dataset = datasetToken;
  const handle = browserPath[browserPath.length - 1].handle;
  const name = browserPath[browserPath.length - 1].name;
  fileOpenBrowser.setBusy(true, 'Checking folder permission…');
  const permission = await orbitAdapter.requestWritePermission(handle);
  if (!fileOpenBrowser?.isOpen || fileOpenBrowser.requestId !== request || !fileOpenBrowser.owns(session, dataset)) return { ...(permission || {}), stale: true };
  if (!permission?.ok) {
    const message = permission?.reason === 'permission-denied' ? 'Write access was not granted. The folder was not connected.' : 'The folder could not be connected.';
    fileOpenBrowser.setBusy(false, message); setShellStatus(message); return permission;
  }
  const adopted = await orbitState.adoptDirectory(handle, { name, permission: permission.permission || 'granted' });
  if (!fileOpenBrowser?.isOpen || fileOpenBrowser.requestId !== request || !fileOpenBrowser.owns(session, dataset)) return { ...(adopted || {}), stale: true };
  fileOpenBrowser.setBusy(false);
  if (!adopted?.ok) {
    const message = adopted?.message || 'The folder could not be connected.';
    fileOpenBrowser.setBusy(false, message); setShellStatus(message); return adopted;
  }
  fileOpenBrowser.close({ restoreFocus: false });
  renderOrbitPanel();
  setRailExpanded(true); orbitPanel?.setRailExpanded?.(true); orbitPanel?.focusAction?.();
  setRoutineStatus('Connected ' + name + '. The current map was not changed.');
  return adopted;
}

globalThis.__M5_TEST_CONNECT_ORBIT__ = async () => {
  const picked = await orbitAdapter.pickDirectory();
  if (!picked?.ok) return picked;
  const adopted = await orbitState.adoptDirectory(picked.handle, { name: picked.name || picked.handle?.name || 'Orbit', permission: picked.permission || 'granted' });
  renderOrbitPanel();
  return adopted;
};

async function openDocument() {
  cancelStartupRecovery();
  if (editorAppliedOperation || editorController?.isSaving()) { setShellStatus('Finish the applied editor Save or Retry before opening a document.'); return { ok: false, reason: 'editor-owned' }; }
  if (persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport) { setShellStatus('Finish the current save, open, or backup operation first.'); return { ok: false, reason: 'busy' }; }
  const blocked = openRequestBlockedReason();
  if (blocked) { setShellStatus(blocked); return { ok: false, reason: 'blocked' }; }
  if (!documentAdapter.writableSupported) { chooseBackupFile({ asDocument: true }); return { ok: true, pending: 'picker' }; }
  const ownership = claimDocumentOwnership();
  const picked = await documentAdapter.pickOpen();
  if (ownership !== documentOwnershipSeq) return { ok: false, reason: 'stale' };
  if (!picked.ok) {
    if (picked.reason === 'cancelled') showTransientStatus('Open cancelled. The current map and edits were preserved.');
    else if (picked.reason === 'permission-denied') setShellStatus('Permission to read that document was denied. The current map was preserved.');
    else setShellStatus('Could not open that document. The current map was preserved.');
    return picked;
  }
  if (!/\.orbit$/i.test(picked.file.name || '')) { setShellStatus('Only .orbit files are supported. The current map was preserved.'); return { ok: false, reason: 'unsupported-extension' }; }
  if (!(picked.file.size <= MAX_ORBIT_BASELINE_BYTES)) { setShellStatus('That Orbit map exceeds the supported file size. The current map was preserved.'); return { ok: false, reason: 'too-large' }; }
  const canBaseline = typeof picked.file?.arrayBuffer === 'function';
  let token = null;
  let identity = null;
  let opened = null;
  if (canBaseline) {
    token = ++orbitDocumentOpenSeq;
    identity = 'orbit:' + (++orbitDocumentSeq);
    opened = await createOpenedContentBaseline({
      handle: picked.handle,
      bytes: picked.file,
      observed: { size: picked.file.size, lastModified: picked.file.lastModified },
      binding: { handle: picked.handle, documentIdentity: identity, revision: 0 },
      cryptoApi: globalThis.crypto,
      isCurrent: () => ownership === documentOwnershipSeq && token === orbitDocumentOpenSeq
    });
    if (ownership !== documentOwnershipSeq || token !== orbitDocumentOpenSeq) return { ok: false, reason: 'stale' };
    if (!opened.ok) { setShellStatus('Could not establish an open baseline: ' + String(opened.message || opened.reason || 'unknown error') + '. The current map was preserved.'); return { ok: false, reason: opened.reason || 'baseline-failed' }; }
  }
  const result = await importBackupFile(picked.file, canBaseline ? {
    name: picked.file.name,
    handle: picked.handle,
    mode: 'writable',
    origin: 'orbit',
    documentIdentity: identity,
    openedBaseline: opened.baseline,
    orbitToken: token,
    ownership,
    legacy: false
  } : {
    name: picked.file.name,
    handle: picked.handle,
    mode: 'writable',
    ownership
  });
  if (result?.ok && !result.pending) syncOrbitCurrentEntry();
  return result;
}
let documentSaveInFlight = false;
let documentSaveOwner = null;
let documentSaving = false;
function invalidateDocumentSave() {
  documentOperation += 1;
  documentSaveOwner = null;
  documentSaveInFlight = false;
  documentSaving = false;
}
function automaticSaveContextCurrent(request) {
  return Boolean(request && !destroying && request.token === automaticSaveToken
    && request.ownership === documentOwnershipSeq
    && request.session === persistenceSessionSeq
    && request.dataset === datasetToken
    && hasMap && tree && attachmentRegistry
    && activeDocument.handle === request.handle
    && activeDocument.documentIdentity === request.identity);
}

function clearSaveFeedbackMessageTimer() {
  if (saveFeedbackMessageTimer !== null) { clearTimeout(saveFeedbackMessageTimer); saveFeedbackMessageTimer = null; }
}

function scheduleSaveFeedbackMessageDismiss() {
  clearSaveFeedbackMessageTimer();
  if (!saveFeedbackEl || saveFeedbackEl.hidden || saveFeedbackMessageDismissed) return;
  saveFeedbackMessageTimer = setTimeout(() => {
    saveFeedbackMessageTimer = null;
    if (!saveFeedbackEl || saveFeedbackEl.hidden) return;
    saveFeedbackMessageDismissed = true;
    if (saveFeedbackTextEl) saveFeedbackTextEl.textContent = '';
  }, TRANSIENT_NOTIFICATION_MS);
}

function syncAutomaticSaveFeedback() {
  if (!saveFeedbackEl) return;
  const failure = automaticSaveFailure;
  if (!failure) clearSaveFeedbackMessageTimer();
  saveFeedbackEl.hidden = !failure;
  if (!failure) {
    saveFeedbackMessageDismissed = false;
    if (saveFeedbackTextEl) saveFeedbackTextEl.textContent = '';
    if (saveFeedbackRetry) { saveFeedbackRetry.hidden = true; saveFeedbackRetry.disabled = true; }
    if (saveFeedbackSaveAs) { saveFeedbackSaveAs.hidden = true; saveFeedbackSaveAs.disabled = true; }
    return;
  }
  if (saveFeedbackTextEl) {
    saveFeedbackTextEl.textContent = saveFeedbackMessageDismissed ? '' : (failure.reason === 'no-destination'
      ? 'Changes are not saved. Choose Save As to set a writable destination.'
      : UNSAVED_MESSAGE);
  }
  scheduleSaveFeedbackMessageDismiss();
  const current = automaticSaveContextCurrent(failure);
  if (saveFeedbackRetry) {
    saveFeedbackRetry.hidden = failure.reason === 'no-destination' || !current;
    saveFeedbackRetry.disabled = !current || automaticSaveActionInFlight;
  }
  if (saveFeedbackSaveAs) { saveFeedbackSaveAs.hidden = !current; saveFeedbackSaveAs.disabled = !current || automaticSaveActionInFlight; }
}

function setAutomaticSaveFailure(request, result, { force = false } = {}) {
  if (!force && (automaticSaveBlocked || request?.token !== automaticSaveToken)) return;
  clearTransientShellStatus();
  saveFeedbackMessageDismissed = false;
  clearSaveFeedbackMessageTimer();
  automaticSaveBlocked = true;
  automaticSavePending = null;
  automaticSaveFailure = {
    reason: String(result?.reason || 'failed'),
    message: String(result?.message || ''),
    token: request?.token ?? automaticSaveToken,
    ownership: request?.ownership ?? documentOwnershipSeq,
    session: request?.session ?? persistenceSessionSeq,
    dataset: request?.dataset ?? datasetToken,
    handle: request?.handle ?? activeDocument.handle,
    identity: request?.identity ?? activeDocument.documentIdentity,
    revision: request?.revision ?? dataRevision
  };
  syncAutomaticSaveFeedback();
}

function suppressAutomaticSaveAfterManualFailure() {
  clearSaveFeedbackMessageTimer();
  automaticSaveToken += 1;
  automaticSaveFailure = null;
  automaticSavePending = null;
  automaticSaveBlocked = true;
  syncAutomaticSaveFeedback();
}

function clearAutomaticSaveFailure() {
  saveFeedbackMessageDismissed = false;
  clearSaveFeedbackMessageTimer();
  automaticSaveFailure = null;
  automaticSaveBlocked = false;
  syncAutomaticSaveFeedback();
}

function invalidateAutomaticSave() {
  automaticSaveToken += 1;
  automaticSavePending = null;
  automaticSaveFailure = null;
  automaticSaveBlocked = false;
  syncAutomaticSaveFeedback();
}

function automaticSavePendingStatus(request) {
  if (!request || !automaticSaveContextCurrent(request)) return 'obsolete';
  if (automaticSaveBlocked || destroying) return 'blocked';
  if (documentSaveInFlight || documentSaveQueueActive) return 'temporary';
  if (persistenceBusy || replacementGuard || pendingBackupImport || installingBackupImport || editorController?.isOpen()) return 'temporary';
  if (!activeDocument.active || activeDocument.mode !== 'writable' || !activeDocument.handle) return 'no-destination';
  if (!(dataRevision > (activeDocument.savedRevision ?? -1)) || !mapDirty()) return 'resolved';
  return 'ready';
}

function rebaseAutomaticSaveRequest(request) {
  const revision = dataRevision;
  if (request.revision === revision && request.options.capturedRevision === revision) return request;
  return {
    ...request,
    revision,
    options: { ...request.options, capturedRevision: revision }
  };
}

function maybeRunAutomaticSave() {
  if (!automaticSavePending || destroying || documentSaveQueueActive || documentSaveInFlight) return;
  const pending = automaticSavePending;
  const status = automaticSavePendingStatus(pending);
  if (status === 'obsolete' || status === 'resolved') { automaticSavePending = null; return; }
  if (status === 'blocked' || status === 'temporary') return;
  if (status === 'no-destination') {
    automaticSavePending = null;
    setAutomaticSaveFailure(pending, { reason: 'no-destination' });
    return;
  }
  const request = rebaseAutomaticSaveRequest(pending);
  automaticSavePending = null;
  documentSaveQueueActive = true;
  saveDocument(request.options).then((result) => {
    if (result?.ok) {
      clearAutomaticSaveFailure();
      if (!destroying && automaticSaveContextCurrent(request) && mapDirty()) requestAutomaticSave();
    } else if (!result?.stale && result?.reason !== 'busy' && result?.reason !== 'editor-open') {
      setAutomaticSaveFailure(request, result);
    }
  }).catch((error) => {
    setAutomaticSaveFailure(request, { reason: 'save-failed', message: String(error?.message || error) });
  }).finally(() => {
    documentSaveQueueActive = false;
    if (!destroying) { pumpDocumentSaveQueue(); queueMicrotask(maybeRunAutomaticSave); }
  });
}

function pumpDocumentSaveQueue() {
  if (documentSaveQueueActive || documentSaveInFlight || destroying) return;
  const request = documentSaveQueue.shift();
  if (!request) { maybeRunAutomaticSave(); return; }
  if (!request.options.saveAs) automaticSavePending = null;
  else automaticSavePending = null;
  documentSaveQueueActive = true;
  saveDocument(request.options).then((result) => {
    if (result?.ok) clearAutomaticSaveFailure();
    else if (!result?.stale && !['cancelled', 'stale', 'no-map'].includes(result?.reason)) {
      setAutomaticSaveFailure({ ...result, token: automaticSaveToken, ownership: documentOwnershipSeq, session: persistenceSessionSeq, dataset: datasetToken, handle: activeDocument.handle, identity: activeDocument.documentIdentity, revision: dataRevision }, result);
    } else if (result?.reason === 'cancelled') {
      automaticSaveBlocked = true; automaticSavePending = null;
      syncAutomaticSaveFeedback();
    }
    request.resolve(result);
  }).catch((error) => request.resolve({ ok: false, reason: 'queue-error', message: String(error?.message || error) })).finally(() => {
    documentSaveQueueActive = false;
    if (!destroying) { pumpDocumentSaveQueue(); queueMicrotask(maybeRunAutomaticSave); }
  });
}

function cancelQueuedDocumentSaves() {
  while (documentSaveQueue.length) {
    const request = documentSaveQueue.shift();
    request.resolve({ ok: false, reason: 'stale', stale: true });
  }
}

function enqueueDocumentSave(options = {}) {
  return new Promise((resolve) => {
    if (destroying) { resolve({ ok: false, reason: 'stale', stale: true }); return; }
    documentSaveQueue.push({ options, resolve });
    pumpDocumentSaveQueue();
  });
}

function requestAutomaticSave() {
  if (globalThis.__M5_DISABLE_AUTOMATIC_SAVE__ === true) return false;
  if (destroying || automaticSaveBlocked) return false;
  if (!hasMap || !activeDocument.active || activeDocument.mode !== 'writable' || !activeDocument.handle) {
    setAutomaticSaveFailure({ token: automaticSaveToken, ownership: documentOwnershipSeq, session: persistenceSessionSeq, dataset: datasetToken, handle: activeDocument.handle, identity: activeDocument.documentIdentity, revision: dataRevision }, { reason: 'no-destination' });
    return false;
  }
  const revision = dataRevision;
  const request = {
    token: automaticSaveToken,
    ownership: documentOwnershipSeq,
    session: persistenceSessionSeq,
    dataset: datasetToken,
    handle: activeDocument.handle,
    identity: activeDocument.documentIdentity,
    revision,
    options: {
      context: 'automatic', automatic: true, capturedRevision: revision,
      expectedOwnership: documentOwnershipSeq, expectedSession: persistenceSessionSeq, expectedDataset: datasetToken,
      expectedHandle: activeDocument.handle, expectedIdentity: activeDocument.documentIdentity,
      allowPicker: false, allowDownload: false, interactiveConflict: false
    }
  };
  automaticSavePending = request;
  maybeRunAutomaticSave();
  return true;
}

async function runAutomaticSaveFeedbackAction(kind) {
  const failure = automaticSaveFailure;
  if (!failure || automaticSaveActionInFlight || !automaticSaveContextCurrent(failure)) { syncAutomaticSaveFeedback(); return; }
  automaticSaveActionInFlight = true;
  saveFeedbackMessageDismissed = false;
  clearSaveFeedbackMessageTimer();
  syncAutomaticSaveFeedback();
  try {
    const result = await saveCurrentDocument(kind === 'save-as'
      ? { context: 'automatic-save-as', saveAs: true, recovery: true }
      : { context: 'automatic-retry', capturedRevision: dataRevision, recovery: true });
    if (result?.ok) clearAutomaticSaveFailure();
    else if (result?.reason === 'cancelled') {
      automaticSaveBlocked = true;
      automaticSavePending = null;
    } else if (!result?.stale && result?.reason !== 'editor-open' && result?.reason !== 'busy') {
      setAutomaticSaveFailure(failure, result, { force: true });
    }
  } finally {
    automaticSaveActionInFlight = false;
    syncAutomaticSaveFeedback();
  }
}
if (saveFeedbackRetry) saveFeedbackRetry.addEventListener('click', () => { runAutomaticSaveFeedbackAction('retry'); });
if (saveFeedbackSaveAs) saveFeedbackSaveAs.addEventListener('click', () => { runAutomaticSaveFeedbackAction('save-as'); });

async function saveCurrentDocument(options = {}) {
  if (globalThis.__M5_LEGACY_PERSISTENCE_HARNESS__ === true) {
    if (options.context === 'editor') return saveActiveMap({ internal: true, ignoreEditor: true });
    if (options.context === 'replacement') return saveActiveMap({ internal: true });
    return saveActiveMap();
  }
  const expectedHandle = options.saveAs ? null : (Object.prototype.hasOwnProperty.call(options, 'expectedHandle') ? options.expectedHandle : activeDocument.handle);
  const expectedIdentity = options.saveAs ? null : (Object.prototype.hasOwnProperty.call(options, 'expectedIdentity') ? options.expectedIdentity : activeDocument.documentIdentity);
  return enqueueDocumentSave({ ...options, capturedRevision: options.capturedRevision ?? dataRevision, expectedOwnership: options.expectedOwnership ?? documentOwnershipSeq, expectedSession: options.expectedSession ?? persistenceSessionSeq, expectedDataset: options.expectedDataset ?? datasetToken, expectedHandle, expectedIdentity });
}
async function saveDocument({ saveAs = false, capturedRevision = null, allowEditorOpen = false, allowReplacement = false, replacementToken = null, target = null, preencoded = null, expectedOwnership = null, expectedSession = null, expectedDataset = null, expectedHandle = null, expectedIdentity = null, allowPicker = true, allowDownload = true, interactiveConflict = true, automatic = false, recovery = false } = {}) {
  if (destroying) return { ok: false, reason: 'stale', stale: true, stage: 'destroyed' };
  if ((expectedOwnership !== null && expectedOwnership !== documentOwnershipSeq) || (expectedSession !== null && expectedSession !== persistenceSessionSeq) || (expectedDataset !== null && expectedDataset !== datasetToken) || (expectedHandle !== null && activeDocument.handle !== expectedHandle) || (expectedIdentity !== null && activeDocument.documentIdentity !== expectedIdentity)) return { ok: false, reason: 'stale', stale: true, stage: 'ownership' };
  if (!hasMap || !tree || !attachmentRegistry) { setShellStatus('There is no map to save.'); return { ok: false, reason: 'no-map' }; }
  if (documentSaveInFlight) { setShellStatus('A document save is already running.'); return { ok: false, reason: 'busy' }; }
  if (editorController?.isOpen() && !allowEditorOpen) { setShellStatus('Finish or close the editor form before saving the document.'); return { ok: false, reason: 'editor-open' }; }
  if (persistenceBusy || (replacementGuard && !(allowReplacement && replacementGuard.token === replacementToken))) { setShellStatus('Finish the current operation before saving the document.'); return { ok: false, reason: 'busy' }; }
  if (!automatic && !recovery) { if (automaticSaveFailure) clearAutomaticSaveFailure(); else automaticSaveBlocked = false; }
  const operation = ++documentOperation;
  documentSaveOwner = operation; documentSaveInFlight = true; documentSaving = true;
  const ownerSession = persistenceSessionSeq; const ownerDataset = datasetToken;
  const revision = capturedRevision ?? dataRevision;
  let recoveryReservation = null;
  let recoveryRetirementAttempted = false;
  let stage = 'destination';
  let orbitProtection = null;
  let expectedHandleValue = expectedHandle;
  const owns = () => !destroying && documentSaveOwner === operation && operation === documentOperation
    && ownerSession === persistenceSessionSeq && ownerDataset === datasetToken
    && (replacementToken === null || replacementGuard?.token === replacementToken)
    && (expectedHandleValue === null || activeDocument.handle === expectedHandleValue)
    && (expectedIdentity === null || activeDocument.documentIdentity === expectedIdentity);
  const fail = (reason, currentStage, error, message) => {
    const detail = { stage: currentStage, reason, errorName: String(error?.name || ''), errorMessage: String(error?.message || error || ''), code: String(error?.code || '') };
    lastDocumentFailure = detail;
    // Keep exception details for diagnostics, never in user-facing feedback.
    if (owns() && !editorController?.isOpen() && !automatic && !recovery) setShellStatus(message);
    return { ok: false, reason, stage: currentStage, error, errorName: detail.errorName, errorMessage: detail.errorMessage };
  };
  syncPersistenceControls();
  try {
    let handle = target ? (target.handle || null) : (!saveAs && activeDocument.active && activeDocument.mode === 'writable' ? activeDocument.handle : null);
    let name = target?.name || (activeDocument.active ? activeDocument.name : safeDocumentFilename(tree.name));
    let mode = handle ? 'writable' : 'download';
    if (!handle) {
      if (!allowPicker) return fail('no-destination', 'destination', null, 'This map has no writable destination. Choose Save As to persist it.');
      if (automatic) return fail('no-destination', 'destination', null, 'This map has no writable destination. Choose Save As to persist it.');
    }
    if (!handle && !target?.forceDownload && documentAdapter.writableSupported) {
      stage = 'picker';
      const picked = await documentAdapter.pickSave(safeDocumentFilename(name));
      if (!picked.ok) {
        if (!owns()) return { ok: false, reason: 'stale' };
        if (picked.reason === 'cancelled') {
          lastDocumentFailure = { stage: picked.stage || stage, reason: 'cancelled', errorName: String(picked.error?.name || ''), errorMessage: String(picked.error?.message || ''), code: '' };
          if (!editorController?.isOpen() && !automatic && !recovery) showTransientStatus(UNSAVED_MESSAGE);
          return { ok: false, reason: 'cancelled', stage: picked.stage || stage, error: picked.error };
        }
        if (picked.reason === 'permission-denied') return fail('permission-denied', picked.stage || stage, picked.error, 'Save As failed at ' + (picked.stage || stage) + ' stage because write permission was not granted.');
        return fail(picked.reason || 'save-picker-failed', picked.stage || stage, picked.error, 'Save As failed at ' + (picked.stage || stage) + ' stage.');
      }
      handle = picked.handle; name = handle.name || safeDocumentFilename(name); mode = 'writable';
    }
    if (handle && mode === 'writable' && (!globalThis.__M5_P1B_TEST_HOOKS__ || globalThis.__M5_WRITE_PERMISSION_DIALOG_TEST__)) {
      const queried = savePermissionQueryOverride ? { ok: true, permission: savePermissionQueryOverride } : await orbitAdapter.queryWritePermission(handle);
      if (!owns()) { permissionDialog?.close(false); return { ok: false, reason: 'stale' }; }
      if (!queried?.ok || (queried.permission !== 'granted' && queried.permission !== 'unknown')) {
        if (automatic || recovery) return fail('write-permission-required', 'permission', null, 'Save needs permission to write to this destination. Use Save to grant access.');
        if (!permissionDialog) return fail('permission-unavailable', 'permission', null, 'Permission guidance is unavailable. The map remains unsaved.');
        const accepted = await permissionDialog.showSavePermission({ directoryName: name, fileName: name, fileSpecific: handle.kind === 'file' });
        if (!owns()) { permissionDialog.close(false); return { ok: false, reason: 'stale' }; }
        if (!accepted) return fail('permission-cancelled', 'permission', null, 'Save cancelled. The map is still unsaved.');
        savePermissionRequestCount += 1;
        const requested = savePermissionRequestOverride ? { ok: savePermissionRequestOverride !== 'denied', permission: savePermissionRequestOverride } : await orbitAdapter.requestWritePermission(handle);
        if (!owns()) { permissionDialog.close(false); return { ok: false, reason: 'stale' }; }
        if (!requested?.ok || requested.permission === 'denied') return fail('permission-denied', 'permission', requested?.error || null, 'Write permission was not granted. The map remains unsaved.');
      }
    }
    let sameOrbitDestination = false;
    if (saveAs && handle && !target && activeDocument.active && activeDocument.origin === 'orbit' && activeDocument.baseline) {
      try { sameOrbitDestination = handle === activeDocument.handle || (typeof handle.isSameEntry === 'function' ? await handle.isSameEntry(activeDocument.handle) : false); } catch { sameOrbitDestination = false; }
      if (!owns()) return { ok: false, reason: 'stale' };
      if (sameOrbitDestination) { handle = activeDocument.handle; name = handle?.name || name; mode = 'writable'; }
    }
    const protectOrbit = (sameOrbitDestination || (!saveAs && !target)) && activeDocument.active && activeDocument.origin === 'orbit';
    if (protectOrbit) {
      stage = 'overwrite';
      const guarded = await protectOrbitOverwrite({ handle, name, owns, approval: null, interactive: interactiveConflict });
      if (!owns()) return { ok: false, reason: 'stale' };
      if (!guarded.ok) {
        if (guarded.cancelled || guarded.reason === 'cancelled' || guarded.reason === 'conflict-cancelled') {
          lastDocumentFailure = { stage: 'conflict', reason: 'conflict-cancelled', errorName: '', errorMessage: '', code: '' };
          if (!editorController?.isOpen() && !automatic && !recovery) showTransientStatus(UNSAVED_MESSAGE);
          return { ok: false, reason: 'conflict-cancelled', stage: 'conflict', cancelled: true, message: UNSAVED_MESSAGE };
        }
        return fail(guarded.reason || 'overwrite-preflight-failed', 'overwrite', null, guarded.message || 'The destination could not be protected for overwrite.');
      }
      if (guarded.handle !== handle) { handle = guarded.handle; name = handle?.name || name; mode = 'writable'; }
      orbitProtection = guarded;
    }

    if (recoveryScheduler) {
      try { recoveryReservation = await recoveryScheduler.beginDocumentSave({ session: ownerSession, dataset: ownerDataset, operation, revision }); }
      catch (error) { recoveryDiagnostic = { code: 'recovery-save-reservation-failed', message: String(error?.message || error) }; }
    }
    if (!owns()) return { ok: false, reason: 'stale', stale: true, stage: 'recovery-reservation' };
    stage = 'encoding';
    if (globalThis.__M5_SAVE_ENCODE_GATE__) { const gate = globalThis.__M5_SAVE_ENCODE_GATE__; await gate.promise; }
    let encoded;
    if (preencoded?.blob) encoded = { blob: preencoded.blob };
    else {
      const encodingTree = tree;
      try {
        if (globalThis.__M5_SAVE_ENCODE_FAILURE__) { const injected = new Error('injected document encoding failure'); injected.code = 'injected-save-encoding-failure'; throw injected; }
        const source = runtimeAccess.serializationState();
        encoded = await encodeBackup({ tree: source.tree, registry: source.registry, mapName: name, sourceMapId: activeMap?.mapId || null, cryptoApi: globalThis.crypto, policyContext: largeMapPolicyContext });
      } catch (error) {
        if (!owns()) return { ok: false, reason: 'stale' };
        const preserved = Boolean(hasMap && tree === encodingTree && !destroying);
        const result = fail(error?.code || 'encoding-failed', 'encoding', error, preserved ? ENCODING_FAILURE_MESSAGE : ENCODING_FAILURE_BASE);
        if (!automatic && !recovery) suppressAutomaticSaveAfterManualFailure();
        return result;
      }
    }
    if (!owns()) return { ok: false, reason: 'stale', stale: true, stage: 'encoding' };
    if (!handle) {
      stage = 'download';
      if (!owns()) return { ok: false, reason: 'stale', stale: true, stage: 'download' };
      const handed = documentAdapter.download(encoded.blob, safeDocumentFilename(name));
      if (!handed.ok) { if (!owns()) return { ok: false, reason: 'stale' }; return fail(handed.reason || 'download-failed', handed.stage || stage, handed.error, 'Could not start the document download.'); }
      if (!owns()) return { ok: false, reason: 'stale' };
      lastDocumentFailure = null;
      setRoutineStatus(target?.forceDownload ? 'Map download started. FileOrbit cannot confirm that the file was saved. The new map remains unsaved.' : 'Download started. FileOrbit cannot confirm that the file was saved. The existing document was not changed.');
      return { ok: true, handoff: true, filename: safeDocumentFilename(name), stage };
    }
    if (protectOrbit && orbitProtection && !orbitProtection.copied) {
      stage = 'overwrite-recheck';
      const rechecked = await protectOrbitOverwrite({ handle, name, owns, approval: orbitProtection.approval, interactive: interactiveConflict });
      if (!owns()) return { ok: false, reason: 'stale' };
      if (!rechecked.ok) {
        if (rechecked.cancelled || rechecked.reason === 'cancelled') { setRoutineStatus('Save cancelled. The destination and current edits were preserved.'); return { ok: false, reason: 'cancelled', stage: 'overwrite-recheck' }; }
        return fail(rechecked.reason || 'overwrite-recheck-failed', 'overwrite-recheck', null, rechecked.message || 'The destination changed before the write could begin.');
      }
      if (rechecked.handle !== handle) { handle = rechecked.handle; name = handle?.name || name; mode = 'writable'; }
      orbitProtection = rechecked;
    }

    if (!owns()) return { ok: false, reason: 'stale', stale: true, stage: 'write' };
    stage = 'write';
    const written = await documentAdapter.write(handle, encoded.blob);
    if (!owns()) return { ok: false, reason: 'stale' };
    if (!written.ok) return fail(written.reason || 'write-failed', written.stage || stage, written.error, 'Document save failed at ' + (written.stage || stage) + ' stage. The current document remains unsaved.');
    if (recoveryReservation) { recoveryRetirementAttempted = true; await recoveryScheduler.retireDocumentSave(recoveryReservation); }
    if (!owns()) return { ok: false, reason: 'stale', stage: 'recovery-retirement' };
    const orbitOrigin = activeDocument.origin === 'orbit' || target?.origin === 'orbit';
    const identity = activeDocument.documentIdentity || target?.documentIdentity || null;
    const priorBaseline = activeDocument.baseline;
    adoptActiveDocument({ active: true, name, handle, mode: 'writable', savedRevision: revision, origin: target?.origin || activeDocument.origin || 'file', documentIdentity: identity, baseline: orbitOrigin ? priorBaseline : null });
    expectedHandleValue = handle;
    restoredMapAwaitingSave = false;
    lastDocumentFailure = null;
    let baselineVerification = null;
    let baselineWritten = true;
    if (orbitOrigin && identity) {
      try {
        const confirmed = await createConfirmedWriteBaseline({
          handle,
          writtenBytes: encoded.blob,
          binding: { handle, documentIdentity: identity, revision, session: persistenceSessionSeq, operation },
          isCurrent: owns,
          cryptoApi: globalThis.crypto
        });
        if (!owns()) return { ok: false, reason: 'stale', stage: 'baseline' };
        baselineVerification = confirmed;
        activeDocument.baseline = confirmed.baseline || (priorBaseline ? Object.freeze({ ...priorBaseline, state: 'unknown' }) : null);
        baselineWritten = Boolean(confirmed.ok);
        if (confirmed.ok) setRoutineStatus('Saved');
        else if (confirmed.reason === 'changed') setShellStatus('Saved; the file changed before verification. The next overwrite requires a conflict decision.');
        else setShellStatus('Saved; the file baseline could not be verified. The next overwrite requires revalidation.');
      } catch (error) {
        baselineWritten = false;
        activeDocument.baseline = priorBaseline ? Object.freeze({ ...priorBaseline, state: 'unknown' }) : null;
        setShellStatus('Saved; the file baseline could not be verified. The next overwrite requires revalidation.');
      }
    }
    if (!orbitOrigin || !identity) setRoutineStatus('Saved');
    syncPersistenceControls(); publish();
    syncOrbitCurrentEntry();
    return { ok: true, filename: name, revision, stage: 'saved', baseline: activeDocument.baseline, baselineVerification, baselineWritten };
  } catch (error) {
    if (!owns()) return { ok: false, reason: 'stale' };
    return fail('save-failed', stage, error, 'Document save failed at ' + stage + ' stage.');
  } finally {
    if (recoveryReservation && !recoveryRetirementAttempted) { await recoveryScheduler.abandonDocumentSave(recoveryReservation); if (mapDirty()) scheduleRecoveryCheckpoint(); }
    if (documentSaveOwner === operation) {
      documentSaveOwner = null; documentSaveInFlight = false; documentSaving = false;
      if (!destroying) { syncPersistenceControls(); publish(); }
    }
  }
}
function chooseBackupFile({ asDocument = false } = {}) {
  claimDocumentOwnership();
  cancelStartupRecovery();
  if (editorAppliedOperation || editorController?.isSaving()) { setShellStatus('Finish the applied editor Save or Retry before importing a backup.'); return; }
  if (backupBusy()) { setShellStatus('A backup operation is already running.'); return; }
  if (!backupFileInput) {
    backupFileInput = document.createElement('input'); backupFileInput.id = 'fileorbit-backup-input'; backupFileInput.type = 'file'; backupFileInput.accept = '.orbit,application/x-orbit'; backupFileInput.hidden = true; document.body.append(backupFileInput);
    backupFileInput.addEventListener('change', () => { if (destroying || !backupFileInput) return; const input = backupFileInput; const file = input.files?.[0]; const asDoc = input.dataset.asDocument === 'true'; input.value = ''; if (file) importBackupFile(file, asDoc ? { name: file.name, mode: 'download', handle: null } : null); });
  }
  backupFileInput.dataset.asDocument = asDocument ? 'true' : 'false';
  backupFileInput.click();
}
async function importBackupFile(file, documentMeta = null) {
  const incomingName = String(documentMeta?.name || file?.name || '');
  if (incomingName && !/\.orbit$/i.test(incomingName)) { setShellStatus('Only .orbit files are supported. Choose a .orbit file.'); return { ok: false, reason: 'unsupported-extension' }; }
  cancelStartupRecovery();
  if (persistenceBusy || replacementGuard) { setShellStatus('Finish the current save, open, or replacement operation before importing a backup.'); return { ok: false, reason: 'busy' }; }
  if (pendingBackupImport || installingBackupImport) { setShellStatus('A backup import is already in progress.'); return { ok: false, reason: 'pending' }; }
  if (editorAppliedOperation || editorController?.isSaving()) { setShellStatus('Finish the applied editor Save or Retry before importing a backup.'); return { ok: false, reason: 'editor-owned' }; }
  const suppliedOwnership = documentMeta?.ownership ?? null;
  if (suppliedOwnership !== null && suppliedOwnership !== documentOwnershipSeq) return { ok: false, reason: 'stale' };
  const ownership = suppliedOwnership ?? claimDocumentOwnership();
  const requestMeta = documentMeta ? { ...documentMeta, ownership } : documentMeta;
  const operation = ++backupOperation; const owner = { operation, session: persistenceSessionSeq, dataset: datasetToken }; const nextDataset = datasetToken + 1;
  backupOwnerSession = owner.session; backupOwnerDataset = owner.dataset; persistenceBusy = 'backup-import'; if (backupCancelButton) backupCancelButton.hidden = false; syncPersistenceControls(); const feedbackScope = beginShellFeedback('Validating backup…');
  const isCancelled = () => !backupOwnerActive(owner);
  let registry = null; let committed = false;
  try {
    const hashGate = backupImportHashGates.find((gate) => !gate.used);
    const cryptoApi = hashGate ? { subtle: { digest: async (...args) => { hashGate.used = true; hashGate.started = true; await hashGate.promise; return globalThis.crypto.subtle.digest(...args); } } } : globalThis.crypto;
    const decoded = await decodeBackup(file, { cryptoApi, isCancelled, policyContext: largeMapPolicyContext });
    if (isCancelled()) return { ok: false, reason: 'cancelled' };
    registry = createAttachmentRegistry({ datasetToken: nextDataset });
    for (const attachment of decoded.attachments) {
      if (isCancelled()) { registry.clear(); return { ok: false, reason: 'cancelled' }; }
      const adopted = registry.adopt({ attachmentId: attachment.attachmentId, file: attachment.blob, metadata: { attachmentId: attachment.attachmentId, ...attachment.metadata } });
      if (!adopted.ok) throw new Error(adopted.message || 'Attachment adoption failed.');
    }
    const request = { id: ++backupImportSeq, session: owner.session, dataset: owner.dataset, revision: dataRevision, editorToken: editorPanel?.getFormToken?.() ?? null, tree: decoded.tree, registry, manifest: decoded.manifest, datasetToken: nextDataset, phase: 'awaiting-decision', cancelled: false, documentMeta: requestMeta, ownership, feedbackScope };
    resolveShellFeedback(renewShellFeedbackScope(feedbackScope), 'Backup validated. Choose how to apply it.');
    pendingBackupImport = request;
    finishBackupOwner(owner, 'backup-import');
    if (editorController?.isOpen() && editorController.dirty) {
      pendingBackupImport = request;
      const prompt = editorPanel?.requestSelection?.({ kind: 'backup-import', requestId: request.id, datasetToken: owner.dataset, baseRevision: request.revision });
      if (prompt?.blocked) { setShellStatus('Finish or discard the editor draft before importing the backup.'); return { ok: true, pending: 'editor' }; }
    }
    if (editorController?.isOpen()) { editorController.cancel(); editorPanel?.clear?.(); }
    return await requestBackupReplacementDecision(request);
  } catch (error) {
    registry?.clear();
    if (error?.code === 'backup-cancelled') return { ok: false, reason: 'cancelled' };
    if (backupOwnerActive(owner)) { if (hypertreeComparisonMode && error?.diagnostics) { const d=error.diagnostics, u=d.unsatisfied?.[0]; setShellStatus('Hypertree comparison failed: ' + String(error.code || error.name || 'layout-failure') + (u ? '; parent ' + u.parentId + ' required ' + Number(u.required).toFixed(3) + ' but available ' + Number(u.available).toFixed(3) + ' at workspaceScale ' + d.workspaceScale + '.' : '') + ' The current document was preserved.'); } else setShellStatus('Backup import failed: ' + String(error?.message || error)); }
    return { ok: false, error };
  } finally { finishBackupOwner(owner, 'backup-import', committed); }
}
function backupImportRequestCurrent(request) {
  if (!request || request.cancelled) return false;
  if (request.documentMeta?.origin === 'orbit' && request.documentMeta.orbitToken !== orbitDocumentOpenSeq) return false;
  if (request.session !== persistenceSessionSeq || request.revision !== dataRevision) return false;
  if (request.phase === 'installing') return installingBackupImport === request && datasetToken === request.dataset;
  return pendingBackupImport === request && datasetToken === request.dataset;
}
function backupImportOwnershipStale(request) {
  const ownership = request?.ownership ?? request?.documentMeta?.ownership;
  return ownership != null && ownership !== documentOwnershipSeq;
}
function clearOwnedBackupImport(request) {
  if (!request) return false;
  request.cancelled = true;
  if (pendingBackupImport === request) pendingBackupImport = null;
  if (installingBackupImport === request) installingBackupImport = null;
  if (pendingReplacement?.backupRequest === request) {
    pendingReplacement = null;
    unsavedMapPrompt?.close?.({ restoreFocus: false });
  }
  request.registry?.clear?.();
  return true;
}

function clearPendingBackupImport({ clearRegistry = true } = {}) {
  const pending = pendingBackupImport;
  if (pending) pending.cancelled = true;
  if (installingBackupImport) installingBackupImport.cancelled = true;
  pendingBackupImport = null; installingBackupImport = null;
  if (clearRegistry) pending?.registry?.clear?.();
  return pending;
}
async function requestBackupReplacementDecision(request) {
  if (!backupImportRequestCurrent(request)) { request && (request.cancelled = true); if (backupImportOwnershipStale(request)) { clearOwnedBackupImport(request); return { ok: false, reason: 'stale' }; } clearPendingBackupImport(); return { ok: false, reason: 'stale' }; }
  if (hasMap && mapDirty()) {
    pendingBackupImport = request; request.phase = 'awaiting-map';
    pendingReplacement = { intent: 'backup', backupRequest: request };
    unsavedMapPrompt?.show({ text: 'This map has changes that are not saved in this browser. Save before importing the backup?' });
    return { ok: true, pending: 'map' };
  }
  return resumeBackupImport(request);
}
async function resumeBackupImport(request) {
  if (request?.phase === 'committed' || request?.phase === 'installing') return { ok: false, reason: 'duplicate' };
  if (!backupImportRequestCurrent(request)) {
    request && (request.cancelled = true);
    if (backupImportOwnershipStale(request)) { clearOwnedBackupImport(request); return { ok: false, reason: 'stale' }; }
    clearPendingBackupImport();
    setShellStatus('The backup import request is stale. Select the backup again.');
    return { ok: false, reason: 'stale' };
  }
  pendingBackupImport = null; installingBackupImport = request; request.phase = 'installing';
  const preview = { tree: request.tree, registry: request.registry, datasetToken: request.datasetToken };
  const installed = await installCreatedMap(preview, { request });
  if (!installed?.ok) { request.phase = 'failed'; if (installingBackupImport === request) installingBackupImport = null; request.registry.clear(); return { ok: false, error: installed?.error || new Error(installed?.message || 'Import installation failed.') }; }
  request.phase = 'committed'; if (installingBackupImport === request) installingBackupImport = null;
  if (backupImportOwnershipStale(request)) return { ok: false, reason: 'stale' };
  let baselineVerification = null;
  const orbitMeta = request.documentMeta?.origin === 'orbit' ? request.documentMeta : null;
  if (orbitMeta?.openedBaseline) {
    const expectedHandle = activeDocument.handle;
    const committedSession = persistenceSessionSeq;
    const committedDataset = datasetToken;
    const bound = bindBaseline(orbitMeta.openedBaseline, { handle: expectedHandle, documentIdentity: orbitMeta.documentIdentity, revision: 0, session: committedSession, operation: 'open:' + request.id });
    if (bound.ok && activeDocument.active && activeDocument.handle === expectedHandle) activeDocument.baseline = bound.baseline;
    else setShellStatus('Opened ' + (activeDocument.name || orbitMeta.name || 'document') + '; its overwrite baseline is unavailable.');
    if (activeDocument.active && activeDocument.handle === expectedHandle && activeDocument.baseline) {
      const verified = await verifyOpenedContentBaseline(activeDocument.baseline, {
        cryptoApi: globalThis.crypto,
        isCurrent: () => !destroying && request.phase === 'committed' && activeDocument.active
          && activeDocument.handle === expectedHandle && persistenceSessionSeq === committedSession && datasetToken === committedDataset
      });
      if (activeDocument.active && activeDocument.handle === expectedHandle && persistenceSessionSeq === committedSession && datasetToken === committedDataset) {
        if (verified.baseline) activeDocument.baseline = verified.baseline;
        baselineVerification = verified;
        if (verified.ok) resolveShellFeedback(renewShellFeedbackScope(request.feedbackScope), 'Opened ' + (activeDocument.name || orbitMeta.name || 'document') + '.');
        else if (verified.reason === 'stale') resolveShellFeedback(renewShellFeedbackScope(request.feedbackScope), 'Opened ' + (activeDocument.name || orbitMeta.name || 'document') + '.');
        else if (verified.reason === 'changed') setShellStatus('Opened ' + (activeDocument.name || orbitMeta.name || 'document') + '; the file changed outside FileOrbit. Saving requires a conflict decision.');
        else setShellStatus('Opened ' + (activeDocument.name || orbitMeta.name || 'document') + '; the file baseline could not be verified. Saving requires revalidation.');
      }
    }
  }
  if (request.documentMeta) {
    if (!orbitMeta) resolveShellFeedback(renewShellFeedbackScope(request.feedbackScope), 'Opened ' + (activeDocument.name || request.documentMeta.name || 'document'));
    syncPersistenceControls(); publish();
  } else {
    setRoutineStatus('Backup restored. Save to IndexedDB to keep this restored map on this device.');
  }
  syncOrbitCurrentEntry();
  return { ok: true, manifest: request.manifest, baselineVerification };
}

async function installCreatedMap(preview, { request = null, silent = false } = {}) {
  const admitted = admitDocument(preview.tree);
  if (!admitted.ok) { setShellStatus(admitted.message); return { ok: false, reason: 'edition-node-limit', message: admitted.message, nodeCount: admitted.nodeCount }; }
  const importing = Boolean(request);
  const operation = importing ? 'import-' + request.id : createMapOperation;
  const orbitSnapshot = !importing && createDraftDestinationMode === 'orbit' ? orbitState.snapshot() : null;
  const orbitCreation = orbitSnapshot?.handle && orbitSnapshot.phase !== 'blocked' ? Object.freeze({
    handle: orbitSnapshot.handle,
    sessionId: orbitSnapshot.sessionId,
    name: orbitSnapshot.name,
    ownership: documentOwnershipSeq,
    operation,
    session: persistenceSessionSeq,
    dataset: datasetToken,
    identity: 'orbit-create:' + (++orbitDocumentSeq)
  }) : null;
  const orbitCreationCurrent = () => Boolean(orbitCreation) && !destroying
    && documentOwnershipSeq === orbitCreation.ownership
    && createMapOperation === orbitCreation.operation
    && persistenceSessionSeq === orbitCreation.session
    && datasetToken === orbitCreation.dataset
    && orbitState.snapshot().handle === orbitCreation.handle
    && orbitState.snapshot().sessionId === orbitCreation.sessionId;
  const orbitWriteCurrent = () => Boolean(orbitCreation) && !destroying
    && documentOwnershipSeq === orbitCreation.ownership
    && (createMapOperation === orbitCreation.operation || createMapOperation === dialogCloseOperation)
    && orbitState.snapshot().handle === orbitCreation.handle
    && orbitState.snapshot().sessionId === orbitCreation.sessionId;
  const creationOwner = importing ? null : Object.freeze({
    operation,
    session: persistenceSessionSeq,
    dataset: datasetToken,
    dialog: createMapDialog,
    terminalHandled: creationTerminalHandled,
    startedDestroying: destroying
  });
  const staleCreation = () => ({ ok: false, reason: 'stale', stale: true, message: '' });
  const creationOwnerCurrent = () => !importing && !creationOwner.startedDestroying && !destroying
    && !creationTerminalHandled
    && createMapOperation === creationOwner.operation
    && persistenceSessionSeq === creationOwner.session
    && datasetToken === creationOwner.dataset
    && createMapDialog === creationOwner.dialog
    && Boolean(createMapDialog?.open)
    && ownership.creationOwned;
  const operationMatches = () => importing ? backupImportRequestCurrent(request) : (creationOwnerCurrent() && (!orbitCreation || orbitCreationCurrent()));
  let creationDestination = null;
  if (!importing) {
    if (!creationOwnerCurrent()) return staleCreation();
    if (orbitCreation) {
      const filename = safeDocumentFilename(preview.tree.name || 'FileOrbit map');
      const checked = await preflightOrbitFilename(orbitCreation.handle, filename, () => orbitCreationCurrent() && creationOwnerCurrent());
      if (!orbitCreationCurrent() || !creationOwnerCurrent()) return staleCreation();
      if (!checked.ok) return { ok: false, reason: checked.reason, message: checked.message, keepDraft: true, destination: null };
      let prepared;
      try {
        if (globalThis.__M5_ORBIT_TEST_ENCODE_FAILURE__) throw new Error('injected Orbit encode failure');
        prepared = await encodeBackup({ tree: preview.tree, registry: preview.registry, mapName: filename, sourceMapId: null, cryptoApi: globalThis.crypto, policyContext: largeMapPolicyContext });
      } catch (error) {
        return { ok: false, reason: error?.code || 'encoding-failed', keepDraft: true, destination: null, message: 'The Orbit map snapshot could not be prepared. Files and folders were kept.' };
      }
      if (!orbitCreationCurrent() || !creationOwnerCurrent()) return staleCreation();
      creationDestination = { ok: true, orbit: true, handle: null, name: filename, encoded: prepared.blob, identity: orbitCreation.identity };
    } else {
      try {
        creationDestination = await pickCreationDestination(preview.tree.name);
      } catch (error) {
        if (!creationOwnerCurrent()) return staleCreation();
        return { ok: false, reason: 'save-picker-failed', keepDraft: true, destination: null, message: 'Create Map could not open the save picker. Your title and selection were kept.' };
      }
      if (!creationOwnerCurrent()) return staleCreation();
      if (!creationDestination.ok) return { ...creationDestination, destination: null };
    }
  }
  const hadPriorMap = hasMap && Boolean(tree && model && session);
  const available = viewport();
  if (available.width <= 0 || available.height <= 0) {
    return { ok: false, reason: 'zero-viewport', message: 'The graph area is not visible. Resize the window or leave fullscreen, then try again.' };
  }
  ensureCreateMapRuntime();
  prepareCandidateLabelContext();
  const oldToken = datasetToken; const oldRevision = dataRevision;
  const old = { tree, graph, baseLayout, model, session, navigator, frameState, attachmentRegistry, history, idAllocator, detailsTargetId, datasetToken, dataRevision };
  let candidate;
  try {
    if (importing && p1bImportPreparationFailure) { p1bImportPreparationFailure = false; throw new Error('injected backup import preparation failure'); }
    const loaded = loadTree(preview.tree);
    const largePresentation = countDocumentNodes(preview.tree) > 300 && !hypertreeComparisonMode;
    const stagedLayout = largePresentation ? buildLargeBaseLayout(preview.tree) : refineExperimentalV2Layout(stageExperimentalV2Layout(loaded.graph, { rootId: preview.tree.id, phases: ['current'], nodeOptions: { overridable: true }, ...(hypertreeComparisonMode ? { experimentV2: { referenceProjectionRadiusCss: comparisonProjectionRadius } } : {}) }), loaded.graph, { viewport: viewport(), padding: 24, phase: 'current', projectionBaseRadiusCss: baseRadius(), ...(hypertreeComparisonMode ? { diagnosticMaxNodes: countDocumentNodes(preview.tree) } : {}) }).staged;
    const candidateModel = createExplorationModel({ graph: loaded.graph, baseLayout: stagedLayout, structuralRootId: preview.tree.id, phase: 'current' });
    candidate = { tree: preview.tree, graph: loaded.graph, baseLayout: stagedLayout, model: candidateModel, registry: preview.registry, datasetToken: preview.datasetToken, large: largePresentation };
  } catch (error) {
    let comparisonMessage = null;
    if (hypertreeComparisonMode && error?.diagnostics) { const d=error.diagnostics, u=d.unsatisfied?.[0]; comparisonMessage = 'Hypertree comparison failed: ' + String(error.code || error.name || 'layout-failure') + (u ? '; parent ' + u.parentId + ' required ' + Number(u.required).toFixed(3) + ' but available ' + Number(u.available).toFixed(3) + ' at workspaceScale ' + d.workspaceScale + '.' : '') + ' The current document was preserved.'; }
    const message = comparisonMessage || ((importing ? 'Backup import' : 'Create Map') + ' preparation failed: ' + String(error?.message || error));
    if (!importing) { lastCreateFailureMessage = message; creationTerminal = 'failure'; createMapDialog.close(); }
    setShellStatus(message);
    return { ok: false, error, message };
  }
  let committed = false;
  let committedOwner = null;
  let dialogCloseOperation = null;
  const commit = (candidateValue, candidateSession) => {
    invalidateAutomaticSave();
    invalidateDocumentSave();
    if (datasetToken !== oldToken || dataRevision !== oldRevision || !operationMatches()) throw new Error('The live map changed before replacement.');
    tree = candidateValue.tree; graph = candidateValue.graph; baseLayout = candidateValue.baseLayout; model = candidateValue.model;
    session = candidateSession; datasetToken = candidateValue.datasetToken; dataRevision = 0;
    attachmentRegistry = candidateValue.registry; idAllocator = createEditorIdAllocator({ datasetToken });
    createEditor();
    history = createEditorHistory();
    if (!importing) { creationTerminal = 'commit'; creationSuspension = null; }
    hasMap = true; clearActiveMap(); attachmentIds = new Map(); persistenceSessionSeq += 1; lastPersistenceResult = null; setMapPresentation(true);
    detailsTargetId = tree.id; ownership.clearRecoveryFailure(); if (importing) { if (request.documentMeta) { let orbitBaseline = request.documentMeta.openedBaseline || null; if (orbitBaseline && request.documentMeta.origin === 'orbit') { const committed = bindBaseline(orbitBaseline, { handle: request.documentMeta.handle || null, documentIdentity: request.documentMeta.documentIdentity || null, revision: 0, session: persistenceSessionSeq, operation: 'open:' + request.id }); if (committed.ok) orbitBaseline = committed.baseline; } adoptActiveDocument({ active: true, name: request.documentMeta.name || request.manifest?.mapName || 'FileOrbit map', handle: request.documentMeta.handle || null, mode: request.documentMeta.mode || 'download', savedRevision: 0, origin: request.documentMeta.origin || 'file', documentIdentity: request.documentMeta.documentIdentity || null, baseline: orbitBaseline }); restoredMapAwaitingSave = false; } else { resetActiveDocument(); restoredMapAwaitingSave = true; } } else { resetActiveDocument(); restoredMapAwaitingSave = false; }
    if (!importing) { ownership.releaseCreation(); pendingCreateCandidate = null; }
    resetSearchForDataset();
    navigator = null; if (!candidateValue.large) { createNavigator(); createNavigation(); }
    old.attachmentRegistry?.clear(); old.history?.clear();
    if (importing) backupImportCommitCount += 1;
    lastClickDiagnostic = importing ? { reason: 'backup-import-complete', id: tree.id, requestId: request.id } : { reason: 'create-map-complete', id: tree.id };
    committedOwner = { operation, session: persistenceSessionSeq, dataset: datasetToken, explorationSession: session, tree, model, registry: attachmentRegistry, dialog: createMapDialog, revision: dataRevision };
    committed = true;
  };
  const recover = () => {
    tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model;
    session = old.session; navigator = old.navigator; attachmentRegistry = old.attachmentRegistry;
    history = old.history; idAllocator = old.idAllocator; detailsTargetId = old.detailsTargetId;
    datasetToken = old.datasetToken; dataRevision = old.dataRevision; frameState = null;
    ownership.clearRecoveryFailure();
    const recovered = recoverAuthoritativeSession(old.session);
    if (!recovered) {
      linkFrameReady = false; frameState = null; overlay?.deactivateLinks?.();
      ownership.markRecoveryFailure();
    }
    return recovered;
  };
  const installed = installCandidateEnvironment({
    candidate, operation: importing ? 'backup-import' : 'create-map',
    prepare: () => ({ ok: true, fit: true }),
    initialCamera: resetCamera(EXPERIMENTAL_CAMERA_LIMITS), initialFraming: 'fit',
    frame: installFrame,
    invalidate: () => { frameState = null; },
    setCandidateEnv: (env) => { candidateEnv = env; },
    beforeCommit: () => (datasetToken === oldToken && dataRevision === oldRevision && operationMatches())
      ? { ok: true } : { ok: false, message: 'The live map changed before replacement.' },
    commit, recover, createSession: candidate.large ? createLargeMapSession : undefined
  });
  if (!installed.ok) {
    if (!importing) {
      releasePendingCreateCandidate();
      lastCreateFailureMessage = hadPriorMap
        ? (installed.recovered
          ? `Create Map failed; the previous map was restored. ${installed.message || ''}`
          : `Create Map failed and the previous frame could not be restored. ${installed.message || ''}`)
        : `Create Map failed. ${installed.message || ''}`;
      creationTerminal = 'failure';
      try { createMapDialog.close(); } finally { if (!hadPriorMap && !hasMap) startEmptyState(); }
      setShellStatus(lastCreateFailureMessage);
    } else if (!backupImportOwnershipStale(request)) {
      setShellStatus('Backup import failed' + (installed.recovered ? '; the previous map was restored' : '; the previous frame could not be restored') + ': ' + String(installed.message || 'installation failed')); publish();
    }
    return { ...installed, message: installed.message || (importing ? 'Backup import installation failed.' : 'Create Map installation failed.') };
  }
  const committedMatches = () => Boolean(committedOwner) && !destroying && hasMap
    && tree === committedOwner.tree && model === committedOwner.model && attachmentRegistry === committedOwner.registry
    && persistenceSessionSeq === committedOwner.session && datasetToken === committedOwner.dataset && session === committedOwner.explorationSession
    && createMapDialog === committedOwner.dialog
    && (importing || createMapOperation === committedOwner.operation || (dialogCloseOperation !== null && createMapOperation === dialogCloseOperation && !createMapDialog?.open));
  if (!committedMatches()) return { ok: false, reason: 'stale', stale: true, committed: true };
  await establishRecoveryWorkspace({ origin: importing ? (request?.documentMeta ? 'open' : 'import') : 'create', baseline: !importing || !request?.documentMeta });
  if (!committedMatches()) return { ok: false, reason: 'stale', stale: true, committed: true };
  let saved = null;
  if (!importing) {
    if (!committedMatches() || !createMapDialog?.open) return { ok: false, reason: 'stale', stale: true, committed: true };
    if (orbitCreation && !orbitWriteCurrent()) return { ok: false, reason: 'stale', stale: true, committed: true };
    createMapDialog.close();
    dialogCloseOperation = createMapOperation;
    if (!committedMatches()) return { ok: false, reason: 'stale', stale: true, committed: true };
    if (orbitCreation) {
      const owner = Object.freeze({ kind: 'create', ownership: orbitCreation.ownership, handle: orbitCreation.handle, sessionId: orbitCreation.sessionId });
      orbitWorkspaceBusy = owner;
      renderOrbitPanel();
      try {
        if (globalThis.__M5_ORBIT_PRE_SAVE_GATE__) { const gate = globalThis.__M5_ORBIT_PRE_SAVE_GATE__; gate.started?.resolve?.(); await gate.promise; }
        if (!orbitWriteCurrent()) return { ok: false, reason: 'stale', stale: true, committed: true, keepInstalled: true };
        const created = await orbitAdapter.createMapFile(orbitCreation.handle, creationDestination.name, {
          isCurrent: () => orbitWriteCurrent() && !destroying
        });
        if (!created.ok) {
          setShellStatus(created.reason === 'exists' ? 'The Orbit destination name is already taken; the installed map remains unsaved.' : created.reason === 'preflight-incomplete' ? 'The Orbit destination check was incomplete; no file was written and the installed map remains unsaved.' : created.message || 'The Orbit destination could not be created.');
          publish();
          return { ok: false, reason: created.reason || 'orbit-create-failed', message: created.message, committed: true, keepInstalled: true, destination: creationDestination };
        }
        if (!orbitWriteCurrent()) return { ok: false, reason: 'stale', stale: true, committed: true, keepInstalled: true };
        try {
          saved = await enqueueDocumentSave({ context: 'creation', target: { handle: created.handle, name: created.name, origin: 'orbit', documentIdentity: orbitCreation.identity }, capturedRevision: committedOwner.revision, preencoded: { blob: creationDestination.encoded }, expectedOwnership: orbitCreation.ownership, expectedSession: committedOwner.session, expectedDataset: committedOwner.dataset });
        } catch (error) {
          saved = { ok: false, reason: 'save-failed', message: String(error?.message || error) };
        }
        if (saved?.ok) {
          if (orbitWorkspaceBusy === owner) orbitWorkspaceBusy = null;
          renderOrbitPanel();
          await refreshOrbit();
          syncOrbitCurrentEntry();
          if (saved.handoff) setRoutineStatus('Download started; file persistence is not confirmed.');
  else if (saved.baselineWritten === false) setShellStatus('Created ' + saved.filename + '; the file baseline could not be verified and the next overwrite requires revalidation.');
  else setRoutineStatus('Created and saved ' + saved.filename + '.');
        } else if (saved?.reason !== 'stale') {
          setShellStatus('The Orbit file was created, but the map was not confirmed saved. The installed map remains unsaved and recoverable.');
        }
      } finally {
        if (orbitWorkspaceBusy === owner) orbitWorkspaceBusy = null;
        renderOrbitPanel();
      }
    } else {
      try {
        saved = await enqueueDocumentSave({ context: 'creation', target: creationDestination, capturedRevision: committedOwner.revision });
      } catch (error) {
        saved = { ok: false, reason: 'save-failed', message: String(error?.message || error) };
        setShellStatus('Document save failed. The new map remains unsaved.');
      }
      if (saved?.ok && !saved.handoff) setRoutineStatus('Created and saved ' + saved.filename + '.');
      else if (saved?.ok && saved.handoff) { /* keep the unconfirmed download message */ }
      else if (!saved?.ok) { /* saveDocument already reported the failure; the live map remains unsaved */ }
    }
  }
  if (!committedMatches()) return { ok: false, reason: 'stale', stale: true, committed: true };
  publish();
  return { ...installed, committed, save: saved, destination: creationDestination };
}

function destroy() {
  clearSaveFeedbackMessageTimer();
  try { feedbackPositionObserver?.disconnect?.(); } catch {}
  feedbackPositionObserver = null;
  if (shellStatusTimer !== null) { clearTimeout(shellStatusTimer); shellStatusTimer = null; }
  shellStatusExpiryCallback = null;
  shellStatusPreviousExpiry = null;
  shellStatusScope = null;
  shellStatusToken += 1;
  createMapOperation += 1;
  documentOwnershipSeq += 1;
  orbitDocumentOpenSeq += 1;
  fileOpenBrowser?.destroy?.();
  orbitState.destroy();
  orbitConflictDialog?.destroy?.();
  creationTerminalHandled = true;
  releasePendingCreateCandidate();
  cancelStartupRecovery();
  recoveryScheduler?.invalidate();
  invalidateDocumentSave();
  clearPendingBackupImport();
  if (destroying) return;
  invalidateBackup(); if (backupFileInput) { backupFileInput.remove(); backupFileInput = null; }
  persistenceSessionSeq += 1; saveOperationToken += 1; openOperationToken += 1; replacementGuard = null; conflictGuard = null; conflictIdentity = null;
  persistenceRepository?.close();
  saveConflictDialog?.close({ restoreFocus: false }); unsavedMapPrompt?.close({ restoreFocus: false }); savedMapsDialog?.close({ restoreFocus: false, notify: false });
  stopViewportObserver();
  if (detachEditorContextMenu) { detachEditorContextMenu(); detachEditorContextMenu = null; }
  if (detachLabelContextMenu) { detachLabelContextMenu(); detachLabelContextMenu = null; }
  if (detachLabelClick) { detachLabelClick(); detachLabelClick = null; }
  destroying = true;
  largeMapView?.destroy(); largeMapView = null; globalThis.__M5_LARGE_MAP_VIEW__ = null; largeMapContainer?.remove(); largeMapContainer = null;
  if (attachmentViewer) { attachmentViewer.destroy(); attachmentViewer = null; }
  if (deleteConfirmation) { deleteConfirmation.destroy(); deleteConfirmation = null; }
  if (editorMenu) { editorMenu.destroy(); editorMenu = null; }
  if (attachmentRegistry) { attachmentRegistry.clear(); attachmentRegistry = null; }
  if (history) { history.clear(); history = null; }
  if (undoHistoryButton) undoHistoryButton.disabled = true;
  if (redoHistoryButton) redoHistoryButton.disabled = true;
  if (editorPanel) { editorPanel.destroy(); editorPanel = null; }
  editorController = null;
  ownership.reset();
  if (dragGesture) { dragGesture.destroy(); dragGesture = null; }
  cleanupDrag();
  if (labelDragGesture) { labelDragGesture.destroy(); labelDragGesture = null; }
  if (navigator) { navigator.cancel('destroy'); navigator = null; }
  if (overlay && transitionLabels) overlay.cancelTransition();
  transitionLabels = false;
  if (navigation) { navigation.destroy(); navigation = null; }
  if (surface) { surface.destroy(); surface = null; }
  if (overlay) { overlay.destroy(); overlay = null; }
  if (dragGhostEl) { dragGhostEl.style.display = 'none'; dragGhostEl.textContent = ''; }
  if (dragTargetEl) dragTargetEl.style.display = 'none';
  dropFeedback?.clear();
  if (labelHost) labelHost.replaceChildren();
  frameState = null;
  session = null;
}

window.addEventListener('resize', scheduleViewportResize);
renderOrbitPanel();

document.querySelector('#fit')?.addEventListener('click', fitGraph);
fixtureEl.addEventListener('change', () => boot(fixtureEl.value));
window.addEventListener('pagehide', (event) => { if (!event.persisted) { savedMapsDialog?.destroy(); unsavedMapPrompt?.destroy(); saveConflictDialog?.destroy(); destroy(); } });
window.addEventListener('beforeunload', (event) => {
  if ((hasMap && mapDirty()) || editorController?.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
startEmptyState();
if (globalThis.__M5_LARGE_MAP_TEST_HOOK__) { window.__M5_LARGE_MAP_TEST__ = { async importFile(file) { return importBackupFile(file, { name: file.name, mode: 'download', handle: null }); }, async importWritable(file, handle) { return importBackupFile(file, { name: file.name, mode: 'writable', handle, origin: 'file' }); }, async saveCurrent() { return saveCurrentDocument({ context: 'test-save' }); } }; }
if (globalThis.__M5_P1B_TEST_HOOKS__) { window.__M5_P1B_TEST__ = { automaticSaveState() { return { blocked: automaticSaveBlocked, pending: Boolean(automaticSavePending), inFlight: automaticSaveActionInFlight, failure: automaticSaveFailure ? { reason: automaticSaveFailure.reason, message: automaticSaveFailure.message } : null }; }, runtimeAccessStats() { return runtimeAccess.stats(); }, openState() { try { return { open: Boolean(fileOpenBrowser?.isOpen), busy: Boolean(fileOpenBrowser?.isBusy), requestId: fileOpenBrowser?.requestId ?? null, block: openRequestBlockedReason(), editorApplied: Boolean(editorAppliedOperation), editorSaving: Boolean(editorController?.isSaving?.()), persistenceBusy, replacementGuard: Boolean(replacementGuard), pendingImport: Boolean(pendingBackupImport), installingImport: Boolean(installingBackupImport), navigatorBusy: Boolean(navigator?.busy), sessionInstalling: Boolean(session?.getState?.()?.installing), documentSaving, documentSaveInFlight }; } catch (error) { return { error: String(error?.message || error) }; } }, automaticSaveState() { return { pending: Boolean(automaticSavePending), pendingRevision: automaticSavePending?.revision ?? null, blocked: automaticSaveBlocked, failure: automaticSaveFailure ? { reason: automaticSaveFailure.reason, token: automaticSaveFailure.token } : null, editorOpen: Boolean(editorController?.isOpen()), inFlight: documentSaveInFlight, queueActive: documentSaveQueueActive, persistenceBusy, replacementGuard: Boolean(replacementGuard), pendingImport: Boolean(pendingBackupImport), installingImport: Boolean(installingBackupImport), active: activeDocument.active, mode: activeDocument.mode, hasHandle: Boolean(activeDocument.handle), dataRevision, savedRevision: activeDocument.savedRevision, dirty: mapDirty() }; }, touch() { runtimeAccess.advanceRevision(); publish(); }, delayNextSave(ms) { p1bSaveDelay = Number(ms) || 0; }, deferNextSave() { let release; const promise = new Promise((resolve) => { release = resolve; }); p1bSaveGate = { promise, release }; }, releaseDeferredSave() { p1bSaveGate?.release?.(); }, delayNextOpen(ms) { p1bOpenDelay = Number(ms) || 0; }, failNextOpen(stage) { const next = String(stage || ""); if (next === "label" || next === "hit") p1bFrameFailures.push({ operation: "open-saved-map", boundary: next === "label" ? "labels" : "installHit", remaining: 1 }); else p1bOpenFailStage = next; }, failFrame(operation, boundary, count = 1) { p1bFrameFailures.push({ operation: String(operation), boundary: String(boundary), remaining: Math.max(1, Number(count) || 1) }); }, frameCounts() { return { ...p1bFrameCounts }; }, clearFrameFailures() { p1bFrameFailures.length = 0; }, async saveRepositoryFixture(name = 'Legacy Fixture') { const snap = buildSaveSnapshot({ tree, registry: attachmentRegistry, mapping: attachmentIds, mapId: null, expectedGeneration: null, datasetToken, capturedRevision: dataRevision, allocateAttachmentId: createAttachmentId }); return persistenceRepository.save(snap); }, async recoveryCheckpoint() { const ws = recoveryScheduler?.workspace; if (!ws) return null; try { const loaded = await persistenceRepository.loadRecoveryCheckpoint(ws.workspaceId); if (!loaded?.checkpoint) return { workspace: ws, checkpoint: null, attachments: [] }; return { workspace: ws, checkpoint: loaded.checkpoint, attachments: await Promise.all(loaded.attachments.map(async (entry) => ({ attachmentId: entry.attachmentId, name: entry.metadata.originalName, sizeBytes: entry.metadata.sizeBytes, bytes: Array.from(new Uint8Array(await entry.blob.arrayBuffer())) }))) }; } catch (error) { return { workspace: ws, checkpoint: null, error: String(error?.message || error), code: error?.code || null }; } }, async establishRecoveryForTest() { return establishRecoveryWorkspace({ origin: 'test' }); }, recoveryState() { const ws = recoveryScheduler?.workspace; return { workspace: ws ? { workspaceId: ws.workspaceId, workspaceToken: ws.workspaceToken, session: ws.session, dataset: ws.dataset, controlVersion: ws.controlVersion } : null, diagnostics: recoveryScheduler ? { ...recoveryScheduler.diagnostics } : null, diagnostic: recoveryDiagnostic, pending: Boolean(recoveryScheduler?.pending) }; }, async flushRecovery() { try { await recoveryScheduler?.flush(); } catch {} return recoveryScheduler?.diagnostics || null; }, async recoveryCandidates() { try { return await persistenceRepository.listRecoveryCandidates(); } catch { return []; } }, async recoveryWorkspaceRecord(workspaceId) { try { return await persistenceRepository.loadRecoveryWorkspace(workspaceId); } catch { return null; } }, async recoveryControl() { const ws = recoveryScheduler?.workspace; if (!ws) return null; try { return await persistenceRepository.loadRecoveryWorkspace(ws.workspaceId); } catch { return null; } }, deferAfterRecoveryInstall() { let release; const promise = new Promise((resolve) => { release = resolve; }); recoveryAfterInstallGate = promise; recoveryAfterInstallRelease = release; return true; }, releaseAfterRecoveryInstall() { recoveryAfterInstallRelease?.(); recoveryAfterInstallRelease = null; }, deferRecoveryDiscardStart() { let release; const promise = new Promise((resolve) => { release = resolve; }); recoveryDiscardStartGate = promise; recoveryDiscardStartRelease = release; return true; }, releaseRecoveryDiscardStart() { recoveryDiscardStartRelease?.(); recoveryDiscardStartRelease = null; }, deferAfterRecoveryClaim() { let release; const promise = new Promise((resolve) => { release = resolve; }); recoveryAfterClaimGate = promise; recoveryAfterClaimRelease = release; return true; }, releaseAfterRecoveryClaim() { recoveryAfterClaimRelease?.(); recoveryAfterClaimRelease = null; }, recoveryOperationState() { const request = activeRecoveryRequest; return request ? { kind: request.kind, id: request.id, claimId: request.claim?.claimId || null, installed: Boolean(request.installed), destructiveStarted: Boolean(request.destructiveStarted), childId: request.child?.workspace?.workspaceId || null } : null; }, deferNextRecoveryRetirement() { let release; const promise = new Promise((resolve) => { release = resolve; }); recoveryDeferredRetirement = { release }; recoveryScheduler?.deferNextRetirement(() => promise); return true; }, releaseRecoveryRetirement() { recoveryDeferredRetirement?.release?.(); recoveryDeferredRetirement = null; }, failNextRecoveryCheckpoint() { recoveryScheduler?.deferNextPreparation(() => Promise.reject(Object.assign(new Error('injected child checkpoint failure'), { code: 'injected-checkpoint-failure' }))); return true; }, deferNextRecoveryCheckpoint() { let release; const promise = new Promise((resolve) => { release = resolve; }); recoveryDeferredPreparation = { release }; recoveryScheduler?.deferNextPreparation(() => promise); return true; }, releaseRecoveryCheckpoint() { recoveryDeferredPreparation?.release?.(); recoveryDeferredPreparation = null; }, setRecoveryDebounce(ms) { recoveryScheduler?.setDebounce(Number(ms) || 0); },selectForTest(id) { const node = graph?.nodes?.get(id); if (!node) return false; const result = model.select(id); if (!result.ok) return false; detailsTargetId = id; publish(); refreshLabelPriority(); return true; },
showActionableStatusForTest(message) { return setShellStatus(String(message)); }, clearOpenErrorStatusForTest() { return clearOpenErrorStatus(); }, setMapLibraryPermissionStateForTest(permission) { const state = orbitState.snapshot(); if (!state.handle) return false; void Promise.resolve(orbitState.restoreDirectory(state.handle, { name: state.name, permission: String(permission), enumerate: false })).then(() => renderOrbitPanel()); return true; }, setMapLibraryPermissionResultForTest(result) { mapLibraryPermissionOverride = result ? String(result) : null; return true; }, startMapLibraryRestoreForTest() { void restoreMapLibraryFromSettings(); return true; }, setMapLibraryRestoreDelayForTest(value) { mapLibraryRestoreDelayForTest = Math.max(0, Number(value) || 0); return true; }, setMapLibraryReadQueryForTest(value) { mapLibraryReadQueryOverride = value ? String(value) : null; return true; },  setSavePermissionForTest({ query = null, request = null } = {}) { savePermissionQueryOverride = query; savePermissionRequestOverride = request; savePermissionRequestCount = 0; return true; }, saveDocumentForTest() { return saveCurrentDocument({ context: 'test' }); }, automaticSaveForTest() { return saveCurrentDocument({ context: 'test-auto', automatic: true }); }, savePermissionStateForTest() { return { requestCount: savePermissionRequestCount, dialogOpen: Boolean(permissionDialog?.open) }; }, setMapLibraryStorageFailureForTest(value) { mapLibraryStorageFailureForTest = Boolean(value); return true; }, mapLibraryPersistenceStateForTest() { const state = orbitState.snapshot(); return { requestCount: mapLibraryPermissionRequestCount, hasHandle: Boolean(state.handle), name: state.name, permission: state.permission, phase: state.phase }; }, nodeStyle(id) { const n = frameState?.scene?.nodes?.get(id); return n ? { fill: n.fill, stroke: n.stroke, shape: n.shape, kind: n.kind } : null; }, labelGeometry(id) { const group = overlay?.getMetrics?.().labels?.get(id); if (!group) return null; const r = group.getBoundingClientRect(); return { display: group.style.display, visibility: group.style.visibility, opacity: group.style.opacity, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }; }, visibleLabelIds() { const labels = overlay?.getMetrics?.().labels; if (!labels) return []; return [...labels].filter(([, group]) => group.style.display !== 'none' && group.style.visibility !== 'hidden' && Number(group.style.opacity ?? 1) > 0).map(([id]) => id); }, labelHitTestId(id) { const group = overlay?.getMetrics?.().labels?.get(id); if (!group) return { visible: false, hit: null }; const r = group.getBoundingClientRect(); const l = overlay.labelAtPoint(r.left + r.width / 2, r.top + r.height / 2); return { visible: true, hit: l?.id || null, activation: l?.id === id ? (overlay.labelActivationAtPoint(r.left + r.width / 2, r.top + r.height / 2)?.activation || null) : null }; }, hitTestNodeId(id) { const sceneNode = frameState?.scene?.nodes?.get(id); if (!sceneNode) return { visible: false, hit: null }; return { visible: true, hit: hitTestNode(frameState.hit, { x: sceneNode.center.x, y: sceneNode.center.y }), center: { ...sceneNode.center }, radius: sceneNode.radius }; }, nodeSceneCenter(name) { const node = [...graph.nodes.values()].find((entry) => entry.name === name); const sceneNode = node ? frameState?.scene?.nodes?.get(node.id) : null; return sceneNode ? { id: node.id, center: { ...sceneNode.center }, radius: sceneNode.radius } : null; }, sceneBounds() { const nodes = [...(frameState?.scene?.nodes?.values?.() || [])]; if (!nodes.length) return null; return { minX: Math.min(...nodes.map((node) => node.center.x - node.radius)), maxX: Math.max(...nodes.map((node) => node.center.x + node.radius)), minY: Math.min(...nodes.map((node) => node.center.y - node.radius)), maxY: Math.max(...nodes.map((node) => node.center.y + node.radius)) }; }, layoutGeometry() { const canvas = surface?.canvas; return { wrapper: { width: graphWrap?.clientWidth || 0, height: graphWrap?.clientHeight || 0 }, barHeight: graphActionToolbar?.offsetHeight || 0, viewport: viewport(), canvas: canvas ? { styleWidth: canvas.style.width, styleHeight: canvas.style.height, width: canvas.width, height: canvas.height } : null, label: overlay?.getMetrics?.()?.viewport || null, fit: { width: viewport().width, height: viewport().height } }; }, resizeViewportTest(width, height) { if (graphWrap) { graphWrap._clientWidth = width; graphWrap._clientHeight = height; } const drawableHeight = Math.max(0, height - (graphActionToolbar?.offsetHeight || 0)); if (graphViewport) { graphViewport._clientWidth = width; graphViewport._clientHeight = drawableHeight; } if (host) { host._clientWidth = width; host._clientHeight = drawableHeight; } if (labelHost) { labelHost._clientWidth = width; labelHost._clientHeight = drawableHeight; } handleViewportResize(); return this.layoutGeometry(); }, hitTestClient(clientX, clientY) { return hitAtEvent({ clientX, clientY })?.id || null; }, setCanvasRect(rect) { if (surface?.canvas && rect) surface.canvas.getBoundingClientRect = () => ({ ...rect }); return Boolean(surface?.canvas); }, contextProbe(clientX, clientY, rect = null) { if (rect && surface?.canvas) surface.canvas.getBoundingClientRect = () => ({ ...rect }); const diagnosed = diagnoseEditorTarget({ event: { button: 2, clientX, clientY }, canvas: surface.canvas, frameState, graph }); return diagnosed?.ok ? diagnosed.target.id : null; }, coordinateProbe(name, clientX, clientY, rect = null) { if (rect && surface?.canvas) surface.canvas.getBoundingClientRect = () => ({ ...rect }); const node = [...graph.nodes.values()].find((entry) => entry.name === name); const sceneNode = node ? frameState?.scene?.nodes?.get(node.id) : null; if (!node || !sceneNode) return null; showTarget(node.id); moveGhost({ clientX, clientY }); const result = { nodeId: node.id, center: { ...sceneNode.center }, radius: sceneNode.radius, targetLeft: Number.parseFloat(dragTargetEl?.style?.left), targetTop: Number.parseFloat(dragTargetEl?.style?.top), ghostLeft: Number.parseFloat(dragGhostEl?.style?.left), ghostTop: Number.parseFloat(dragGhostEl?.style?.top), hit: hitAtEvent({ clientX, clientY })?.id || null }; cleanupDrag(); return result; }, editorState() { const form = editorPanel?.form; return { formHidden: form?.hidden ?? null, action: editorController?.action ?? null, dirty: Boolean(editorController?.dirty), mode: editorController?.mode ?? null, targetId: editorController?.targetId ?? null, input: editorPanel?.input || null, value: editorPanel?.input?.value ?? null, error: form?.querySelector?.('.editor-error')?.textContent ?? null, composing: editorPanel?.isComposing?.() ?? null, formToken: editorPanel?.getFormToken?.() ?? null, detailsCollapsed: detailsPanel?.dataset.collapsed === 'true', detailsHidden: Boolean(detailsContent?.hidden), toggleDisabled: Boolean(detailsToggle?.disabled) }; }, openNodeMenu(name) { const node = [...graph.nodes.values()].find((entry) => entry.name === name); return node ? activateEditorTarget({ id: node.id, kind: node.kind }, { type: 'contextmenu', clientX: 1, clientY: 1 }) : false; }, findNode(name) { const node = [...graph.nodes.values()].find((entry) => entry.name === name); return node ? { id: node.id, kind: node.kind, name: node.name } : null; }, reparentTest(sourceId, targetId) { return performReparent(sourceId, targetId, { sourceId, generation, datasetToken, structuralRootId: model.structuralRootId }); }, historyTest(direction) { return performHistoryMove(direction); }, scheduleRecoveryTest() { return scheduleRecoveryCheckpoint({ immediate: true }); }, syncHistoryTest() { syncHistoryControls(); return { undoDisabled: undoHistoryButton?.disabled ?? null, redoDisabled: redoHistoryButton?.disabled ?? null }; }, historyState() { return { undo: history?.undo?.length || 0, redo: history?.redo?.length || 0, revision: dataRevision, mapId: activeMap?.mapId || null, blocked: historyBlockedReason() }; }, async repositoryRecord(mapId) { const loaded = await persistenceRepository.load(mapId); const map = loaded.map || loaded; const document = loaded.document || map; const attachments = loaded.attachments || map.attachments || []; return { mapId: map.mapId, tree: document.tree, attachments, attachmentBytes: await Promise.all(attachments.map(async (entry) => ({ attachmentId: entry.attachmentId, name: entry.originalName, bytes: Array.from(new Uint8Array(await (entry.blob || entry.file).slice(0, (entry.blob || entry.file).size).arrayBuffer())) }))) }; }, async simulateExternalSave() { const snap = buildSaveSnapshot({ tree, registry: attachmentRegistry, mapping: attachmentIds, mapId: activeMap.mapId, expectedGeneration: activeMap.generation, datasetToken, capturedRevision: dataRevision, allocateAttachmentId: createAttachmentId }); return persistenceRepository.save(snap); }, async listCount() { return (await persistenceRepository.list()).length; }, saveCount() { return saveInvocationCount; }, deferBackupStart() { let release; const promise = new Promise((resolve) => { release = resolve; }); backupStartGate = { promise, release }; }, releaseBackupStart() { backupStartGate?.release?.(); backupStartGate = null; }, deferImportHash() { let release, reject; const promise = new Promise((resolve, rejectFn) => { release = resolve; reject = rejectFn; }); backupImportHashGates.push({ promise, release, reject, started: false, used: false, released: false }); }, importHashStarted() { return backupImportHashGates.some((gate) => gate.started); }, releaseImportHash() { const gate = backupImportHashGates.find((entry) => !entry.released); if (gate) { gate.released = true; gate.release(); } }, deferNextCopyEncode() { let release, reject; const promise = new Promise((resolve, rejectFn) => { release = resolve; reject = rejectFn; }); copyEncodingGate = { promise, release, reject, started: false }; return true; }, copyEncodeStarted() { return Boolean(copyEncodingGate?.started); }, releaseCopyEncode() { const gate = copyEncodingGate; if (gate) { gate.release(); } }, failCopyEncode() { const gate = copyEncodingGate; if (gate) { gate.reject(new Error('injected copy encoding failure')); } }, failImportHash() { const gate = backupImportHashGates.find((entry) => !entry.released); if (gate) { gate.released = true; gate.reject(new Error('injected deferred attachment read failure')); } }, importCommitCount() { return backupImportCommitCount; }, pendingImportState() { return { pending: Boolean(pendingBackupImport), installing: Boolean(installingBackupImport), registrySize: pendingBackupImport?.registry?.size ?? installingBackupImport?.registry?.size ?? null }; }, failNextImportPreparation() { p1bImportPreparationFailure = true; }, replaceSession() { cancelRecoveryRequest('replacement'); invalidateBackup(); persistenceSessionSeq += 1; datasetToken += 1; editorAppliedOperation = null; invalidateDocumentSave(); persistenceBusy = 'loading'; setShellStatus('NEW SESSION'); publish(); }, settleSession() { persistenceBusy = null; syncPersistenceControls(); publish(); }, cancelBackup() { return cancelBackup(); }, backupBusy() { return backupBusy(); }, startDownload() { return downloadBackup(); }, chooseBackup() { chooseBackupFile(); return backupFileInput; }, async exportPackage() { return (await encodeBackup({ tree, registry: attachmentRegistry, mapName: tree.name, sourceMapId: activeMap?.mapId || null })).blob; }, async decodeDocument(blob) { const decoded = await decodeBackup(blob); return { tree: decoded.tree, attachments: await Promise.all(decoded.attachments.map(async (entry) => ({ name: entry.metadata?.originalName || entry.originalName || '', size: entry.blob.size, bytes: Array.from(new Uint8Array(await entry.blob.arrayBuffer())) }))) }; }, async importPackage(blob) { return importBackupFile(blob); }, destroyMain() { destroy(); }, searchHighlightState() { const scene = frameState?.scene; const rendered = scene ? highlightedScene(scene) : null; const colors = {}; const folderColors = {}; if (rendered) for (const [id, node] of rendered.scene.nodes) if (node.kind === 'folder') folderColors[id] = { fill: node.fill, stroke: node.stroke }; for (const id of searchHighlightIds) { const node = rendered?.scene?.nodes?.get(id); colors[id] = node ? { fill: node.fill, stroke: node.stroke } : null; } return { query: searchQuery, ids: [...searchHighlightIds].sort(), colors, folderColors, edges: rendered ? rendered.scene.edges.filter((edge) => searchHighlightIds.has(edge.fromId) && searchHighlightIds.has(edge.toId)).map((edge) => ({ fromId: edge.fromId, toId: edge.toId, stroke: edge.stroke, opacity: edge.opacity })) : [], activeId: searchView?.activeId ?? null, selectedId: model?.selectedId ?? null, status: searchHighlightStatusEl?.textContent || '', scenePresent: Boolean(scene) }; }, clearShellStatusForTest() { if (shellStatusTimer !== null) clearTimeout(shellStatusTimer); shellStatusTimer = null; shellStatusExpiryCallback = null; shellStatusToken += 1; shellStatusKind = 'none'; shellStatusScope = null; shellStatusTransient = false; if (shellStatusEl) { shellStatusEl.textContent = ''; shellStatusEl.dataset.feedbackKind = 'none'; shellStatusEl.hidden = true; } }, setShellStatusForTest(message, options = {}) { setShellStatus(message, options); return this.shellStatusState(); }, shellStatusState() { return { message: shellStatusEl?.textContent || '', kind: shellStatusKind, token: shellStatusToken, timer: Boolean(shellStatusTimer), transient: shellStatusTransient, hidden: Boolean(shellStatusEl?.hidden) }; }, shellStatusExpirePrevious() { const callback = shellStatusPreviousExpiry; if (!callback) return false; callback(); return true; }, shellStatusExpire() { if (!shellStatusExpiryCallback) return false; const callback = shellStatusExpiryCallback; if (shellStatusTimer !== null) clearTimeout(shellStatusTimer); shellStatusTimer = null; callback(); return true; }, closeOrbitTest() { closeOrbit(); }, closeRepository() { persistenceRepository?.close(); }, cancelBlocked() { return cancelBlockedPersistence(); }, operation() { return editorAppliedOperation; }, staleAppliedOwner() { if (editorAppliedOperation) editorAppliedOperation.formToken = -1; }, retryState() { return editorPanel?.getRetryState?.() || null; }, treeSnapshot() { return tree ? structuredClone(tree) : null; }, snapshot() { return { blocked: persistenceBlocked, creationOwned: ownership.creationOwned, unavailable: Boolean(persistenceUnavailable), hasMap, mapId: activeMap?.mapId || null, generation: activeMap?.generation || null, savedRevision: activeMap?.savedRevision ?? null, dataRevision, dirty: mapDirty(), busy: persistenceBusy, guard: Boolean(replacementGuard) }; }, documentState() { return { ...activeDocument, handleName: activeDocument.handle?.name || null }; }, documentSaveState() { return { inFlight: documentSaveInFlight, saving: documentSaving, owner: documentSaveOwner, operation: documentOperation, destroying, lastFailure: lastDocumentFailure }; }, openDraft() { const details = model.details(tree.id); const target = createEditorTarget({ id: tree.id, hitKind: "folder", name: details.name, datasetToken, baseRevision: dataRevision }); return chooseEditorTarget({ ...target, isRoot: true }); }, openAddData() { const details = model.details(tree.id); const target = createEditorTarget({ id: tree.id, hitKind: "folder", name: details.name, datasetToken, baseRevision: dataRevision }); return editorPanel.openAdd(details); }, attachmentSnapshot() { return { size: attachmentRegistry?.size || 0, totalBytes: attachmentRegistry?.totalBytes || 0, entries: attachmentRegistry?.snapshot?.() || [] }; }, destroyViewer() { attachmentViewer?.destroy?.(); attachmentViewer = null; }, async attachmentBytesById(id) { const record = attachmentRegistry?.get?.(id); return record ? new Uint8Array(await record.file.slice(0, record.file.size).arrayBuffer()) : null; }, async attachmentBytes(name) { const entry = attachmentRegistry?.snapshot?.().find((item) => item.originalName === name); if (!entry) return null; const record = attachmentRegistry.get(entry.attachmentId); return record ? new Uint8Array(await record.file.slice(0, record.file.size).arrayBuffer()) : null; }, openAttachmentByName(name) { const node = [...graph.nodes.values()].find((entry) => entry.name === name); return node ? (openAttachmentViewer(node.id), true) : false; }, openFirstFileMenu() { const fileNode = [...graph.nodes.values()].find((node) => node.kind === "file"); if (!fileNode) return false; return activateEditorTarget({ id: fileNode.id, kind: "file" }, { type: "contextmenu", clientX: 1, clientY: 1 }); }, openFolderMenu() { return activateEditorTarget({ id: tree.id, kind: "folder" }, { type: "contextmenu", clientX: 1, clientY: 1 }); } }; }
function countSubtree(node) {
  let folders = 0; let files = 0;
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (current.kind === 'folder') folders += 1; else files += 1;
    for (const child of current.children || []) stack.push(child);
  }
  return { folders, files };
}
function requestDeleteConfirmation(target, action, identity = {}) {
  if (replacementGuard) return { ok: false, reason: 'replacement-pending' };
  if (replacementGuard) return { ok: false, reason: 'replacement-pending' };
  if (attachmentViewer?.isOpen) return { ok: false, reason: 'attachment-viewer-open' };
  const expectedDatasetToken = identity.expectedDatasetToken ?? datasetToken;
  const expectedBaseRevision = identity.expectedBaseRevision ?? dataRevision;
  if (expectedDatasetToken !== datasetToken || expectedBaseRevision !== dataRevision) {
    lastClickDiagnostic = { reason: 'stale-delete-confirmation', id: target?.id ?? null };
    publish(); return { ok: false, reason: 'stale-delete-confirmation' };
  }
  if (ownership.blocked()) return { ok: false, reason: 'interaction-inert' };
  if (navigator?.busy) return { ok: false, reason: 'transition-busy' };
  if (dragState) return { ok: false, reason: 'drag-busy' };
  if (editorController?.isSaving()) return { ok: false, reason: 'editor-saving' };
  if (!target || typeof target.id !== 'string') return { ok: false, reason: 'stale-editor-target' };
  const resolved = resolveDeleteTarget({ tree, target, action, structuralRootId: model.structuralRootId });
  if (!resolved.ok) { lastClickDiagnostic = { reason: resolved.reason, id: target?.id ?? null }; publish(); return resolved; }
  const found = resolved.found;
  const counts = resolved.counts;
  if (!model.view().visibleSet.has(found.node.id) || !graph.nodes.get(found.node.id)) { lastClickDiagnostic = { reason: 'delete-target-invisible', id: target.id }; publish(); return { ok: false, reason: 'delete-target-invisible' }; }
  if (editorController?.isOpen()) {
    const intent = { kind: 'delete-request', target: { id: found.node.id, name: found.node.name, kind: found.node.kind }, action, datasetToken, baseRevision: dataRevision };
    const decision = editorPanel?.requestSelection(intent);
    if (decision?.blocked) return { ok: true, action: 'prompt', reason: decision.reason };
    editorPanel?.clear();
  }
  const opened = deleteConfirmation.open({
    target: { id: found.node.id, name: found.node.name, kind: found.node.kind },
    folders: counts.folders, files: counts.files,
    datasetToken: expectedDatasetToken, baseRevision: expectedBaseRevision, parentId: found.parent.id
  });
  lastClickDiagnostic = { reason: opened ? 'delete-confirm-opened' : 'delete-confirm-failed', id: target.id };
  publish();
  return { ok: opened, reason: opened ? 'confirm-open' : 'delete-confirm-failed' };
}
function executeDeleteConfirmation(value) {
  if (!value || ownership.blocked()) return { ok: false, reason: 'interaction-inert' };
  if (navigator?.busy) return { ok: false, reason: 'transition-busy' };
  if (dragState) return { ok: false, reason: 'drag-busy' };
  if (value.datasetToken !== datasetToken || value.baseRevision !== dataRevision) {
    lastClickDiagnostic = { reason: 'stale-delete-confirmation', id: value.target.id };
    publish(); return { ok: false, reason: 'stale-delete-confirmation' };
  }
  const resolved = resolveDeleteTarget({ tree, target: value.target, action: value.target.kind === 'folder' ? 'delete-folder' : 'delete-data', structuralRootId: model.structuralRootId });
  if (!resolved.ok) { lastClickDiagnostic = { reason: resolved.reason, id: value.target.id }; publish(); return { ok: false, reason: resolved.reason }; }
  const found = resolved.found;
  if (found.parent?.id !== value.parentId) { lastClickDiagnostic = { reason: 'stale-delete-target', id: value.target.id }; publish(); return { ok: false, reason: 'stale-delete-target' }; }
  const old = { tree, graph, baseLayout, model, session, navigator };
  const viewBefore = captureHistoryView();
  const commit = (candidate, candidateSession) => {
    tree = candidate.tree; graph = candidate.graph; baseLayout = candidate.baseLayout; model = candidate.model;
    session = candidateSession; runtimeAccess.advanceRevision();
    const deleteCommand = candidate.model.view();
    detailsTargetId = resolvePostOperationDetails({ operation: value.target.kind === 'folder' ? 'delete-folder' : 'delete-data', currentDetailsTargetId: viewBefore.detailsTargetId, parentId: value.parentId, deletedIds: new Set([value.target.id]), model: candidate.model, graph: candidate.graph });
    navigator = null; createNavigator(); createNavigation();
    void deleteCommand;
  };
  const recover = () => {
    tree = old.tree; graph = old.graph; baseLayout = old.baseLayout; model = old.model; session = old.session; navigator = old.navigator;
    frameState = null;
    const recovered = recoverAuthoritativeSession(old.session);
    if (!recovered) ownership.markRecoveryFailure();
    if (!recovered) { linkFrameReady = false; overlay?.deactivateLinks(); }
    return recovered;
  };
  const result = performDeleteInstallation({
    tree, graph, baseLayout, model, session,
    targetId: value.target.id, structuralRootId: model.structuralRootId,
    datasetToken, expectedDatasetToken: datasetToken,
    baseRevision: value.baseRevision, expectedRevision: dataRevision,
    history, historyViewBefore: viewBefore, historyViewAfter: { ...viewBefore, detailsTargetId: value.parentId },
    viewport: viewport(), baseRadiusCss: baseRadius(), phase: 'current',
    frame: installFrame,
    invalidate: () => { frameState = null; },
    setCandidateEnv: (env) => { candidateEnv = env; },
    commit, recover
  });
  if (!result.ok) {
    lastClickDiagnostic = { reason: result.reason || 'delete-failed', id: value.target.id, error: String(result.error?.message || result.message || result.reason || 'delete failed') };
    publish(); return result;
  }
  sweepAttachments();
  scheduleRecoveryCheckpoint();
  lastClickDiagnostic = { reason: 'delete-complete', id: value.target.id };
  publish();
  return result;
}

startEmptyState();
void startRecoveryDiscovery();
syncPersistenceControls();
syncAutomaticSaveFeedback();



















































































































































































































































