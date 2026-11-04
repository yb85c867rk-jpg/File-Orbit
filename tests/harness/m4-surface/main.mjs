import {
  createCanvasSurface,
  createProjection
} from '../../../src/engine/hypertree/render/index.js';

const host = document.querySelector('#surface-host');
const statusEl = document.querySelector('#status');
const sourceEl = document.querySelector('#dpr-source');
let surface = null;
let projection = null;
let lastError = null;

function actualDpr() {
  return Number(window.devicePixelRatio) || 1;
}

function selectedDpr() {
  const value = sourceEl.value;
  if (value === 'actual') return { dpr: actualDpr(), source: 'actual' };
  return { dpr: Number(value), source: 'synthetic' };
}

/** Content box, excluding border and padding. */
function hostContentSize() {
  const style = getComputedStyle(host);
  const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return {
    width: Math.max(0, Math.floor(host.clientWidth - padX)),
    height: Math.max(0, Math.floor(host.clientHeight - padY))
  };
}

/** Drawable content origin for translation-only client conversion. */
function drawableOrigin() {
  const rect = host.getBoundingClientRect();
  const style = getComputedStyle(host);
  return {
    left: rect.left + host.clientLeft + (parseFloat(style.paddingLeft) || 0),
    top: rect.top + host.clientTop + (parseFloat(style.paddingTop) || 0)
  };
}

function projectionObservations() {
  if (!projection) return [];
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -0.5, y: 0.25 }
  ];
  const origin = drawableOrigin();
  return points.map((point) => {
    const css = projection.toCss(point.x, point.y);
    const roundTrip = projection.fromCss(css.x, css.y);
    const client = projection.toClient(css, origin);
    const fromClient = projection.fromClient(client, origin);
    return {
      normalized: point,
      css,
      inverse: roundTrip,
      roundTripError: { x: roundTrip.x - point.x, y: roundTrip.y - point.y },
      client,
      clientOrigin: origin,
      fromClientError: { x: fromClient.x - css.x, y: fromClient.y - css.y }
    };
  });
}

function updateStatus(operation, metrics, preserved) {
  const status = {
    harness: 'm4-surface',
    browserVerification: 'HARNESS_LOADED',
    note: 'Canvas calibration marks only; projection observations are numerical, not visual-correctness proof.',
    operation,
    canvasIdentityPreserved: preserved,
    actualDpr: actualDpr(),
    selectedDpr: selectedDpr().dpr,
    syntheticDpr: sourceEl.value === 'actual' ? null : Number(sourceEl.value),
    dprSource: sourceEl.value === 'actual' ? 'actual' : 'synthetic',
    content: metrics ? { width: metrics.cssWidth, height: metrics.cssHeight } : null,
    backing: metrics ? { width: metrics.backingWidth, height: metrics.backingHeight } : null,
    dpr: metrics ? metrics.dpr : null,
    scale: metrics ? { x: metrics.scaleX, y: metrics.scaleY } : null,
    drawableOrigin: drawableOrigin(),
    projectionObservations: projectionObservations(),
    surface: surface ? 'alive' : 'destroyed',
    error: lastError
  };
  window.__M4_SURFACE_STATUS__ = status;
  statusEl.textContent = JSON.stringify(status, null, 2);
}

function makeProjection(metrics) {
  return createProjection({
    width: metrics.cssWidth,
    height: metrics.cssHeight,
    radius: Math.max(1, Math.min(metrics.cssWidth, metrics.cssHeight) * 0.42)
  });
}

function draw() {
  if (!surface || !projection) return;
  const ctx = surface.context;
  const m = surface.getMetrics();
  surface.clear();
  ctx.save();
  ctx.strokeStyle = '#2b3648';
  ctx.lineWidth = 1;
  const left = projection.toCss(-1, 0);
  const right = projection.toCss(1, 0);
  const top = projection.toCss(0, -1);
  const bottom = projection.toCss(0, 1);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.stroke();

  ctx.strokeStyle = '#6d7c96';
  ctx.beginPath();
  const segments = 64;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const point = projection.toCss(Math.cos(angle), Math.sin(angle));
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#39465c';
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const inner = projection.toCss(Math.cos(angle), Math.sin(angle));
    const outer = projection.toCss(Math.cos(angle) * 1.08, Math.sin(angle) * 1.08);
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();
  }
  ctx.restore();
  updateStatus('draw', m, true);
}

function createSurface(operation) {
  if (surface) return;
  lastError = null;
  const size = hostContentSize();
  const choice = selectedDpr();
  try {
    surface = createCanvasSurface(host, { width: size.width, height: size.height, dpr: choice.dpr });
    projection = makeProjection(surface.getMetrics());
    draw();
    updateStatus(operation, surface.getMetrics(), false);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus(operation, null, false);
  }
}

function resizeSurface() {
  if (!surface) {
    createSurface('create');
    return;
  }
  const canvasBefore = surface.canvas;
  const size = hostContentSize();
  const choice = selectedDpr();
  lastError = null;
  try {
    surface.resize({ width: size.width, height: size.height, dpr: choice.dpr });
    projection = makeProjection(surface.getMetrics());
    draw();
    updateStatus('resize', surface.getMetrics(), surface.canvas === canvasBefore);
  } catch (error) {
    lastError = { name: error.name, code: error.code, message: error.message };
    updateStatus('resize', surface.getMetrics(), surface.canvas === canvasBefore);
  }
}

function recreateSurface() {
  if (surface) {
    surface.destroy();
    surface = null;
  }
  projection = null;
  createSurface('recreate');
}

function destroySurface() {
  if (surface) surface.destroy();
  surface = null;
  projection = null;
  updateStatus('destroy', null, false);
}

document.querySelector('#resize').addEventListener('click', resizeSurface);
document.querySelector('#recreate').addEventListener('click', recreateSurface);
document.querySelector('#destroy').addEventListener('click', destroySurface);
sourceEl.addEventListener('change', resizeSurface);

createSurface('create');

