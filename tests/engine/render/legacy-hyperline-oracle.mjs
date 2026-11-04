/**
 * Actual legacy hyperline command oracle.
 *
 * Reuses the accepted M3 vendor loader/Legacy export without modifying that
 * helper. It executes the actual Hypertree.Plot hyperline EdgeType.
 */
import { Legacy } from '../layout/legacy-layout-oracle.mjs';

/**
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {number} radius
 */
export function legacyHyperlineCommands(from, to, radius) {
  const calls = [];
  const ctx = {
    beginPath() { calls.push(['beginPath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    arc(x, y, r, start, end, sense) { calls.push(['arc', x, y, r, start, end, sense]); },
    stroke() { calls.push(['stroke']); }
  };
  const viz = {
    config: { Node: {}, Edge: {} },
    labels: null,
    getRadius() { return radius; }
  };
  const plot = new Legacy.Hypertree.Plot(viz, Legacy.Hypertree);
  const asComplex = (point) => new Legacy.Polar(
    Math.atan2(point.y, point.x),
    Math.hypot(point.x, point.y)
  ).getc();
  const adj = {
    nodeFrom: { pos: { getc() { return asComplex(from); } } },
    nodeTo: { pos: { getc() { return asComplex(to); } } }
  };
  plot.edgeTypes.hyperline.render.call(plot, adj, { getCtx() { return ctx; } });
  return calls;
}
