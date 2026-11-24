import assert from 'node:assert/strict';
import test from 'node:test';
import { installRandomUuid, uuidFromBytes } from './randomUuid.ts';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('16 bytes become a version-4 UUID', () => {
  assert.equal(uuidFromBytes(new Uint8Array(16)), '00000000-0000-4000-8000-000000000000');
  assert.equal(uuidFromBytes(new Uint8Array(16).fill(255)), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('a browser without randomUUID (page opened by network address) gets one', () => {
  const scope = { crypto: { getRandomValues: (bytes) => globalThis.crypto.getRandomValues(bytes) } };
  installRandomUuid(scope);
  const ids = new Set(Array.from({ length: 200 }, () => scope.crypto.randomUUID()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, V4);
});

test('an existing randomUUID is left alone', () => {
  const original = () => 'kept';
  const scope = { crypto: { randomUUID: original } };
  installRandomUuid(scope);
  assert.equal(scope.crypto.randomUUID, original);
});

test('no crypto object at all still gives valid ids', () => {
  const scope = {};
  installRandomUuid(scope);
  assert.match(scope.crypto.randomUUID(), V4);
});
