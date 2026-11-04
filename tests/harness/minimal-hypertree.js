/*
 * FileOrbit V2 — T2 minimal Hypertree harness (Rev 4).
 *
 * $jit.Hypertree only. No SpaceTree. No framework, no bundler, no dependencies.
 *
 * One deterministic small tree, unique instance/container/node ids, filenames via
 * textContent, a visible status panel, label-visibility/overlap metrics, and an
 * adapter-level hit test in rendered coordinates.
 *
 * Not implemented: dispose (JIT has none), file-type icon sprites, JIT Navigation
 * (mouse pan/zoom), and touch gestures. Lifecycle/retention work belongs to T4.
 *
 * Query: ?nodes=20&instance=1
 */
(function () {
  'use strict';

  var BASE_WIDTH = 960;
  var BASE_HEIGHT = 560;
  var FOCUS_DURATION = 300;

  var ERRORS = [];
  var STATE = {
    requestedNodes: 0,
    actualNodes: 0,
    instanceId: '1',
    hostId: '',
    canvasId: '',
    labelContainerId: '',
    labelsTotal: 0,
    labelsVisible: 0,
    labelTextMismatches: 0,
    labelOverlaps: 0,
    labelSample: [],
    focusedId: null,
    focusRequests: 0,
    focusIgnored: 0,
    focusCompleted: 0,
    focusNoop: 0,
    resizeCount: 0,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    renderPath: 'not-started',
    selfTest: null,
    jitConfig: null,
    geometry: null,
    probe: null,
    bodyExtraChildren: 0
  };

  var ht = null;
  var canvasEl = null;
  var nameById = {};

  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function addRow(dl, label, value) {
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    dd.textContent = String(value);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function fail(message) {
    ERRORS.push(String(message));
    renderStatus();
  }

  window.addEventListener('error', function (event) {
    fail('window.error: ' + (event.message || 'unknown error'));
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason && event.reason.message ? event.reason.message : event.reason;
    fail('unhandledrejection: ' + String(reason));
  });

  function clampNodeCount(raw) {
    var n = parseInt(raw, 10);
    if (!isFinite(n)) return 20;
    if (n < 2) return 2;
    if (n > 200) return 200;
    return n;
  }

  function sanitizeInstance(raw) {
    var value = String(raw == null ? '1' : raw).replace(/[^A-Za-z0-9_-]/g, '');
    return value || '1';
  }

  function pad3(n) {
    var s = String(n);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  // Deterministic fixture: one root folder, up to 3 folders, remaining files.
  // Folder/file distinction is carried in plain data (kind) and presentation data
  // ($type/$dim/$color), which JIT reads only when Node.overridable is true.
  function buildFixture(total, instanceId) {
    var seq = 0;
    function nextId() { return 'vd-' + instanceId + '-' + (seq++); }

    var root = {
      id: nextId(),
      name: 'visual-directory',
      data: { kind: 'folder', '$type': 'circle', '$dim': 10, '$color': '#2f5d8a' },
      children: []
    };
    var folderCount = Math.min(3, total - 1);
    var folders = [];

    for (var f = 0; f < folderCount; f++) {
      var folder = {
        id: nextId(),
        name: 'folder-' + (f + 1),
        data: { kind: 'folder', '$type': 'circle', '$dim': 8, '$color': '#3b6ea5' },
        children: []
      };
      root.children.push(folder);
      folders.push(folder);
    }

    var fileIndex = 0;
    while (seq < total) {
      var target = folders[fileIndex % folders.length];
      fileIndex++;
      target.children.push({
        id: nextId(),
        name: 'file-' + pad3(fileIndex) + '.txt',
        data: { kind: 'file', '$type': 'square', '$dim': 5, '$color': '#7a8a99' },
        children: []
      });
    }

    return root;
  }

  function countNodes(node) {
    return 1 + node.children.reduce(function (sum, child) { return sum + countNodes(child); }, 0);
  }

  function collectNames(node, out) {
    out[node.id] = node.name;
    node.children.forEach(function (child) { collectNames(child, out); });
    return out;
  }

  function parseQuery() {
    var params = new URLSearchParams(window.location.search);
    return {
      nodes: clampNodeCount(params.get('nodes')),
      instanceId: sanitizeInstance(params.get('instance')),
      focus: params.get('focus')
    };
  }

  function mount(tree) {
    var host = document.getElementById('viz-host');
    host.id = 'vd-canvas-' + STATE.instanceId;
    host.innerHTML = '';
    host.style.width = STATE.width + 'px';
    host.style.height = STATE.height + 'px';

    STATE.hostId = host.id;
    STATE.canvasId = host.id + '-canvas';
    STATE.labelContainerId = host.id + '-label';

    var config = {
      injectInto: host.id,
      width: STATE.width,
      height: STATE.height,
      radius: 'auto',
      offset: 0,
      duration: FOCUS_DURATION,
      fps: 35,
      Node: { type: 'circle', dim: 6, color: '#4a6fa5', overridable: true, transform: true },
      Edge: { type: 'hyperline', lineWidth: 1.2, color: '#a8b6c4', overridable: true },
      Label: { type: 'HTML', size: 12, family: 'Segoe UI, Arial, sans-serif', color: '#16202b' },
      Events: {
        enable: true,
        onClick: function (node) {
          if (node && node.id) focusNode(node.id);
        }
      },
      Navigation: { enable: false, panning: false, zooming: false },
      onCreateLabel: function (el, node) {
        // Filenames are untrusted display data: textContent only.
        el.textContent = node.name;
        var kind = node.data && node.data.kind === 'folder' ? 'folder' : 'file';
        el.className = 'vd-label vd-label--' + kind;
        el.setAttribute('data-vd-node', node.id);
        el.setAttribute('data-vd-kind', kind);
        el.title = node.name;
      }
    };

    STATE.jitConfig = {
      radius: 'auto (min(w,h)/2)',
      actualRadius: null,
      duration: config.duration,
      fps: config.fps,
      nodeType: config.Node.type,
      nodeTransform: config.Node.transform,
      edgeType: config.Edge.type,
      labelType: config.Label.type,
      eventsEnabled: config.Events.enable,
      navigationEnabled: config.Navigation.enable
    };

    ht = new window.$jit.Hypertree(config);
    ht.loadJSON(tree);
    ht.compute();
    ht.plot();
    STATE.jitConfig.actualRadius = Math.round(ht.getRadius());
    canvasEl = ht.canvas.getElement(); // canvas widget wrapper
    var canvas = canvasEl.querySelector('canvas');
    STATE.canvasId = canvas ? canvas.id : STATE.canvasId;

    if (canvas) {
      // Adapter-level hit test for canvas circles. JIT's HTML-label Events path
      // handles label clicks only, so this is the second activation path.
      canvas.addEventListener('click', function (event) {
        var id = hitTestClient(event.clientX, event.clientY);
        if (id) focusNode(id);
      });
    }

    STATE.renderPath = 'loadJSON+compute+plot';
    return ht;
  }

  function nodeKind(node) {
    return node && node.data && node.data.kind === 'folder' ? 'folder' : 'file';
  }

  function canvasLocalPoint(clientX, clientY) {
    var size = ht.canvas.getSize();
    var rect = canvasEl.querySelector('canvas').getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (size.width / rect.width),
      y: (clientY - rect.top) * (size.height / rect.height)
    };
  }

  function centeredPos(local) {
    var size = ht.canvas.getSize();
    var ox = ht.canvas.translateOffsetX;
    var oy = ht.canvas.translateOffsetY;
    var sx = ht.canvas.scaleOffsetX;
    var sy = ht.canvas.scaleOffsetY;
    return {
      x: (local.x - size.width / 2 - ox) / sx,
      y: (local.y - size.height / 2 - oy) / sy
    };
  }

  function renderedContains(node, pos, minTarget) {
    var p = node.pos.getc(true);
    var scale = node.scale || ht.getRadius();
    var nx = p.x * scale;
    var ny = p.y * scale;
    var type = node.getData('type') || 'circle';
    var transform = ht.config.Node.transform !== false;
    var k = transform ? Math.max(0, 1 - (p.x * p.x + p.y * p.y)) : 1;
    var dim = node.getData('dim') || 0;
    var width = node.getData('width') || dim;
    var height = node.getData('height') || dim;
    var floor = typeof minTarget === 'number' ? minTarget : 0;
    if (type === 'rectangle' || type === 'square') {
      return Math.abs(pos.x - nx) <= Math.max((width * k) / 2, floor) &&
             Math.abs(pos.y - ny) <= Math.max((height * k) / 2, floor);
    }
    return Math.hypot(pos.x - nx, pos.y - ny) <= Math.max(dim * k, floor);
  }

  function hitTestRendered(pos) {
    var found = null;
    var best = Infinity;
    ht.graph.eachNode(function (node) {
      if (!renderedContains(node, pos, 6)) return; // usability floor for pointer hit
      var p = node.pos.getc(true);
      var scale = node.scale || ht.getRadius();
      var d = Math.hypot(p.x * scale - pos.x, p.y * scale - pos.y);
      if (d < best) { best = d; found = node; }
    });
    return found;
  }

  function hitTestClient(clientX, clientY) {
    if (!ht) return null;
    var node = hitTestRendered(centeredPos(canvasLocalPoint(clientX, clientY)));
    return node ? node.id : null;
  }

  function jitContainsOwn(node, pos) {
    var geom = ht.fx.nodeTypes[node.getData('type')];
    return !!(geom && geom.contains && geom.contains.call(ht.fx, node, pos));
  }

  function screenPoint(node) {
    var size = ht.canvas.getSize();
    var p = node.pos.getc(true);
    var scale = node.scale || ht.getRadius();
    return {
      x: p.x * scale * ht.canvas.scaleOffsetX + ht.canvas.translateOffsetX + size.width / 2,
      y: p.y * scale * ht.canvas.scaleOffsetY + ht.canvas.translateOffsetY + size.height / 2
    };
  }

  function runHitProbe() {
    var sampled = 0;
    var jitOwn = 0;
    var renderOwn = 0;
    var hitBeyondRendered = 0;
    var boundary = 0;
    var maxRatio = 0;
    var size = ht.canvas.getSize();

    ht.graph.eachNode(function (node) {
      if (sampled >= 300) return;
      sampled++;
      var p = node.pos.getc(true);
      var norm2 = p.x * p.x + p.y * p.y;
      var ratio = 1 / Math.max(1e-6, 1 - norm2);
      if (ratio > maxRatio) maxRatio = ratio;
      if (Math.sqrt(norm2) > 0.8) boundary++;

      var scale = node.scale || ht.getRadius();
      var nx = p.x * scale;
      var ny = p.y * scale;
      var dim = node.getData('dim') || 0;
      var center = { x: nx, y: ny };
      if (jitContainsOwn(node, center)) jitOwn++;
      if (renderedContains(node, center)) renderOwn++;

      // A point inside JIT's untransformed hit shape, just inside its radius.
      var edgePoint = { x: nx + dim * 0.95, y: ny };
      if (jitContainsOwn(node, edgePoint) && !renderedContains(node, edgePoint)) {
        hitBeyondRendered++;
      }
    });

    return {
      sampled: sampled,
      jitOwnHits: jitOwn,
      renderedOwnHits: renderOwn,
      hitBeyondRendered: hitBeyondRendered,
      boundaryNodes: boundary,
      maxHitAreaRatio: Math.round(maxRatio * 100) / 100
    };
  }

  function focusNode(id) {
    if (!ht) return;
    if (!ht.graph.getNode(id)) {
      fail('focus requested for unknown node: ' + id);
      return;
    }
    if (ht.busy) {
      STATE.focusRequests++;
      STATE.focusIgnored++;
      renderStatus();
      return;
    }
    STATE.focusRequests++;
    STATE.focusedId = id;
    ht.onClick(id, {
      onComplete: function () {
        STATE.focusCompleted++;
        updateAfterRender('focus');
      }
    });
    if (!ht.busy) STATE.focusNoop++; // e.g. versor on/outside the unit disc
    renderStatus();
  }

  function measureLabels() {
    var host = document.getElementById(STATE.hostId);
    var labels = host ? host.querySelectorAll('[data-vd-node]') : [];
    STATE.labelsTotal = labels.length;
    STATE.labelsVisible = 0;
    STATE.labelTextMismatches = 0;
    STATE.labelOverlaps = 0;
    STATE.labelSample = [];

    var rects = [];
    for (var i = 0; i < labels.length; i++) {
      var id = labels[i].getAttribute('data-vd-node');
      var expected = nameById[id];
      if (i < 3) STATE.labelSample.push(labels[i].textContent);
      if (expected === undefined || labels[i].textContent !== expected) STATE.labelTextMismatches++;

      var style = labels[i].style;
      if (style.display === 'none') continue;
      var rect = labels[i].getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      STATE.labelsVisible++;
      if (rects.length < 400) {
        rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
      }
    }

    for (var a = 0; a < rects.length; a++) {
      for (var b = a + 1; b < rects.length; b++) {
        var r1 = rects[a], r2 = rects[b];
        if (r1.left < r2.right && r2.left < r1.right && r1.top < r2.bottom && r2.top < r1.bottom) {
          STATE.labelOverlaps++;
        }
      }
    }
  }

  function captureGeometry() {
    var positions = [];
    ht.graph.eachNode(function (node) {
      if (positions.length >= 12) return;
      var p = node.pos.getc(true);
      positions.push({
        id: node.id,
        rho: Math.round(node.pos.rho * 1000) / 1000,
        theta: Math.round(node.pos.theta * 1000) / 1000,
        x: Math.round(p.x * 1000) / 1000,
        y: Math.round(p.y * 1000) / 1000,
        depth: node._depth
      });
    });
    return positions;
  }

  function renderStatus() {
    var ledger = window.__VD_INSTRUMENTATION__;
    var counts = ledger ? ledger.counts() : null;
    var version = window.$jit && window.$jit.version ? window.$jit.version : '(missing)';

    var harnessTags = { SCRIPT: true, HEADER: true, SECTION: true, MAIN: true };
    STATE.bodyExtraChildren = 0;
    for (var bi = 0; bi < document.body.children.length; bi++) {
      if (!harnessTags[document.body.children[bi].tagName]) STATE.bodyExtraChildren++;
    }

    var dl = document.getElementById('status-list');
    if (dl) {
      dl.textContent = '';
      addRow(dl, 'library version', version);
      addRow(dl, 'visualization', 'Hypertree');
      addRow(dl, 'fixture nodes (requested)', STATE.requestedNodes);
      addRow(dl, 'fixture nodes (actual)', STATE.actualNodes);
      addRow(dl, 'JIT config', STATE.jitConfig
        ? 'radius=' + STATE.jitConfig.radius + ' (actual ' + STATE.jitConfig.actualRadius + 'px)' +
          ', duration=' + STATE.jitConfig.duration + 'ms, fps=' + STATE.jitConfig.fps +
          ', Edge=' + STATE.jitConfig.edgeType +
          ', Label=' + STATE.jitConfig.labelType +
          ', transform=' + STATE.jitConfig.nodeTransform +
          ', Events=' + STATE.jitConfig.eventsEnabled +
          ', Navigation=' + STATE.jitConfig.navigationEnabled
        : '(not mounted)');
      addRow(dl, 'actual devicePixelRatio', window.devicePixelRatio);
      addRow(dl, 'canvas size', STATE.width + 'x' + STATE.height);
      addRow(dl, 'instance id', STATE.instanceId);
      addRow(dl, 'host id', STATE.hostId || '(none)');
      addRow(dl, 'canvas id', STATE.canvasId || '(none)');
      addRow(dl, 'label container id', STATE.labelContainerId || '(none)');
      addRow(dl, 'labels total / visible', STATE.labelsTotal + ' / ' + STATE.labelsVisible);
      addRow(dl, 'label text mismatches', STATE.labelTextMismatches);
      addRow(dl, 'label overlaps (visible pairs)', STATE.labelOverlaps);
      addRow(dl, 'label sample', JSON.stringify(STATE.labelSample));
      addRow(dl, 'focus', (STATE.focusedId || '(none)') +
        ' (requests=' + STATE.focusRequests +
        ', ignored-busy=' + STATE.focusIgnored +
        ', noop=' + STATE.focusNoop +
        ', completed=' + STATE.focusCompleted + ')');
      addRow(dl, 'hit probe', STATE.probe
        ? 'sampled=' + STATE.probe.sampled +
          ', jitOwn=' + STATE.probe.jitOwnHits +
          ', renderedOwn=' + STATE.probe.renderedOwnHits +
          ', hitBeyondRendered=' + STATE.probe.hitBeyondRendered +
          ', boundary=' + STATE.probe.boundaryNodes +
          ', maxHitAreaRatio=' + STATE.probe.maxHitAreaRatio
        : '(not run)');
      addRow(dl, 'render path', STATE.renderPath);
      addRow(dl, 'resize count', STATE.resizeCount);
      addRow(dl, 'instrumentation active',
        counts ? 'listeners=' + counts.active.listeners +
          ', timeouts=' + counts.active.timeouts +
          ', intervals=' + counts.active.intervals +
          ', rafs=' + counts.active.rafs : '(not installed)');
      addRow(dl, 'instrumentation unsupported',
        counts ? JSON.stringify(counts.unsupported) : '(not installed)');
      addRow(dl, 'instrumentation self-test',
        STATE.selfTest ? (STATE.selfTest.passed ? 'passed' : 'FAILED') : 'not run');
      addRow(dl, 'extra body children', STATE.bodyExtraChildren);
      addRow(dl, 'errors', ERRORS.length ? ERRORS.join(' | ') : 'none');
    }

    var limitations = document.getElementById('limitations');
    if (limitations) {
      limitations.textContent = '';
      [
        'No dispose/cleanup is implemented: JIT has no dispose(). Listeners and timers are not released.',
        'JIT focus re-roots at the closest node to the requested position, so the requested id may differ from the node actually centered.',
        'File-type icons are not implemented in this harness; folder/file differ by shape, colour and label class only.',
        'JIT Navigation (mouse pan/wheel zoom) is disabled; touch pan/pinch is not implemented.',
        'Lifecycle cycles, negative controls and retention measurement are T4, not this harness.',
        'devicePixelRatio is displayed as-is; DPR 2/3 emulation was not used (NOT RUN).',
        'Only events and timers are instrumented. Observers, object URLs and DOM creation are not.',
        'Hypertree renders every node; there is no level culling, so node count is bounded by the fixture.'
      ].forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        limitations.appendChild(li);
      });
    }

    var report = {
      libraryVersion: version,
      visualization: 'Hypertree',
      fixture: {
        requestedNodes: STATE.requestedNodes,
        actualNodes: STATE.actualNodes,
        instanceId: STATE.instanceId
      },
      jitConfig: STATE.jitConfig,
      actualDevicePixelRatio: window.devicePixelRatio,
      canvas: { width: STATE.width, height: STATE.height },
      ids: {
        host: STATE.hostId,
        canvas: STATE.canvasId,
        labelContainer: STATE.labelContainerId
      },
      labels: {
        total: STATE.labelsTotal,
        visible: STATE.labelsVisible,
        textMismatches: STATE.labelTextMismatches,
        overlaps: STATE.labelOverlaps,
        sample: STATE.labelSample
      },
      focus: {
        focusedId: STATE.focusedId,
        requests: STATE.focusRequests,
        ignoredWhileBusy: STATE.focusIgnored,
        noop: STATE.focusNoop,
        completed: STATE.focusCompleted
      },
      hitProbe: STATE.probe,
      geometrySample: STATE.geometry,
      renderPath: STATE.renderPath,
      resizeCount: STATE.resizeCount,
      instrumentation: counts,
      instrumentationSelfTest: STATE.selfTest,
      extraBodyChildren: STATE.bodyExtraChildren,
      errors: ERRORS.slice(),
      harness: 'T2-minimal-hypertree',
      cleanup: 'not-implemented-by-design'
    };

    var pre = document.getElementById('status-json');
    if (pre) pre.textContent = JSON.stringify(report, null, 2);

    document.body.setAttribute('data-harness-status', ERRORS.length ? 'error' : 'ok');
    document.body.setAttribute('data-labels-total', String(STATE.labelsTotal));
    document.body.setAttribute('data-labels-visible', String(STATE.labelsVisible));
    document.body.setAttribute('data-labels-mismatch', String(STATE.labelTextMismatches));
    document.body.setAttribute('data-jit-version', version);
    document.body.setAttribute('data-visualization', 'hypertree');
  }

  function updateAfterRender(label) {
    if (!ht) return;
    measureLabels();
    STATE.probe = runHitProbe();
    STATE.geometry = captureGeometry();
    renderStatus();
  }

  function toggleResize() {
    if (!ht) return;
    var small = STATE.width === BASE_WIDTH;
    STATE.width = small ? 720 : BASE_WIDTH;
    STATE.height = small ? 420 : BASE_HEIGHT;
    var host = document.getElementById(STATE.hostId);
    host.style.width = STATE.width + 'px';
    host.style.height = STATE.height + 'px';
    ht.canvas.resize(STATE.width, STATE.height); // triggers viz.refresh() internally
    ht.config.width = STATE.width;
    ht.config.height = STATE.height;
    STATE.resizeCount++;
    // refresh() recomputes around this.root, so focus is not preserved by JIT.
    STATE.focusedId = null;
    updateAfterRender('resize');
  }

  function main() {
    var query = parseQuery();
    STATE.requestedNodes = query.nodes;
    STATE.instanceId = query.instanceId;

    var hasJit = window.$jit && window.$jit.version && typeof window.$jit.Hypertree === 'function';
    if (!hasJit) {
      fail('JIT runtime guard failed: window.$jit.Hypertree is missing');
      renderStatus();
      return;
    }

    var tree = buildFixture(query.nodes, STATE.instanceId);
    STATE.actualNodes = countNodes(tree);
    nameById = collectNames(tree, {});

    try {
      mount(tree);
      updateAfterRender('mount');
    } catch (error) {
      fail('mount failed: ' + (error && error.message ? error.message : String(error)));
    }

    var rootButton = document.getElementById('focus-root');
    if (rootButton) {
      rootButton.addEventListener('click', function () {
        var first = ht && ht.graph.getNode(ht.root);
        if (first) focusNode(first.id);
      });
    }
    var lastButton = document.getElementById('focus-last');
    if (lastButton) {
      lastButton.addEventListener('click', function () {
        if (!ht) return;
        var last = null;
        ht.graph.eachNode(function (node) { last = node; });
        if (last) focusNode(last.id);
      });
    }
    var resizeButton = document.getElementById('resize-toggle');
    if (resizeButton) {
      resizeButton.addEventListener('click', toggleResize);
    }

    if (query.focus) {
      setTimeout(function () { focusNode(query.focus); }, 0);
    }

    if (window.__VD_INSTRUMENTATION__ && window.__VD_INSTRUMENTATION__.selfTest) {
      window.__VD_INSTRUMENTATION__.selfTest().then(function (result) {
        STATE.selfTest = result;
        renderStatus();
      }).catch(function (error) {
        fail('instrumentation self-test threw: ' + String(error && error.message ? error.message : error));
      });
    }

    renderStatus();
    setTimeout(renderStatus, 60);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();



