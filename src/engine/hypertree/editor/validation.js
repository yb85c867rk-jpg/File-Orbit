import { GraphRenderError } from '../render/errors.js';
import { validateWebLink, MAX_WEB_LINK_CODE_POINTS } from '../shared/web-link.js';
import { EDITION_NODE_LIMITS } from '../edition/index.js';
import { evaluateContextNodeAccess } from '../edition/context.js';

export const EDITOR_MAX_NODES = EDITION_NODE_LIMITS.free;
export const MAX_NAME_CODE_POINTS = 200;
export const MAX_DESCRIPTION_CODE_POINTS = 2000;
export const MAX_LINK_CODE_POINTS = MAX_WEB_LINK_CODE_POINTS;
export const ID_ALLOCATION_ATTEMPTS = 10000;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 100 * 1024 * 1024;
const PROHIBITED_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

export function codePointLength(value) {
  return Array.from(value).length;
}

export function countTreeNodes(root) {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    count += 1;
    for (const child of node.children || []) stack.push(child);
  }
  return count;
}

export function nameKey(name) {
  return name.trim().normalize('NFC').toLowerCase();
}

export function validateName(value) {
  if (typeof value !== 'string') {
    return { ok: false, field: 'name', reason: 'name-required', message: 'Name is required.' };
  }
  const name = value.trim();
  if (name.length === 0) {
    return { ok: false, field: 'name', reason: 'name-required', message: 'Name is required.' };
  }
  if (codePointLength(name) > MAX_NAME_CODE_POINTS) {
    return { ok: false, field: 'name', reason: 'name-too-long', message: `Name must be at most ${MAX_NAME_CODE_POINTS} characters.` };
  }
  if (PROHIBITED_CONTROL.test(name)) {
    return { ok: false, field: 'name', reason: 'name-control', message: 'Name contains a prohibited control character.' };
  }
  return { ok: true, name };
}

export function findSibling(tree, parentId, name) {
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (node.id === parentId) {
      const key = nameKey(name);
      return (node.children || []).find((child) => nameKey(child.name) === key) || null;
    }
    for (const child of node.children || []) stack.push(child);
  }
  return null;
}

export function validateEditorAdmission(tree, { policyContext = undefined, maxNodes = undefined } = {}) {
  if (!tree) return { ok: false, reason: 'missing-tree' };
  const access = evaluateContextNodeAccess(policyContext, countTreeNodes(tree), maxNodes);
  if (!access.ok) return { ok: false, reason: access.reason, message: access.message };
  if (!access.decision.allowed) {
    return { ok: false, reason: 'editor-node-limit', message: `Editing is limited to ${access.decision.effectiveLimit} nodes.`, limit: access.decision.effectiveLimit };
  }
  return { ok: true, limit: access.decision.effectiveLimit, edition: access.context.edition };
}

export function validateRename({ tree, targetId, draftName, policyContext = undefined, maxNodes = undefined }) {
  if (!tree || typeof targetId !== 'string') {
    return { ok: false, reason: 'stale-id', message: 'The node no longer exists.' };
  }
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const node = findNodeWithParent(tree, targetId);
  if (!node) return { ok: false, reason: 'stale-id', message: 'The node no longer exists.' };
  const nameResult = validateName(draftName);
  if (!nameResult.ok) return nameResult;
  const name = nameResult.name;
  if (name === node.node.name) return { ok: true, noop: true, name, node: node.node, parent: node.parent };
  const duplicate = (node.parent?.children || []).find((sibling) => (
    sibling.id !== targetId && nameKey(sibling.name) === nameKey(name)
  ));
  if (duplicate) {
    return { ok: false, field: 'name', reason: 'duplicate-name', message: `A sibling named "${duplicate.name}" already exists.`, duplicateId: duplicate.id };
  }
  return { ok: true, noop: false, name, node: node.node, parent: node.parent };
}

export function findNodeWithParent(root, id) {
  const stack = [{ node: root, parent: null }];
  while (stack.length) {
    const current = stack.pop();
    if (current.node.id === id) return current;
    for (const child of current.node.children || []) stack.push({ node: child, parent: current.node });
  }
  return null;
}

export function assertEditorTree(tree) {
  if (!tree || typeof tree !== 'object') throw new GraphRenderError('invalid-editor', 'tree is required');
}
export function nodeDescription(node) {
  return typeof node?.data?.description === 'string' ? node.data.description : null;
}

export function nodeLink(node) {
  return typeof node?.data?.link === 'string' ? node.data.link : null;
}

export function validateDescription(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, field: 'description', reason: 'description-invalid', message: 'Description must be text.' };
  }
  if (codePointLength(value) > MAX_DESCRIPTION_CODE_POINTS) {
    return { ok: false, field: 'description', reason: 'description-too-long', message: `Description must be at most ${MAX_DESCRIPTION_CODE_POINTS} characters.` };
  }
  if (value.includes('\u0000')) {
    return { ok: false, field: 'description', reason: 'description-control', message: 'Description contains a prohibited control character.' };
  }
  return { ok: true, value };
}

export function validateLink(value) {
  return validateWebLink(value);
}

export function createEditorIdAllocator({ datasetToken, counter = 0 }) {
  if (!Number.isSafeInteger(datasetToken) || datasetToken < 0) throw new Error('datasetToken must be a nonnegative safe integer');
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('counter must be a nonnegative safe integer');
  let nextCounter = counter;
  return {
    get counter() { return nextCounter; },
    next(tree) {
      for (let attempt = 0; attempt < ID_ALLOCATION_ATTEMPTS; attempt += 1) {
        if (!Number.isSafeInteger(nextCounter)) return { ok: false, reason: 'id-exhausted' };
        const id = `fo-${datasetToken.toString(36)}-${nextCounter.toString(36)}`;
        nextCounter += 1;
        if (!findTreeId(tree, id)) return { ok: true, id };
      }
      return { ok: false, reason: 'id-exhausted' };
    }
  };
}

function findTreeId(root, id) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.id === id) return true;
    for (const child of node.children || []) stack.push(child);
  }
  return false;
}
export function dataTypeOf(node) {
  const value = node?.data?.dataType;
  return value === 'file' || value === 'web-link' ? value : 'legacy';
}

export function validateAttachmentMetadata(value) {
  if (!value || typeof value !== 'object') return { ok: false, field: 'file', reason: 'attachment-missing', message: 'Choose a file.' };
  if (typeof value.attachmentId !== 'string' || value.attachmentId.length === 0) return { ok: false, field: 'file', reason: 'attachment-missing', message: 'The attachment reference is missing.' };
  if (typeof value.originalName !== 'string' || value.originalName.length === 0) return { ok: false, field: 'file', reason: 'attachment-name', message: 'The original filename is missing.' };
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0 || value.sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, field: 'file', reason: 'attachment-too-large', message: `Files must be at most ${MAX_ATTACHMENT_BYTES} bytes.` };
  if (typeof value.mime !== 'string') return { ok: false, field: 'file', reason: 'attachment-mime', message: 'The reported MIME type is invalid.' };
  if (!value.classification || typeof value.classification !== 'object' || typeof value.classification.format !== 'string') {
    return { ok: false, field: 'file', reason: 'attachment-classification', message: 'The attachment format is not classified.' };
  }
  return { ok: true, attachment: Object.freeze({ ...value, classification: Object.freeze({ ...value.classification }) }) };
}

export function validateAddChild({ tree, parentId, kind, draftName, draftDescription = null, draftLink = null, draftDataType, draftAttachment = null, policyContext = undefined, maxNodes = undefined }) {
  if (kind !== 'folder' && kind !== 'file') return { ok: false, reason: 'invalid-kind', message: 'Unsupported node kind.' };
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const prospective = evaluateContextNodeAccess(policyContext, countTreeNodes(tree) + 1, maxNodes);
  if (!prospective.ok) return { ok: false, reason: prospective.reason, message: prospective.message };
  if (!prospective.decision.allowed) {
    return { ok: false, reason: 'editor-node-limit', message: `Adding would exceed ${prospective.decision.effectiveLimit} nodes.`, limit: prospective.decision.effectiveLimit };
  }
  const parent = findNodeWithParent(tree, parentId);
  if (!parent) return { ok: false, reason: 'stale-id', message: 'The parent folder no longer exists.' };
  if (parent.node.kind !== 'folder') return { ok: false, reason: 'not-folder', message: 'New nodes require a folder parent.' };
  const nameResult = validateName(draftName);
  if (!nameResult.ok) return nameResult;
  const name = nameResult.name;
  const duplicate = (parent.node.children || []).find((sibling) => nameKey(sibling.name) === nameKey(name));
  if (duplicate) {
    return { ok: false, field: 'name', reason: 'duplicate-name', message: `A sibling named "${duplicate.name}" already exists.`, duplicateId: duplicate.id };
  }
  if (kind === 'folder') {
    const folderDescription = validateDescription(draftDescription);
    if (!folderDescription.ok) return folderDescription;
    return { ok: true, parent: parent.node, name, dataType: null, description: folderDescription.value, link: null, attachment: null };
  }
  const dataType = draftDataType;
  if (dataType !== 'file' && dataType !== 'web-link') return { ok: false, field: 'dataType', reason: 'data-type-required', message: 'Choose File or Web link.' };
  if (draftDescription === undefined || draftDescription === null || String(draftDescription).trim() === '') {
    return { ok: false, field: 'description', reason: 'description-required', message: 'Description is required for a data item.' };
  }
  const d = validateDescription(draftDescription);
  if (!d.ok) return d;
  let link = null;
  let attachment = null;
  if (dataType === 'web-link') {
    if (draftLink === undefined || draftLink === null || String(draftLink).trim() === '') return { ok: false, field: 'link', reason: 'link-required', message: 'Web link is required.' };
    const l = validateLink(draftLink);
    if (!l.ok) return l;
    link = l.value;
  } else {
    const a = validateAttachmentMetadata(draftAttachment);
    if (!a.ok) return a;
    attachment = a.attachment;
  }
  return { ok: true, parent: parent.node, name, dataType, description: d.value, link, attachment };
}

export function validateMetadataEdit({ tree, targetId, description, link, linkProvided = true, policyContext = undefined, maxNodes = undefined }) {
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const found = findNodeWithParent(tree, targetId);
  if (!found) return { ok: false, reason: 'stale-id', message: 'The data node no longer exists.' };
  if (found.node.kind !== 'file') return { ok: false, reason: 'data-only', message: 'Details can only be edited for a data node.' };
  const dataType = dataTypeOf(found.node);
  if ((dataType === 'file' || dataType === 'web-link')
      && (description === undefined || description === null || String(description).trim() === '')) {
    return { ok: false, field: 'description', reason: 'description-required', message: 'Description is required for a typed data item.' };
  }
  const d = validateDescription(description);
  if (!d.ok) return d;
  let l;
  if (dataType === 'file' || !linkProvided) {
    l = { ok: true, value: nodeLink(found.node) };
  } else {
    if (dataType === 'web-link' && (link === undefined || link === null || String(link).trim() === '')) {
      return { ok: false, field: 'link', reason: 'link-required', message: 'Web link is required.' };
    }
    l = validateLink(link);
    if (!l.ok) return l;
  }
  const oldDescription = nodeDescription(found.node);
  const oldLink = nodeLink(found.node);
  if (d.value === oldDescription && l.value === oldLink) {
    return { ok: true, noop: true, node: found.node, dataType, description: d.value, link: l.value };
  }
  return { ok: true, noop: false, node: found.node, dataType, description: d.value, link: l.value };
}
export function validateFolderEdit({ tree, targetId, draftName, draftDescription = null, policyContext = undefined, maxNodes = undefined }) {
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const found = findNodeWithParent(tree, targetId);
  if (!found || found.node.kind !== 'folder') return { ok: false, reason: 'folder-only', message: 'The folder no longer exists.' };
  const nameResult = validateName(draftName);
  if (!nameResult.ok) return nameResult;
  const name = nameResult.name;
  const duplicate = (found.parent?.children || []).find((sibling) => sibling.id !== targetId && nameKey(sibling.name) === nameKey(name));
  if (duplicate) return { ok: false, field: 'name', reason: 'duplicate-name', message: `A sibling named "${duplicate.name}" already exists.` };
  const d = validateDescription(draftDescription);
  if (!d.ok) return d;
  return { ok: true, node: found.node, name, description: d.value, noop: name === found.node.name && d.value === nodeDescription(found.node) };
}

export function validateDataEdit({ tree, targetId, draftName, description, link, linkProvided = false, policyContext = undefined, maxNodes = undefined }) {
  const admission = validateEditorAdmission(tree, { policyContext, maxNodes });
  if (!admission.ok) return admission;
  const found = findNodeWithParent(tree, targetId);
  if (!found || found.node.kind !== 'file') return { ok: false, reason: 'data-only', message: 'The data node no longer exists.' };
  const nameResult = validateName(draftName);
  if (!nameResult.ok) return nameResult;
  const name = nameResult.name;
  const duplicate = (found.parent?.children || []).find((sibling) => sibling.id !== targetId && nameKey(sibling.name) === nameKey(name));
  if (duplicate) return { ok: false, field: 'name', reason: 'duplicate-name', message: `A sibling named "${duplicate.name}" already exists.` };
  const dataType = dataTypeOf(found.node);
  if ((dataType === 'file' || dataType === 'web-link') && (description === undefined || description === null || String(description).trim() === '')) {
    return { ok: false, field: 'description', reason: 'description-required', message: 'Description is required for a typed data item.' };
  }
  const d = validateDescription(description);
  if (!d.ok) return d;
  let normalizedLink = nodeLink(found.node);
  if (dataType === 'web-link') {
    if (link === undefined || link === null || String(link).trim() === '') return { ok: false, field: 'link', reason: 'link-required', message: 'Web link is required.' };
    const l = validateLink(link);
    if (!l.ok) return l;
    normalizedLink = l.value;
  } else if (linkProvided) {
    return { ok: false, field: 'link', reason: 'link-not-editable', message: 'Link editing is only available for typed web links.' };
  }
  const previousLink = validateWebLink(nodeLink(found.node));
  const previousNormalizedLink = previousLink.ok ? previousLink.value : nodeLink(found.node);
  const linkUnchanged = dataType === 'web-link' ? normalizedLink === previousNormalizedLink : normalizedLink === nodeLink(found.node);
  return { ok: true, node: found.node, name, description: d.value, dataType, link: normalizedLink,
    noop: name === found.node.name && d.value === nodeDescription(found.node) && linkUnchanged };
}





