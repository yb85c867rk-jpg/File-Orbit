import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLink, MAX_LINK_CODE_POINTS, validateDataEdit, validateAddChild } from '../../../src/engine/hypertree/editor/validation.js';
import { validateWebLink } from '../../../src/engine/hypertree/shared/web-link.js';

function node(id, kind, name, children, data = {}) {
  return { id, name, kind, data: Object.assign(Object.create(null), data), ...(children ? { children } : {}) };
}
function tree() {
  return node('r', 'folder', 'Root', [
    node('a', 'folder', 'Alpha', [node('x', 'file', 'Data', null, { dataType: 'file', description: 'old', attachmentId: 'att' })])
  ]);
}
test('domain-style links gain https while explicit schemes are preserved', () => {
  assert.deepEqual(validateLink('www.google.com'), { ok: true, value: 'https://www.google.com/' });
  assert.deepEqual(validateLink('google.com'), { ok: true, value: 'https://google.com/' });
  assert.deepEqual(validateLink('google.com/search?q=test'), { ok: true, value: 'https://google.com/search?q=test' });
  assert.deepEqual(validateLink('  https://example.com/a  '), { ok: true, value: 'https://example.com/a' });
  assert.deepEqual(validateLink('http://example.com'), { ok: true, value: 'http://example.com/' });
  assert.equal(validateLink('').value, null);
  assert.equal(validateLink('   ').value, null);
});
test('unsafe and ambiguous links are rejected deterministically', () => {
  for (const value of [
    'javascript:alert(1)', 'data:text/plain,hello', 'ftp://example.com', 'mailto:user@example.com',
    'user:password@example.com', '//example.com', 'https://', 'https:///example.com',
    'not a web address', 'example.com:8080', 'localhost', '/local/path',
    'https://example.com/a b', 'https://example.com/a\nb', 'https://example.com\\evil'
  ]) {
    assert.equal(validateLink(value).ok, false, value);
  }
});
test('IDN labels use deterministic WHATWG IDNA serialization', () => {
  assert.deepEqual(validateWebLink('münich.de'), { ok: true, value: 'https://xn--mnich-kva.de/' });
  assert.deepEqual(validateWebLink('例え.テスト'), { ok: true, value: 'https://xn--r8jz45g.xn--zckzah/' });
});
test('input and final normalized length are bounded in code points', () => {
  const prefix = 'https://example.com/';
  const exact = prefix + 'a'.repeat(MAX_LINK_CODE_POINTS - prefix.length);
  assert.equal(validateWebLink(exact).ok, true);
  const tooLong = exact + 'a';
  assert.equal(validateWebLink(tooLong).reason, 'link-too-long');
  assert.equal(validateWebLink('a'.repeat(MAX_LINK_CODE_POINTS + 1)).reason, 'link-too-long');
});
test('typed web data requires a link while legacy links stay optional', () => {
  const source = tree();
  source.children[0].children[0].data = { dataType: 'web-link', description: 'web' };
  assert.equal(validateDataEdit({ tree: source, targetId: 'x', draftName: 'Data', description: 'web', link: '' }).reason, 'link-required');
  const legacy = tree();
  legacy.children[0].children[0].data = { description: '', link: '' };
  assert.equal(validateDataEdit({ tree: legacy, targetId: 'x', draftName: 'Data', description: '', link: '' }).ok, true);
  assert.equal(validateLink('google.com/path@name').ok, true);
  assert.equal(validateLink('google.com/search?q=https://example.com').ok, true);
});
test('equivalent normalized edit is a no-op', () => {
  const source = tree();
  source.children[0].children[0].data = { dataType: 'web-link', description: 'web', link: 'https://example.com/' };
  const result = validateDataEdit({ tree: source, targetId: 'x', draftName: 'Data', description: 'web', link: 'https://example.com/' });
  assert.equal(result.ok, true);
  assert.equal(result.noop, true);
  source.children[0].children[0].data.link = 'https://example.com';
  const slashless = validateDataEdit({ tree: source, targetId: 'x', draftName: 'Data', description: 'web', link: 'https://example.com' });
  assert.equal(slashless.noop, true);
});test('non-web edits cannot modify link and preserve existing link metadata', () => {
  const source = tree();
  source.children[0].children[0].data = { description: 'legacy', link: 'https://keep.example/a' };
  const preserved = validateDataEdit({ tree: source, targetId: 'x', draftName: 'Renamed', description: 'changed', link: null, linkProvided: false });
  assert.equal(preserved.ok, true);
  assert.equal(preserved.link, 'https://keep.example/a');
  assert.equal(validateDataEdit({ tree: source, targetId: 'x', draftName: 'Renamed', description: 'changed', link: 'https://other.example', linkProvided: true }).reason, 'link-not-editable');
});

