/**
 * Actual legacy Complex.moebiusTransformation oracle.
 * Loads the unchanged vendor jit.js through the accepted M3 helper.
 */
import { Legacy } from '../layout/legacy-layout-oracle.mjs';

/**
 * @param {{x:number,y:number}} z
 * @param {{x:number,y:number}} c
 */
export function legacyMobius(z, c) {
  const zComplex = new Legacy.Polar(Math.atan2(z.y, z.x), Math.hypot(z.x, z.y)).getc();
  const cComplex = new Legacy.Polar(Math.atan2(c.y, c.x), Math.hypot(c.x, c.y)).getc();
  const result = zComplex.moebiusTransformation(cComplex);
  return { x: result.x, y: result.y };
}
