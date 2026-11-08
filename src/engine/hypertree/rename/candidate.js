/**
 * Prepare a validated Rename Map candidate without touching the live document.
 *
 * The existing encoder is the only serializer. `manifest.mapName` follows the
 * existing save/create caller contract: it is the filename passed to the
 * encoder, including the .orbit extension. The root title is carried by
 * `tree.name`; this module does not append an extension to that title.
 */
import { encodeBackup, decodeBackup } from '../persistence/backup.js';
import { cloneTree } from '../exploration/reparent.js';

function failure(reason, stage, message, extra = {}) {
  return Object.freeze({ ok: false, schema: 'fileorbit-rename-candidate-v1', reason, stage, message, ...extra });
}

function cancelled(isCancelled) {
  try { return Boolean(isCancelled?.()); } catch { return true; }
}

/**
 * @param {object} options
 * @param {object} options.plan Frozen R2 rename preflight plan
 * @param {object} options.tree Current committed tree; never mutated
 * @param {object} options.registry Current attachment registry; never mutated
 * @param {Crypto} [options.cryptoApi]
 * @param {Date|string} [options.now]
 * @param {object} [options.limits]
 * @param {object} [options.policyContext]
 * @param {() => boolean} [options.isCancelled]
 */
export async function prepareRenameCandidate({
  plan = null,
  tree = null,
  registry = null,
  cryptoApi = globalThis.crypto,
  now = new Date(),
  limits = {},
  policyContext = undefined,
  sourceMapId = null,
  isCancelled = () => false
} = {}) {
  if (!plan || plan.ok !== true || plan.schema !== 'fileorbit-rename-preflight-v1') return failure('plan-invalid', 'candidate', 'A successful Rename Map preflight is required.');
  if (!tree || typeof tree !== 'object') return failure('tree-invalid', 'candidate', 'A current tree is required.');
  if (!registry || typeof registry.get !== 'function') return failure('registry-invalid', 'candidate', 'The attachment registry is required.');
  if (cancelled(isCancelled)) return failure('cancelled', 'candidate', 'Rename candidate preparation was cancelled.');
  const candidateTree = cloneTree(tree);
  if (!candidateTree || typeof candidateTree !== 'object') return failure('tree-invalid', 'candidate', 'The current tree could not be cloned.');
  candidateTree.name = plan.title;
  let encoded;
  try {
    encoded = await encodeBackup({
      tree: candidateTree,
      registry,
      // Existing encode callers pass the current filename here; do not insert
      // an extension into tree.name or treat mapName as the root title.
      mapName: plan.filename,
      sourceMapId,
      now,
      cryptoApi,
      limits,
      policyContext,
      isCancelled
    });
  } catch (error) {
    return failure('encode-failed', 'encode', String(error?.message || error || 'Candidate encoding failed.'), { errorName: String(error?.name || ''), errorCode: String(error?.code || '') });
  }
  if (cancelled(isCancelled)) return failure('cancelled', 'encode', 'Rename candidate encoding was cancelled.');
  if (!encoded?.blob || Number(encoded.packageSize) !== Number(encoded.blob.size)) return failure('package-size-mismatch', 'encode', 'The encoded candidate package size is inconsistent.', { expected: encoded?.packageSize ?? null, actual: encoded?.blob?.size ?? null });
  if (encoded.manifest?.mapName !== plan.filename) return failure('manifest-name-mismatch', 'encode', 'The package mapName does not match the proposed filename.', { expected: plan.filename, actual: encoded.manifest?.mapName ?? null });
  let decoded;
  try {
    decoded = await decodeBackup(encoded.blob, { cryptoApi, limits, policyContext, isCancelled });
  } catch (error) {
    return failure('decode-failed', 'validate', String(error?.message || error || 'Candidate validation failed.'), { errorName: String(error?.name || ''), errorCode: String(error?.code || '') });
  }
  if (cancelled(isCancelled)) return failure('cancelled', 'validate', 'Rename candidate validation was cancelled.');
  if (decoded?.tree?.name !== plan.title) return failure('title-mismatch', 'validate', 'The decoded candidate root title does not match the proposal.', { expected: plan.title, actual: decoded?.tree?.name ?? null });
  if (decoded?.manifest?.mapName !== plan.filename) return failure('manifest-name-mismatch', 'validate', 'The decoded package mapName does not match the proposed filename.', { expected: plan.filename, actual: decoded?.manifest?.mapName ?? null });
  const attachments = (decoded.attachments || []).map((item) => Object.freeze({
    attachmentId: item.attachmentId,
    blob: item.blob,
    metadata: Object.freeze({ ...(item.metadata || {}) })
  }));
  return Object.freeze({
    ok: true,
    schema: 'fileorbit-rename-candidate-v1',
    readOnly: true,
    title: plan.title,
    filename: plan.filename,
    mapName: encoded.manifest.mapName,
    tree: candidateTree,
    blob: encoded.blob,
    packageSize: encoded.packageSize,
    manifest: encoded.manifest,
    attachments,
    validated: Object.freeze({
      rootTitle: decoded.tree.name,
      mapName: decoded.manifest.mapName,
      nodeCount: decoded.manifest.nodeCount,
      totalAttachmentBytes: decoded.manifest.totalAttachmentBytes,
      attachmentCount: attachments.length,
      manifest: decoded.manifest
    })
  });
}
