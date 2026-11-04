/**
 * Isolated reference context for the unchanged vendor jit.js.
 *
 * The file is loaded as a classic script in a Node VM with a deliberately
 * minimal DOM stub. It is never imported into the M1 ESM modules; tests use it
 * only as an independent numerical oracle.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const JIT_PATH = path.resolve(here, '../../../vendor/jit/jit.2.0.1.js');
export const JIT_SHA256 = '4A413A0A21435AEE893EBE3572CAEB5EA81B14C437FA8BEC3AABB5F7A921546F';

const source = readFileSync(JIT_PATH, 'utf8');
const actualHash = createHash('sha256').update(source).digest('hex').toUpperCase();
if (actualHash !== JIT_SHA256) {
  throw new Error(`vendor jit.js hash changed: ${actualHash}`);
}

function element() {
  return {
    style: {},
    appendChild() {},
    setAttribute() {},
    setAttributeNS() {},
    getContext() {
      return null;
    }
  };
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  navigator: { userAgent: 'hypetree-m1-test' },
  document: {
    getElementById() {
      return null;
    },
    createElement: element,
    createElementNS: element,
    body: { appendChild() {}, children: [] }
  }
};
sandbox.window = sandbox;

const context = createContext(sandbox);
runInContext(source, context, { filename: JIT_PATH });

const $jit = sandbox.$jit;
if (!$jit || typeof $jit.Complex !== 'function' || typeof $jit.Polar !== 'function') {
  throw new Error('legacy JIT did not expose $jit.Complex/$jit.Polar');
}
if (typeof $jit.Complex.prototype.moebiusTransformation !== 'function') {
  throw new Error('legacy $jit.Complex.prototype.moebiusTransformation is missing');
}

export const Legacy = Object.freeze({
  Complex: $jit.Complex,
  Polar: $jit.Polar
});

/**
 * Call the legacy mutating Möbius method with fresh objects.
 * @param {{x:number,y:number}} z
 * @param {{x:number,y:number}} c
 * @returns {{x:number,y:number,cAfter:{x:number,y:number}}}
 */
export function legacyMobius(z, c) {
  const legacyZ = new Legacy.Complex(z.x, z.y);
  const legacyC = new Legacy.Complex(c.x, c.y);
  const result = legacyZ.moebiusTransformation(legacyC);
  return {
    x: result.x,
    y: result.y,
    cAfter: { x: legacyC.x, y: legacyC.y }
  };
}
