import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ORBIT_NAME_CODE_POINTS,
  orbitNameKey,
  findOrbitNameCollision,
  isOrbitMapFilename,
  normalizeOrbitMapFilename,
  validateOrbitDirectoryName
} from '../../../src/engine/hypertree/orbit/names.js';

test('Orbit directory names accept ordinary and Unicode names', () => {
  for (const name of ['Maps', 'Project Orbit', '한글 지도', 'notes.v1']) {
    const result = validateOrbitDirectoryName(name);
    assert.equal(result.ok, true, name);
    assert.equal(result.name, name);
    assert.equal(result.key, orbitNameKey(name));
  }
});

test('Orbit directory names reject traversal, separators, reserved and invalid names', () => {
  const cases = [
    ['', 'name-required'], ['   ', 'name-required'], [null, 'name-required'],
    ['../escape', 'name-separator'], ['..\\escape', 'name-separator'], ['a/b', 'name-separator'],
    ['.', 'name-traversal'], ['..', 'name-traversal'],
    ['CON', 'name-reserved'], ['con.txt', 'name-reserved'], ['LPT1', 'name-reserved'], ['COM9', 'name-reserved'],
    ['bad?name', 'name-invalid-character'], ['bad*name', 'name-invalid-character'],
    ['trailing.', 'name-trailing'], ['line\nbreak', 'name-control'],
    ['x'.repeat(MAX_ORBIT_NAME_CODE_POINTS + 1), 'name-too-long']
  ];
  for (const [name, reason] of cases) {
    const result = validateOrbitDirectoryName(name);
    assert.equal(result.ok, false, String(name));
    assert.equal(result.reason, reason, String(name));
  }
});

test('Orbit map filenames normalize .orbit and reserved punctuation', () => {
  assert.deepEqual(
    (({ ok, filename, base }) => ({ ok, filename, base }))(normalizeOrbitMapFilename('My Map')),
    { ok: true, filename: 'My Map.orbit', base: 'My Map' }
  );
  for (const [input, filename] of [
    ['My Map.orbit', 'My Map.orbit'],
    ['My Map.orbit.orbit', 'My Map.orbit'],
    ['Report.orbit', 'Report.orbit'],
    ['Report.orbit.orbit', 'Report.orbit'],
    ['A:B', 'A B.orbit'],
    ['A?B*C', 'A B C.orbit']
  ]) {
    const result = normalizeOrbitMapFilename(input);
    assert.equal(result.ok, true, input);
    assert.equal(result.filename, filename, input);
  }
  assert.equal(normalizeOrbitMapFilename('A:B').adjusted, true);
  assert.equal(normalizeOrbitMapFilename('Legacy.map').filename, 'Legacy.map.orbit');
  assert.equal(normalizeOrbitMapFilename('Legacy.fileorbit').filename, 'Legacy.fileorbit.orbit');
});

test('Orbit map filenames reject traversal, separators, reserved and empty names', () => {
  for (const [input, reason] of [
    ['', 'name-required'], ['   ', 'name-required'], ['.orbit', 'name-required'],
    ['../x', 'name-separator'], ['a/b', 'name-separator'], ['a\\b', 'name-separator'],
    ['.', 'name-traversal'], ['..', 'name-traversal'],
    ['CON', 'name-reserved'], ['CON.orbit', 'name-reserved'], ['AUX.txt', 'name-reserved'],
    ['name.', 'name-trailing'], ['bad\u0000name', 'name-control']
  ]) {
    const result = normalizeOrbitMapFilename(input);
    assert.equal(result.ok, false, input);
    assert.equal(result.reason, reason, input);
  }
});

test('Orbit collision keys are NFKC case-insensitive and conservative', () => {
  assert.equal(orbitNameKey('  Maps.MAP '), 'maps.map');
  assert.equal(findOrbitNameCollision('MAPS.orbit', ['other.orbit', 'maps.orbit']), 'maps.orbit');
  assert.equal(findOrbitNameCollision('maps.orbit', ['other.orbit']), null);
  assert.equal(findOrbitNameCollision('Ａ.orbit', ['a.orbit']), 'a.orbit'); // NFKC fullwidth A collides
});

test('Orbit map extension detection is case-insensitive and rejects .map/.fileorbit', () => {
  assert.equal(isOrbitMapFilename('a.orbit'), true);
  assert.equal(isOrbitMapFilename('a.ORBIT'), true);
  assert.equal(isOrbitMapFilename('a.map'), false);
  assert.equal(isOrbitMapFilename('a.fileorbit'), false);
  assert.equal(isOrbitMapFilename('map'), false);
});
