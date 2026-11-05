import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import { decodeBackup } from '../../../src/engine/hypertree/persistence/backup.js'; import { FREE_POLICY_CONTEXT, createInternalPolicyContext } from '../../../src/engine/hypertree/edition/index.js'; import { validateRename, validateAddChild } from '../../../src/engine/hypertree/editor/validation.js';
const paid=createInternalPolicyContext({edition:'paid'}); const load=async n=>decodeBackup(new Blob([readFileSync(new URL('../../fixtures/large-map/'+n,import.meta.url))]),{policyContext:paid});
const t300=(await load('FileOrbit-300.orbit')).tree; const t301=(await load('FileOrbit-301.orbit')).tree; const t1000=(await load('FileOrbit-1000.orbit')).tree;
test('free 300 rename allowed',()=>assert.equal(validateRename({tree:t300,targetId:'f-0',draftName:'x.txt',policyContext:FREE_POLICY_CONTEXT}).ok,true));
test('free 301 rejected',()=>assert.equal(validateRename({tree:t301,targetId:'f-0',draftName:'x.txt',policyContext:FREE_POLICY_CONTEXT}).ok,false));
test('paid 1000 rename allowed',()=>assert.equal(validateRename({tree:t1000,targetId:'f-0',draftName:'x.txt',policyContext:paid}).ok,true));
test('paid 1000 add child rejected atomically',()=>{const r=validateAddChild({tree:t1000,parentId:'cat-1',kind:'file',draftName:'new.txt',draftDataType:'legacy',policyContext:paid});assert.equal(r.ok,false);});

