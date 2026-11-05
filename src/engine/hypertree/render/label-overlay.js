import { GraphRenderError } from './errors.js';
import { classifyLabelPresentation, extensionOf } from './label-classification.js';
import { validateWebLink } from '../shared/web-link.js';

export const LABEL_LIMITS = Object.freeze({
  maxVisibleBudget: 500,
  defaultMaxLabels: 40,
  defaultMaxWidth: 180,
  defaultGap: 5,
  defaultPadding: 4,
  defaultOverlapPadding: 2,
  defaultRootProtectionPadding: 6
});

export const DEFAULT_LABEL_OPTIONS = Object.freeze({
  maxLabels: LABEL_LIMITS.defaultMaxLabels,
  maxWidth: LABEL_LIMITS.defaultMaxWidth,
  gap: LABEL_LIMITS.defaultGap,
  padding: LABEL_LIMITS.defaultPadding,
  overlapPadding: LABEL_LIMITS.defaultOverlapPadding,
  rootProtectionPadding: LABEL_LIMITS.defaultRootProtectionPadding,
  placement: 'legacy',
  linkActivation: 'immediate',
  labelPalette: null
});

/**
 * Create one owned non-interactive HTML label/icon overlay.
 *
 * Host contract: `position:relative` positioning host with no padding or
 * internal scrolling; overlay coordinates are CSS pixels and translation-only.
 * No CSS transform scaling/rotation or canvas border/padding compensation is
 * inferred.
 *
 * @param {HTMLElement} host
 * @param {object} [options]
 */
export function createLabelOverlay(host, options = {}) {
  if (!host || typeof host.appendChild !== 'function' || typeof host.removeChild !== 'function'
      || !host.ownerDocument || typeof host.ownerDocument.createElement !== 'function') {
    throw new GraphRenderError('invalid-host', 'label host with ownerDocument/appendChild/removeChild is required');
  }
  const config = normalizeLabelOptions(options);
  const element = createOverlayElement(host.ownerDocument);
  host.appendChild(element);
  return new LabelOverlay(host, element, config);
}

class LabelOverlay {
  #host;
  #element;
  #config;
  #labels = new Map();
  #destroyed = false;
  #metrics = emptyMetrics();
  #transition = null;

  constructor(host, element, config) {
    this.#host = host;
    this.#element = element;
    this.#config = config;
  }

  get element() {
    this.#assertAlive();
    return this.#element;
  }

  getMetrics() {
    this.#assertAlive();
    return Object.freeze({ ...this.#metrics, labels: new Map(this.#labels) });
  }


  /** Return the visible installed label owner at viewport/CSS coordinates. */
  labelAtPoint(x, y) {
    this.#assertAlive();
    if (this.#transition || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    for (const [id, group] of this.#labels) {
      if (group.style.display === 'none' || group.style.visibility === 'hidden') continue;
      if (!(Number(group.style.opacity ?? 1) > 0)) continue;
      if (typeof group.getBoundingClientRect !== 'function') continue;
      const rect = group.getBoundingClientRect();
      if (!rect || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) continue;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { id, link: Boolean(group.__vdLink), group };
      }
    }
    return null;
  }
  /** Resolve file-name vs icon activation from installed label geometry. */
  pruneTo(visibleIds) {
    if (!(visibleIds instanceof Set)) return;
    for (const [id, group] of this.#labels) {
      if (!visibleIds.has(id)) { removeElement(group); this.#labels.delete(id); }
    }
  }
  /** Resolve file-name vs icon activation from installed label geometry. */
  labelActivationAtPoint(x, y) {
    const label = this.labelAtPoint(x, y);
    if (!label) return null;
    const name = label.group.__vdNameText;
    if (name && typeof name.getBoundingClientRect === 'function') {
      const rect = name.getBoundingClientRect();
      if (rect && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
          && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { id: label.id, activation: 'file-name' };
      }
    }
    return { id: label.id, activation: 'icon' };
  }
  /**
   * Validate and build a complete new overlay before replacing the current
   * valid overlay. Invalid input/measurement leaves the old overlay intact.
   * @param {{scene:object, presentation:Map<string,object>}} input
   */
  update(input) {
    this.#assertAlive();
    if (this.#transition) this.cancelTransition();
    this.deactivateLinks();
    const scene = input && input.scene;
    const presentation = input && input.presentation;
    const { snapshot, records } = validateAndSnapshot(scene, presentation, this.#config.labelPalette, input.rootId);
    const priorityIds = normalizePriorityIds(input && input.priorityIds);
    const doc = this.#host.ownerDocument;
    let next = null;
    let labels = null;
    let metrics = null;

    try {
      const allCandidates = orderCandidates(snapshot, priorityIds, input.selectedId);
      const candidates = allCandidates.filter((node) => isNodeViewportEligible(node, this.#viewport(), this.#config));
      const selected = candidates.slice(0, this.#config.maxLabels);
      labels = new Map();
      const measured = [];
      next = createOverlayElement(doc);
      next.style.visibility = 'hidden';
      this.#host.appendChild(next);

      for (const node of selected) {
        const data = records.get(node.id);
        const group = buildLabel(doc, node, data, this.#config);
        next.appendChild(group);
        labels.set(node.id, group);
        measured.push({
          node,
          data,
          group,
          width: measureDimension(group, 'width'),
          height: measureDimension(group, 'height')
        });
      }

      const layout = this.#config.placement === 'around'
        ? placeLabels(measured, this.#viewport(), this.#config, snapshot.nodes, snapshot.rootId, input.selectedId, priorityIds)
        : placeLabelsLegacy(measured, this.#viewport(), this.#config);
      const labelNodeOverlapCount = countLabelNodeOverlaps(layout.visible, snapshot.nodes);
      for (const item of measured) {
        if (!layout.visible.has(item.node.id)) {
          item.group.style.display = 'none';
        } else {
          const rect = layout.visible.get(item.node.id);
          if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) {
            throw new GraphRenderError('invalid-measurement', 'computed label rectangle is not finite');
          }
          item.group.style.left = `${rect.left}px`;
          item.group.style.top = `${rect.top}px`;
          item.group.style.visibility = 'visible';
          item.group.style.display = 'flex';
          item.group.style.opacity = String(item.node.opacity);
        }
      }

      for (const item of measured) {
        const visible = layout.visible.has(item.node.id) && item.node.opacity > 0;
        item.group.style.pointerEvents = visible && item.node.kind === 'file' ? 'auto' : 'none';
        const live = this.#config.linkActivation === 'immediate' && visible;
        setLinkInert(item.group, !live);

      }
      let textMismatchCount = 0;
      for (const item of measured) {
        if ((item.group.__vdNameText?.textContent ?? item.group.textContent) !== item.data.name) textMismatchCount += 1;
      }
      const visibleCount = measured.filter((item) => layout.visible.has(item.node.id)).length;
      metrics = {
        candidateCount: allCandidates.length,
        viewportEligibleCount: candidates.length,
        viewportIneligibleCount: allCandidates.length - candidates.length,
        budgetExcludedCount: Math.max(0, candidates.length - selected.length),
        createdCount: labels.size,
        visibleCount,
        invalidWebLinkCount: [...records.values()].filter((record) => record.linkInvalid).length,
        suppressedCount: labels.size - visibleCount,
        overlapSuppressedCount: layout.overlapSuppressed,
        viewportSuppressedCount: layout.viewportSuppressed,
        nodeObstacleSuppressedCount: layout.nodeObstacleSuppressed,
        labelNodeOverlapCount,
        placementAttempts: layout.placementAttempts,
        labelNodeOverlapDefinition: 'visible label-node pairs; owner node excluded; exact circle/diamond intersection',
        placementObstaclePolicy: 'conservative glyph bounds',
        priorityVisibleCount: visibleCountFor(layout.visible, priorityIds),
        prioritySuppressedCount: priorityIds.length - visibleCountFor(layout.visible, priorityIds),
        unmeasurableCount: layout.unmeasurable,
        measuredCount: measured.length,
        visibleIconCount: 0,
        leadingIconCount: 0,
        rootProtection: layout.rootProtection,
        rootProtectionRect: layout.rootProtectionRect || null,
        rootLabelVisible: layout.rootLabelVisible,
        selectedLabelVisible: input.selectedId ? Boolean(layout.visible.has(input.selectedId) && effectiveNodeOpacity(snapshot.nodes.find((node) => node.id === input.selectedId)) > 0) : null,
        selectedLabelOpacity: input.selectedId ? effectiveNodeOpacity(snapshot.nodes.find((node) => node.id === input.selectedId)) : null,
        textMismatchCount,
        measurement: 'getBoundingClientRect/offsetWidth',
        dprIndependent: true,
        viewport: this.#viewport()
      };
      syncSelectedState(labels, input.selectedId);
      const selectedItem = input.selectedId ? measured.find((item) => item.node.id === input.selectedId) : null;
      if (selectedItem) addSelectedLeader(next, selectedItem.node, layout.visible.get(selectedItem.node.id), this.#config, effectiveNodeOpacity(selectedItem.node));
      next.style.visibility = 'visible';
    } catch (error) {
      removeElement(next);
      throw error;
    }

    // No throwing operation occurs after this point: replacement is complete.
    const old = this.#element;
    removeElement(old);
    this.#element = next;
    this.#labels = labels;
    this.#metrics = metrics;
    if (this.#config.linkActivation === 'immediate') this.activateLinks();
    return this.getMetrics();
  }
  /** Begin a stable-ID transition label plan. */
  beginTransition(input) {
    this.#assertAlive();
    this.deactivateLinks();
    if (this.#transition) this.cancelTransition();
    const { snapshot, records } = validateAndSnapshot(input.scene, input.presentation, this.#config.labelPalette, input.rootId);
    const priorityIds = normalizePriorityIds(input.priorityIds);
    const allCandidates = orderCandidates(snapshot, priorityIds, input.selectedId);
    const candidates = allCandidates.filter((node) => isNodeViewportEligible(node, this.#viewport(), this.#config));
    const selected = candidates.slice(0, this.#config.maxLabels);
    const doc = this.#host.ownerDocument;
    const next = createOverlayElement(doc);
    next.style.visibility = 'hidden';
    this.#host.appendChild(next);
    try {
      const labels = new Map();
      const measured = [];
      for (const node of selected) {
        const data = records.get(node.id);
        const group = buildLabel(doc, node, data, this.#config);
        group.style.pointerEvents = 'none';
        next.appendChild(group);
        labels.set(node.id, group);
        measured.push({ node, data, group, width: measureDimension(group, 'width'), height: measureDimension(group, 'height') });
      }
      const layout = this.#config.placement === 'around'
        ? placeLabels(measured, this.#viewport(), this.#config, snapshot.nodes, snapshot.rootId, input.selectedId, priorityIds)
        : placeLabelsLegacy(measured, this.#viewport(), this.#config);
      const anchors = new Map();
      const visible = new Set(layout.visible.keys());
      const displayed = new Map();
      for (const item of measured) {
        let rect = layout.visible.get(item.node.id);
        // Entering labels start at opacity 0 but keep a stable anchor during the
        // transition instead of popping into a different candidate set at end.
        if (!rect && item.node.opacity === 0) {
          const fallback = {
            left: item.node.center.x + item.node.radius + this.#config.gap,
            top: item.node.center.y - item.height / 2
          };
          rect = fallback;
          visible.add(item.node.id);
        }
        if (!rect) { item.group.style.display = 'none'; continue; }
        anchors.set(item.node.id, { dx: rect.left - item.node.center.x, dy: rect.top - item.node.center.y });
        displayed.set(item.node.id, { left: rect.left, top: rect.top, right: rect.left + item.width, bottom: rect.top + item.height });
        item.group.style.left = `${rect.left}px`;
        item.group.style.top = `${rect.top}px`;
        item.group.style.visibility = 'visible';
        item.group.style.display = 'flex';
        item.group.style.opacity = String(item.node.opacity);
      }
      next.style.visibility = 'visible';
      syncSelectedState(labels, input.selectedId);
      const selectedItem = input.selectedId ? measured.find((item) => item.node.id === input.selectedId) : null;
      if (selectedItem) addSelectedLeader(next, selectedItem.node, displayed.get(selectedItem.node.id), this.#config, effectiveNodeOpacity(selectedItem.node));
      const old = this.#element;
      removeElement(old);
      this.#element = next;
      this.#labels = labels;
      const rootInfo = { rootProtection: Boolean(layout.rootProtection), rootProtectionRect: layout.rootProtectionRect || null, rootLabelVisible: Boolean(layout.rootLabelVisible) };
      this.#transition = { labels, anchors, visible, element: next, priorityIds, rootId: snapshot.rootId, selectedId: input.selectedId, rootInfo };
      this.#metrics = transitionMetrics(allCandidates.length, measured, displayed, priorityIds, this.#viewport(), snapshot.nodes, rootInfo, input.selectedId, { eligibleCount: candidates.length, ineligibleCount: allCandidates.length - candidates.length, budgetExcludedCount: Math.max(0, candidates.length - selected.length) });
      return this.getMetrics();
    } catch (error) {
      throw error;
    }
  }

  /** Update stable plan positions/opacity without replacing the overlay. */
  updateTransition(input) {
    this.#assertAlive();
    if (!this.#transition) return this.beginTransition(input);
    const effectiveRootId = input.rootId !== undefined ? input.rootId : this.#transition.rootId;
    const effectiveSelectedId = input.selectedId !== undefined ? input.selectedId : this.#transition.selectedId;
    const { snapshot, records } = validateAndSnapshot(input.scene, input.presentation, this.#config.labelPalette, effectiveRootId);
    const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
    clearSelectedLeaders(this.#transition.element);
    syncSelectedState(this.#transition.labels, effectiveSelectedId);
    this.#transition.rootId = effectiveRootId;
    this.#transition.selectedId = effectiveSelectedId;
    for (const group of this.#transition.labels.values()) setLinkInert(group, true);
    const displayed = new Map();
    for (const [id, group] of this.#transition.labels) {
      const node = nodes.get(id);
      if (!node || !this.#transition.visible.has(id) || !isNodeViewportEligible(node, this.#viewport(), this.#config)) { group.style.display = 'none'; continue; }
      const anchor = this.#transition.anchors.get(id);
      const size = { width: measureDimension(group, 'width'), height: measureDimension(group, 'height') };
      displayed.set(id, { left: node.center.x + anchor.dx, top: node.center.y + anchor.dy, right: node.center.x + anchor.dx + size.width, bottom: node.center.y + anchor.dy + size.height });
      group.style.left = `${node.center.x + anchor.dx}px`;
      group.style.top = `${node.center.y + anchor.dy}px`;
      group.style.display = 'flex';
      group.style.visibility = 'visible';
      group.style.opacity = String(node.opacity);
    }
    const selectedNode = effectiveSelectedId ? nodes.get(effectiveSelectedId) : null;
    if (selectedNode) addSelectedLeader(this.#transition.element, selectedNode, displayed.get(effectiveSelectedId), this.#config, effectiveNodeOpacity(selectedNode));
    const measured = [...this.#transition.labels]
      .map(([id, group]) => ({ node: nodes.get(id), data: records.get(id), group, width: measureDimension(group, 'width'), height: measureDimension(group, 'height') }))
      .filter((item) => item.node);
    this.#metrics = transitionMetrics(this.#transition.labels.size, measured, displayed, this.#transition.priorityIds, this.#viewport(), snapshot.nodes, this.#transition.rootInfo, effectiveSelectedId);
    return this.getMetrics();
  }

﻿  /** Hand off to the exact target plan while retaining groups by stable ID. */
  completeTransition(input) {
    this.#assertAlive();
    if (!this.#transition) return this.update(input);
    const effectiveRootId = input.rootId !== undefined ? input.rootId : this.#transition.rootId;
    const effectiveSelectedId = input.selectedId !== undefined ? input.selectedId : this.#transition.selectedId;
    const { snapshot, records } = validateAndSnapshot(input.scene, input.presentation, this.#config.labelPalette, effectiveRootId);
    const priorityIds = normalizePriorityIds(input.priorityIds);
    const allCandidates = orderCandidates(snapshot, priorityIds, effectiveSelectedId);
    const candidates = allCandidates.filter((node) => isNodeViewportEligible(node, this.#viewport(), this.#config));
    const selected = candidates.slice(0, this.#config.maxLabels);
    const doc = this.#host.ownerDocument;
    const labels = new Map();
    const measured = [];
    for (const id of selected.map((node) => node.id)) {
      const node = snapshot.nodes.find((item) => item.id === id);
      const data = records.get(id);
      let group = this.#transition.labels.get(id);
      if (group && Boolean(group.__vdLink) !== Boolean(data.link)) {
        removeElement(group);
        group = buildLabel(doc, node, data, this.#config);
        this.#transition.element.appendChild(group);
      } else if (!group) {
        group = buildLabel(doc, node, data, this.#config);
        this.#transition.element.appendChild(group);
      } else {
        syncLabelData(group, data);
      }
      labels.set(id, group);
      measured.push({ node, data, group, width: measureDimension(group, 'width'), height: measureDimension(group, 'height') });
    }
    for (const [id, group] of this.#transition.labels) if (!labels.has(id)) removeElement(group);
    const layout = this.#config.placement === 'around'
      ? placeLabels(measured, this.#viewport(), this.#config, snapshot.nodes, snapshot.rootId, effectiveSelectedId, priorityIds)
      : placeLabelsLegacy(measured, this.#viewport(), this.#config);
    const retainedVisible = new Set([...this.#transition.visible].filter((id) => labels.has(id)));
    const displayed = new Map();
    for (const item of measured) {
      let rect = layout.visible.get(item.node.id);
      // A label already visible during motion must not blink out at handoff, but
      // the fallback must obey the same root/collision policy as final placement.
      if (!rect && retainedVisible.has(item.node.id)) {
        const anchor = this.#transition.anchors.get(item.node.id);
        if (anchor) {
          const candidate = { left: item.node.center.x + anchor.dx, top: item.node.center.y + anchor.dy, right: item.node.center.x + anchor.dx + item.width, bottom: item.node.center.y + anchor.dy + item.height };
          if (transitionFallbackAllowed(candidate, {
            rootProtectionRect: layout.rootProtectionRect || null,
            layoutVisible: layout.visible,
            displayed,
            nodes: snapshot.nodes,
            ownerId: item.node.id,
            node: item.node,
            viewport: this.#viewport(),
            config: this.#config
          })) rect = candidate;
        }
      }
      if (!rect) { item.group.style.display = 'none'; continue; }
      displayed.set(item.node.id, { left: rect.left, top: rect.top, right: rect.left + item.width, bottom: rect.top + item.height });
      item.group.style.left = `${rect.left}px`;
      item.group.style.top = `${rect.top}px`;
      item.group.style.visibility = 'visible';
      item.group.style.display = 'flex';
      item.group.style.opacity = String(item.node.opacity === undefined ? 1 : item.node.opacity);
    }
    for (const item of measured) {
      const visible = displayed.has(item.node.id) && (item.node.opacity ?? 1) > 0;
      item.group.style.pointerEvents = visible && item.node.kind === 'file' ? 'auto' : 'none';
      const live = this.#config.linkActivation === 'immediate' && visible;
      setLinkInert(item.group, !live);
    }
    clearSelectedLeaders(this.#transition.element);
    syncSelectedState(labels, effectiveSelectedId);
    const selectedItem = effectiveSelectedId ? measured.find((item) => item.node.id === effectiveSelectedId) : null;
    if (selectedItem) addSelectedLeader(this.#transition.element, selectedItem.node, displayed.get(selectedItem.node.id), this.#config, effectiveNodeOpacity(selectedItem.node));
    this.#transition.element.style.visibility = 'visible';
    this.#labels = labels;
    const rootInfo = { rootProtection: Boolean(layout.rootProtection), rootProtectionRect: layout.rootProtectionRect || null, rootLabelVisible: Boolean(layout.rootLabelVisible) };
    this.#metrics = transitionMetrics(allCandidates.length, measured, displayed, priorityIds, this.#viewport(), snapshot.nodes, rootInfo, effectiveSelectedId, { eligibleCount: candidates.length, ineligibleCount: allCandidates.length - candidates.length, budgetExcludedCount: Math.max(0, candidates.length - selected.length) });
    this.#transition = null;
    if (this.#config.linkActivation === 'immediate') this.activateLinks();
    return this.getMetrics();
  }

  cancelTransition() {
    this.#assertAlive();
    if (!this.#transition) return false;
    removeElement(this.#transition.element);
    const fresh = createOverlayElement(this.#host.ownerDocument);
    this.#host.appendChild(fresh);
    this.#element = fresh;
    this.#labels = new Map();
    this.#metrics = emptyMetrics();
    this.#transition = null;
    return true;
  }

  activateLinks() {
    this.#assertAlive();
    for (const group of this.#labels.values()) {
      const eligible = Boolean(group.__vdLinkHref)
        && group.style.display !== 'none'
        && group.style.visibility !== 'hidden'
        && Number(group.style.opacity ?? 1) > 0;
      setLinkInert(group, !eligible);
    }
    return true;
  }

  deactivateLinks() {
    if (this.#destroyed) return false;
    for (const group of this.#labels.values()) setLinkInert(group, true);
    if (this.#transition) for (const group of this.#transition.labels.values()) setLinkInert(group, true);
    return true;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#transition = null;
    if (this.#element && this.#element.parentNode) this.#element.parentNode.removeChild(this.#element);
    this.#host = null;
    this.#element = null;
    this.#labels.clear();
  }
  #viewport() {
    const width = Number(this.#host.clientWidth) || 0;
    const height = Number(this.#host.clientHeight) || 0;
    return { width: Math.max(0, width), height: Math.max(0, height) };
  }

  #assertAlive() {
    if (this.#destroyed) throw new GraphRenderError('invalid-lifecycle', 'label overlay has been destroyed');
  }
}

function normalizeLabelOptions(options) {
  const config = { ...DEFAULT_LABEL_OPTIONS, ...(options || {}) };
  if (!Number.isInteger(config.maxLabels) || config.maxLabels < 1
      || config.maxLabels > LABEL_LIMITS.maxVisibleBudget) {
    throw new GraphRenderError('invalid-presentation', `maxLabels must be an integer 1..${LABEL_LIMITS.maxVisibleBudget}`);
  }
  for (const key of ['maxWidth', 'gap', 'padding', 'overlapPadding', 'rootProtectionPadding']) {
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < 0) {
      throw new GraphRenderError('invalid-presentation', `${key} must be finite and >= 0`);
    }
  }
  if (config.maxWidth <= 0) throw new GraphRenderError('invalid-presentation', 'maxWidth must be > 0');
  if (config.placement !== 'legacy' && config.placement !== 'around') {
    throw new GraphRenderError('invalid-presentation', 'placement must be legacy or around');
  }
  if (config.linkActivation !== 'immediate' && config.linkActivation !== 'deferred') {
    throw new GraphRenderError('invalid-presentation', 'linkActivation must be immediate or deferred');
  }
  return Object.freeze(config);
}

function validateAndSnapshot(scene, presentation, labelPalette = null, rootIdOverride = null) {
  if (!scene || !(scene.nodes instanceof Map)) {
    throw new GraphRenderError('invalid-presentation', 'prepared scene with node Map is required');
  }
  if (!(presentation instanceof Map)) {
    throw new GraphRenderError('invalid-presentation', 'presentation Map is required');
  }
  if ('rootId' in scene && scene.rootId !== undefined && typeof scene.rootId !== 'string') {
    throw new GraphRenderError('invalid-presentation', 'scene rootId must be a string when present');
  }
  if (rootIdOverride !== null && rootIdOverride !== undefined && typeof rootIdOverride !== 'string') {
    throw new GraphRenderError('invalid-presentation', 'rootId must be a string when present');
  }

  const nodes = [];
  const records = new Map();
  for (const [id, node] of scene.nodes) {
    if (typeof id !== 'string' || !node || node.id !== id) {
      throw new GraphRenderError('invalid-presentation', 'node id must be a string matching its record', id);
    }
    if (node.kind !== 'folder' && node.kind !== 'file') {
      throw new GraphRenderError('invalid-presentation', 'node kind is unsupported', id);
    }
    if (typeof node.visible !== 'boolean') {
      throw new GraphRenderError('invalid-presentation', 'node visibility must be boolean', id);
    }
    if (!Number.isSafeInteger(node.depth) || node.depth < 0) {
      throw new GraphRenderError('invalid-presentation', 'node depth must be a nonnegative safe integer', id);
    }
    if (!node.center || typeof node.center !== 'object'
        || !Number.isFinite(node.center.x) || !Number.isFinite(node.center.y)) {
      throw new GraphRenderError('invalid-presentation', 'node center must be finite', id);
    }
    if (typeof node.radius !== 'number' || !Number.isFinite(node.radius) || node.radius < 0) {
      throw new GraphRenderError('invalid-presentation', 'node radius must be finite and nonnegative', id);
    }
    const data = presentation.get(id);
    if (!data || typeof data !== 'object') {
      throw new GraphRenderError('invalid-presentation', 'presentation entry is missing', id);
    }
    if (typeof data.name !== 'string' || data.name.length === 0) {
      throw new GraphRenderError('invalid-presentation', 'display name must be non-empty', id);
    }
    if (data.kind !== node.kind) {
      throw new GraphRenderError('invalid-presentation', 'presentation kind must match scene node', id);
    }
    const opacity = node.opacity === undefined ? 1 : node.opacity;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new GraphRenderError('invalid-presentation', 'node opacity must be 0..1', id);
    }
    const labelPresentation = classifyLabelPresentation({ kind: node.kind, name: data.name, typeHint: data.typeHint, dataType: data.dataType, classification: data.classification }, { palette: labelPalette });
    nodes.push(Object.freeze({
      id,
      kind: node.kind,
      visible: node.visible,
      depth: node.depth,
      center: Object.freeze({ x: node.center.x, y: node.center.y }),
      radius: node.radius,
      opacity
    }));
    records.set(id, Object.freeze({ name: data.name, kind: node.kind, icon: labelPresentation.icon, badge: labelPresentation.badge, color: labelPresentation.color, badgeColor: labelPresentation.badgeColor, needsReview: labelPresentation.needsReview, reason: labelPresentation.reason }));
    const typedWebLink = node.kind === 'file' && data.dataType === 'web-link';
    const checkedLink = typedWebLink ? validateWebLink(typeof data.link === 'string' ? data.link : null) : { ok: false, value: null };
    const link = checkedLink.ok ? checkedLink.value : null;
    records.set(id, Object.freeze({ name: data.name, kind: node.kind, icon: labelPresentation.icon, badge: labelPresentation.badge, color: labelPresentation.color, badgeColor: labelPresentation.badgeColor, needsReview: labelPresentation.needsReview, reason: labelPresentation.reason, dataType: data.dataType ?? null, link, linkInvalid: typedWebLink && !link }));
  }

  return {
    snapshot: Object.freeze({
      rootId: typeof scene.rootId === 'string' ? scene.rootId : (typeof rootIdOverride === 'string' ? rootIdOverride : null),
      nodes: Object.freeze(nodes)
    }),
    records
  };
}
function isNodeViewportEligible(node, viewport, _config) {
  if (!node || node.visible !== true) return false;
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) return false;
  const radius = Number.isFinite(node.radius) && node.radius > 0 ? node.radius : 0;
  const left = node.center.x - radius;
  const right = node.center.x + radius;
  const top = node.center.y - radius;
  const bottom = node.center.y + radius;
  // Keep a candidate when any projected glyph pixel can be visible. Final
  // measured placement enforces viewport padding and label collisions.
  return right > 0 && left < viewport.width && bottom > 0 && top < viewport.height;
}
function orderCandidates(snapshot, priorityIds = [], selectedId = null) {
  const rootId = snapshot.rootId;
  const rank = new Map(priorityIds.map((id, index) => [id, index]));
  const rankFor = (id) => rank.has(id) ? rank.get(id) : (id === selectedId ? priorityIds.length : Infinity);
  const indexed = snapshot.nodes.map((node, index) => ({ node, index }));
  return indexed
    .filter(({ node }) => node.visible === true)
    .sort((a, b) => {
      const aPriority = rankFor(a.node.id);
      const bPriority = rankFor(b.node.id);
      const aRoot = a.node.id === rootId ? 0 : 1;
      const bRoot = b.node.id === rootId ? 0 : 1;
      return (aRoot - bRoot) || (aPriority - bPriority) || (a.node.depth - b.node.depth) || (a.index - b.index);
    })
    .map(({ node }) => node);
}

function normalizePriorityIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    throw new GraphRenderError('invalid-presentation', 'priorityIds must be an array of strings');
  }
  return [...new Set(value)];
}

function visibleCountFor(visible, ids) {
  return ids.reduce((count, id) => count + (visible.has(id) ? 1 : 0), 0);
}
function createOverlayElement(doc) {
  const element = doc.createElement('div');
  element.setAttribute('data-vd-labels', '');
  element.style.position = 'absolute';
  element.style.left = '0';
  element.style.top = '0';
  element.style.width = '100%';
  element.style.height = '100%';
  element.style.overflow = 'hidden';
  element.style.pointerEvents = 'none';
  element.style.zIndex = '2';
  return element;
}

function badgeFor(data) {
  if (data.badge) return String(data.badge).slice(0, 8);
  if (data.kind !== 'file') return null;
  const extension = extensionOf(data.name);
  return extension ? extension.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'FILE' : 'FILE';
}
function buildLabel(doc, node, data, config) {
  const group = doc.createElement('div');
  group.setAttribute('data-vd-label-id', node.id);
  group.style.position = 'absolute';
  group.style.display = 'flex';
  group.style.alignItems = 'center';
  group.style.gap = '3px';
  group.style.maxWidth = `${config.maxWidth}px`;
  group.style.pointerEvents = node.kind === 'file' ? 'auto' : 'none';
  group.style.cursor = node.kind === 'file' ? 'pointer' : 'default';
  group.style.whiteSpace = 'nowrap';
  group.style.color = node.kind === 'folder'
    ? 'var(--fo-folder-label, #c7d2fe)'
    : (data.icon === 'pdf' ? (data.color || '#F87171') : 'var(--fo-label-text, #c3ccda)');
  group.style.font = '11px/1.2 system-ui, sans-serif';
  group.style.textShadow = 'var(--fo-label-shadow, 0 1px 2px #000)';
  group.style.visibility = 'hidden';
  group.style.opacity = String(node.opacity);
  const labelBadge = badgeFor(data);
  const accessible = labelBadge ? data.name + ' [' + labelBadge + ']' + (data.needsReview ? ' (format needs review)' : '') : data.name;
  group.setAttribute('aria-label', accessible);
  group.setAttribute('title', accessible);
  if (data.needsReview) group.setAttribute('data-vd-review', 'true');

  const text = doc.createElement(data.link ? 'a' : 'span');
  text.style.overflow = 'hidden';
  text.style.textOverflow = 'ellipsis';
  text.style.whiteSpace = 'nowrap';
  text.style.maxWidth = String(Math.max(1, config.maxWidth)) + 'px';
  text.setAttribute('data-vd-name', '');
  text.textContent = data.name;
  if (data.link) {
    text.setAttribute('data-vd-link', '');
    text.setAttribute('target', '_blank');
    text.setAttribute('rel', 'noopener noreferrer');
    text.setAttribute('role', 'link');
    text.setAttribute('aria-label', data.name + ' — ' + data.link + ' (opens in a new tab)');
    text.setAttribute('title', data.name + ' — ' + data.link);
    text.style.color = 'var(--fo-link, #93c5fd)';
    text.style.textDecoration = 'underline';
    text.style.textUnderlineOffset = '2px';
    text.style.pointerEvents = 'auto';
    text.style.cursor = 'pointer';
    group.__vdLink = text;
    group.__vdLinkHref = data.link;
    text.addEventListener?.('pointerdown', (event) => event.stopPropagation());
    text.addEventListener?.('click', (event) => event.stopPropagation());
    setLinkInert(group, true);
  }
  group.appendChild(text);
  group.__vdNameText = text;
  if (labelBadge) {
    const badge = doc.createElement('span');
    badge.setAttribute('data-vd-badge', labelBadge);
    badge.style.flex = '0 0 auto';
    badge.style.fontSize = '9px';
    badge.style.opacity = '0.85';
    badge.style.color = data.badgeColor || '#c3ccda';
    badge.style.border = '1px solid currentColor';
    badge.style.borderRadius = '3px';
    badge.style.padding = '0 2px';
    badge.textContent = labelBadge;
    group.appendChild(badge);
  group.__vdBadge = badge;
  }
  return group;
}

function syncLabelData(group, data) {
  const nameText = group.__vdNameText;
  if (data.icon === 'pdf') group.style.color = data.color || '#F87171';
  if (nameText && nameText.textContent !== data.name) nameText.textContent = data.name;
  const labelBadge = badgeFor(data);
  const badge = group.__vdBadge;
  if (badge && labelBadge && badge.textContent !== labelBadge) badge.textContent = labelBadge;
  if (badge && data.badgeColor) badge.style.color = data.badgeColor;
  if (group.hasAttribute?.('data-vd-review') !== data.needsReview) {
    if (data.needsReview) group.setAttribute('data-vd-review', 'true'); else group.removeAttribute?.('data-vd-review');
  }
  const accessible = labelBadge ? data.name + ' [' + labelBadge + ']' + (data.needsReview ? ' (format needs review)' : '') : data.name;
  group.setAttribute('aria-label', accessible);
  group.setAttribute('title', accessible);
  const anchor = group.__vdLink;
  if (!anchor) return;
  group.__vdLinkHref = data.link || null;
  if (!data.link) {
    setLinkInert(group, true);
    anchor.setAttribute('aria-label', data.name);
    anchor.setAttribute('title', data.name);
    return;
  }
  setLinkInert(group, true);
  anchor.setAttribute('aria-label', data.name + ' — ' + data.link + ' (opens in a new tab)');
  anchor.setAttribute('title', data.name + ' — ' + data.link);
}

function setLinkInert(group, inert) {
  const anchor = group.__vdLink;
  if (!anchor) return;
  group.__vdLinkInert = inert;
  if (inert) {
    anchor.removeAttribute?.('href');
    anchor.setAttribute('aria-disabled', 'true');
    anchor.tabIndex = -1;
    anchor.style.pointerEvents = 'none';
    anchor.style.cursor = 'default';
  } else {
    anchor.setAttribute('href', group.__vdLinkHref);
    anchor.removeAttribute?.('aria-disabled');
    anchor.tabIndex = 0;
    anchor.style.pointerEvents = 'auto';
    anchor.style.cursor = 'pointer';
  }
}

function removeElement(element) {
  if (element && element.parentNode && typeof element.parentNode.removeChild === 'function') {
    element.parentNode.removeChild(element);
  }
}

function measureDimension(element, axis) {
  let value;
  if (typeof element.getBoundingClientRect === 'function') {
    const rect = element.getBoundingClientRect();
    if (rect && typeof rect[axis] === 'number') value = rect[axis];
  }
  if (value === undefined) {
    value = axis === 'width' ? element.offsetWidth : element.offsetHeight;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GraphRenderError('invalid-measurement', `label ${axis} must be finite and nonnegative`);
  }
  return value;
}
function placeLabelsLegacy(measured, viewport, config) {
  const visible = new Map();
  const occupied = [];
  const padding = config.padding;
  let overlapSuppressed = 0;
  let viewportSuppressed = 0;
  let unmeasurable = 0;
  let placementAttempts = 0;
  for (const item of measured) {
    const { node, width, height } = item;
    if (width === 0 || height === 0) { unmeasurable += 1; continue; }
    if (viewport.width <= 0 || viewport.height <= 0
        || width + padding * 2 > viewport.width || height + padding * 2 > viewport.height) {
      viewportSuppressed += 1; continue;
    }
    placementAttempts += 1;
    let left = node.center.x + node.radius + config.gap;
    if (left + width > viewport.width - padding) left = node.center.x - node.radius - config.gap - width;
    left = Math.max(padding, Math.min(left, viewport.width - padding - width));
    let top = node.center.y - height / 2;
    top = Math.max(padding, Math.min(top, viewport.height - padding - height));
    const rect = { left, top, right: left + width, bottom: top + height };
    if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
        || left < padding || top < padding
        || left + width > viewport.width - padding || top + height > viewport.height - padding) {
      viewportSuppressed += 1; continue;
    }
    if (occupied.some((other) => !(rect.right + config.overlapPadding <= other.left
        || rect.left >= other.right + config.overlapPadding
        || rect.bottom + config.overlapPadding <= other.top
        || rect.top >= other.bottom + config.overlapPadding))) {
      overlapSuppressed += 1; continue;
    }
    occupied.push(rect);
    visible.set(node.id, rect);
  }
  return { visible, overlapSuppressed, viewportSuppressed, nodeObstacleSuppressed: 0, unmeasurable, placementAttempts, rootProtection: false, rootLabelVisible: false };
}
function placeLabels(measured, viewport, config, nodes, rootId = null, selectedId = null, priorityIds = []) {
  const prioritySet = new Set(priorityIds);
  const visible = new Map();
  const occupied = [];
  const padding = config.padding;
  const obstacles = nodes.filter((node) => node.visible && node.radius > 0);
  let overlapSuppressed = 0;
  let viewportSuppressed = 0;
  let nodeObstacleSuppressed = 0;
  let unmeasurable = 0;
  let placementAttempts = 0;
  let rootProtection = null;
  let rootLabelVisible = false;
  let selectedOffset = 0;
  const rootItem = rootId ? measured.find((item) => item.node.id === rootId) : null;
  const ordered = rootItem ? [rootItem, ...measured.filter((item) => item !== rootItem)] : measured;
  for (const item of ordered) {
    const isRoot = rootId !== null && item.node.id === rootId;
    const isSelected = selectedId !== null && item.node.id === selectedId;
    const isPriority = prioritySet.has(item.node.id);
    const { node, width, height } = item;
    if (width === 0 || height === 0) {
      unmeasurable += 1;
      continue;
    }
    if (viewport.width <= 0 || viewport.height <= 0
        || width + padding * 2 > viewport.width || height + padding * 2 > viewport.height) {
      viewportSuppressed += 1;
      continue;
    }
    const placements = [
      { name: 'right', left: node.center.x + node.radius + config.gap, top: node.center.y - height / 2 },
      { name: 'left', left: node.center.x - node.radius - config.gap - width, top: node.center.y - height / 2 },
      { name: 'above', left: node.center.x - width / 2, top: node.center.y - node.radius - config.gap - height },
      { name: 'below', left: node.center.x - width / 2, top: node.center.y + node.radius + config.gap }
    ];
    let selected = null;
    let viewportFailed = false;
    let overlapFailed = false;
    let nodeFailed = false;
    const failureFor = (rect) => {
      if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
          || rect.left < padding || rect.top < padding
          || rect.right > viewport.width - padding || rect.bottom > viewport.height - padding) {
        return 'viewport';
      }
      if (occupied.some((other) => rectsOverlapWithPadding(rect, other, config.overlapPadding))) {
        return 'overlap';
      }
      if (rootProtection && !isRoot && rectsOverlap(rect, rootProtection)) {
        return 'overlap';
      }
      if (!isRoot && obstacles.some((other) => other.id !== node.id && glyphIntersectsRect(other, rect))) {
        return 'node';
      }
      return null;
    };
    for (const placement of placements) {
      placementAttempts += 1;
      const rect = {
        left: placement.left,
        top: placement.top,
        right: placement.left + width,
        bottom: placement.top + height
      };
      const failure = failureFor(rect);
      if (failure === 'viewport') { viewportFailed = true; continue; }
      if (failure === 'overlap') { overlapFailed = true; continue; }
      if (failure === 'node') { nodeFailed = true; continue; }
      selected = rect;
      break;
    }
    // A selected label is promoted in orderCandidates, so lower-priority labels
    // are placed later and yield to it. Every fallback candidate still obeys all
    // collision rules; never allow the fallback to duplicate another label.
    if (!selected && (isSelected || isPriority) && !isRoot) {
      const offsets = isSelected ? [0, 16, 32, 48, 64, 80, 96, 128, 160, 192, 224, 256, 320] : [0, 16, 32, 48, 64, 80, 96];
      for (const offset of offsets) {
        for (const placement of placements) {
          const dx = placement.name === 'right' ? offset : placement.name === 'left' ? -offset : 0;
          const dy = placement.name === 'below' ? offset : placement.name === 'above' ? -offset : 0;
          const rect = { left: placement.left + dx, top: placement.top + dy, right: placement.left + dx + width, bottom: placement.top + dy + height };
          const failure = failureFor(rect);
          if (failure === 'viewport') { viewportFailed = true; continue; }
          if (failure === 'overlap') { overlapFailed = true; continue; }
          if (failure === 'node') { nodeFailed = true; continue; }
          selected = rect;
          selectedOffset = offset;
          break;
        }
        if (selected) break;
      }
    }
    if (!selected) {
      if (nodeFailed) nodeObstacleSuppressed += 1;
      else if (overlapFailed) overlapSuppressed += 1;
      else if (viewportFailed) viewportSuppressed += 1;
      continue;
    }
    occupied.push(selected);
    visible.set(node.id, selected);
    if (isRoot) {
      let nearest = Infinity;
      for (const other of nodes) {
        if (!other.visible || other.id === node.id || other.radius <= 0) continue;
        nearest = Math.min(nearest, Math.hypot(other.center.x - node.center.x, other.center.y - node.center.y));
      }
      const haloRadius = Number.isFinite(nearest) ? Math.max(node.radius, Math.min(nearest - config.gap, 96)) : node.radius;
      const marker = { left: node.center.x - haloRadius, top: node.center.y - haloRadius, right: node.center.x + haloRadius, bottom: node.center.y + haloRadius };
      rootProtection = inflateUnion(marker, selected, config.rootProtectionPadding);
      occupied.push(rootProtection);
      rootLabelVisible = true;
    }
  }
  return { visible, overlapSuppressed, viewportSuppressed, nodeObstacleSuppressed, unmeasurable, placementAttempts, selectedOffset, rootProtection: Boolean(rootProtection), rootProtectionRect: rootProtection, rootLabelVisible };
}

function rectsOverlapWithPadding(a, b, padding) {
  return !(a.right + padding <= b.left || a.left >= b.right + padding
    || a.bottom + padding <= b.top || a.top >= b.bottom + padding);
}
function rectsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}
function inflateUnion(a, b, padding) {
  return {
    left: Math.min(a.left, b.left) - padding,
    top: Math.min(a.top, b.top) - padding,
    right: Math.max(a.right, b.right) + padding,
    bottom: Math.max(a.bottom, b.bottom) + padding
  };
}
function glyphIntersectsRect(node, rect) {
  const left = node.center.x - node.radius;
  const top = node.center.y - node.radius;
  const right = node.center.x + node.radius;
  const bottom = node.center.y + node.radius;
  return !(rect.right <= left || rect.left >= right || rect.bottom <= top || rect.top >= bottom);
}function emptyMetrics() {
  return {
    candidateCount: 0,
    createdCount: 0,
    visibleCount: 0,
    invalidWebLinkCount: 0,
    suppressedCount: 0,
    overlapSuppressedCount: 0,
    viewportSuppressedCount: 0,
    nodeObstacleSuppressedCount: 0,
    labelNodeOverlapCount: 0,
    placementAttempts: 0,
    labelNodeOverlapDefinition: 'visible label-node pairs; owner node excluded; exact circle/diamond intersection',
    placementObstaclePolicy: 'conservative glyph bounds',
    priorityVisibleCount: 0,
    prioritySuppressedCount: 0,
    unmeasurableCount: 0,
    measuredCount: 0,
    visibleIconCount: 0,
    leadingIconCount: 0,
    selectedLabelVisible: null,
    selectedLabelOpacity: null,
    rootProtection: false,
    rootProtectionRect: null,
    rootLabelVisible: false,
    textMismatchCount: 0,
    measurement: 'getBoundingClientRect/offsetWidth',
    dprIndependent: true,
    viewport: { width: 0, height: 0 }
  };
}
export function countLabelNodeOverlaps(visible, nodes) {
  let count = 0;
  for (const [labelId, rect] of visible) {
    for (const node of nodes) {
      if (!node.visible || node.id === labelId) continue;
      if (rectIntersectsGlyph(node, rect)) count += 1;
    }
  }
  return count;
}

function rectIntersectsGlyph(node, rect) {
  if (node.kind === 'folder') {
    const closestX = Math.max(rect.left, Math.min(node.center.x, rect.right));
    const closestY = Math.max(rect.top, Math.min(node.center.y, rect.bottom));
    return Math.hypot(closestX - node.center.x, closestY - node.center.y) < node.radius;
  }
  return rectIntersectsDiamond(rect, node);
}

function rectIntersectsDiamond(rect, node) {
  const points = [
    { x: node.center.x, y: node.center.y - node.radius },
    { x: node.center.x + node.radius, y: node.center.y },
    { x: node.center.x, y: node.center.y + node.radius },
    { x: node.center.x - node.radius, y: node.center.y }
  ];
  const rectPoints = [
    { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }
  ];
  const axes = [
    { x: 1, y: 0 }, { x: 0, y: 1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }
  ];
  for (const axis of axes) {
    const length = Math.hypot(axis.x, axis.y);
    const a = { x: axis.x / length, y: axis.y / length };
    const p1 = projectPoints(points, a);
    const p2 = projectPoints(rectPoints, a);
    if (p1.max <= p2.min || p2.max <= p1.min) return false;
  }
  return true;
}

function projectPoints(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}
function syncSelectedState(groups, selectedId) {
  for (const [id, group] of groups) {
    if (selectedId && id === selectedId) group.setAttribute('data-vd-selected', 'true');
    else group.removeAttribute?.('data-vd-selected');
  }
}
﻿function transitionFallbackAllowed(rect, { rootProtectionRect, layoutVisible, displayed, nodes, ownerId, node, viewport, config }) {
  if (!node || !isNodeViewportEligible(node, viewport, config)) return false;
  if (rect.left < config.padding || rect.top < config.padding || rect.right > viewport.width - config.padding || rect.bottom > viewport.height - config.padding) return false;
  if (rootProtectionRect && rectsOverlap(rect, rootProtectionRect)) return false;
  for (const [id, other] of layoutVisible) {
    if (id !== ownerId && rectsOverlapWithPadding(rect, other, config.overlapPadding)) return false;
  }
  for (const [id, other] of displayed) {
    if (id !== ownerId && rectsOverlapWithPadding(rect, other, config.overlapPadding)) return false;
  }
  for (const node of nodes) {
    if (node.id !== ownerId && glyphIntersectsRect(node, rect)) return false;
  }
  return true;
}
function containerChildren(container) {
  const children = container?.children;
  if (!children) return [];
  if (Array.isArray(children)) return [...children];
  if (typeof children[Symbol.iterator] === 'function') return [...children];
  if (typeof children.length === 'number') {
    const result = [];
    for (let index = 0; index < children.length; index += 1) {
      if (children[index]) result.push(children[index]);
    }
    return result;
  }
  return [];
}
function clearSelectedLeaders(container) {
  for (const child of containerChildren(container)) {
    if (child?.getAttribute?.('data-vd-selected-leader') === '') removeElement(child);
  }
}
function effectiveNodeOpacity(node) {
  const opacity = node?.opacity;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return 1;
  return Math.max(0, Math.min(1, opacity));
}
function addSelectedLeader(container, node, rect, config, opacity = 1) {
  if (!container) return null;
  clearSelectedLeaders(container);
  const effectiveOpacity = typeof opacity === 'number' && Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  if (!node || !rect || effectiveOpacity <= 0) return null;
  const x = Math.max(rect.left, Math.min(node.center.x, rect.right));
  const y = Math.max(rect.top, Math.min(node.center.y, rect.bottom));
  const dx = x - node.center.x;
  const dy = y - node.center.y;
  const length = Math.hypot(dx, dy);
  if (!(length > node.radius + config.gap + 8)) return null;
  const line = container.ownerDocument.createElement('span');
  line.setAttribute('data-vd-selected-leader', '');
  line.style.position = 'absolute';
  line.style.left = node.center.x + 'px';
  line.style.top = node.center.y + 'px';
  line.style.width = length + 'px';
  line.style.height = '1px';
  line.style.background = 'var(--fo-selection, #818cf8)';
  line.style.opacity = String(0.7 * effectiveOpacity);
  line.style.transformOrigin = '0 0';
  line.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
  line.style.pointerEvents = 'none';
  line.style.zIndex = '1';
  container.appendChild(line);
  return line;
}

function transitionMetrics(candidateCount, measured, displayed, priorityIds, viewport, sceneNodes, rootInfo = null, selectedId = null, eligibility = null) {
  const visibleCount = displayed.size;
  const labelNodeOverlapCount = countLabelNodeOverlaps(displayed, sceneNodes);
  let textMismatchCount = 0;
  for (const item of measured) if ((item.group.__vdNameText?.textContent ?? item.group.textContent) !== item.data.name) textMismatchCount += 1;
  return {
    candidateCount,
    viewportEligibleCount: eligibility?.eligibleCount ?? null,
    viewportIneligibleCount: eligibility?.ineligibleCount ?? null,
    budgetExcludedCount: eligibility?.budgetExcludedCount ?? null,
    createdCount: measured.length,
    visibleCount,
    invalidWebLinkCount: measured.filter((item) => item.data?.linkInvalid).length,
    suppressedCount: measured.length - visibleCount,
    overlapSuppressedCount: null,
    viewportSuppressedCount: null,
    nodeObstacleSuppressedCount: null,
    suppressionMeasurement: 'fixed-transition-policy',
    labelNodeOverlapCount,
    labelNodeOverlapMeasurement: 'measured-visible-label-rectangles',
    placementAttempts: measured.length,
    labelNodeOverlapDefinition: 'visible label-node pairs; owner node excluded; exact circle/diamond intersection',
    placementObstaclePolicy: 'fixed transition placement',
    priorityVisibleCount: visibleCountFor(displayed, priorityIds),
    prioritySuppressedCount: priorityIds.length - visibleCountFor(displayed, priorityIds),
    unmeasurableCount: 0,
    measuredCount: measured.length,
    visibleIconCount: 0,
    leadingIconCount: 0,
    rootProtection: Boolean(rootInfo?.rootProtection),
    rootProtectionRect: rootInfo?.rootProtectionRect || null,
    rootLabelVisible: Boolean(rootInfo?.rootLabelVisible),
    selectedLabelVisible: selectedId ? Boolean(displayed.has(selectedId) && effectiveNodeOpacity(measured.find((item) => item.node.id === selectedId)?.node) > 0) : null,
    selectedLabelOpacity: selectedId ? effectiveNodeOpacity(measured.find((item) => item.node.id === selectedId)?.node) : null,
    textMismatchCount,
    measurement: 'getBoundingClientRect/offsetWidth',
    dprIndependent: true,
    viewport
  };
}















































