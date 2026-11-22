import assert from 'node:assert/strict';
import test from 'node:test';
import { functionErrorMessage } from './functionErrors.ts';

const httpError = (status, body) => ({
  name: 'FunctionsHttpError',
  context: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
});

test('OW-27 c3–c4: a 4xx refusal shows the function\'s own message', async () => {
  assert.equal(
    await functionErrorMessage(httpError(409, { ok: false, error: 'Each branch can have at most two Staff accounts.' }), 'Unable to save Staff account.'),
    'Each branch can have at most two Staff accounts.',
  );
  assert.equal(
    await functionErrorMessage(httpError(400, { ok: false, error: 'An assigned branch is required.' }), 'x'),
    'An assigned branch is required.',
  );
});

test('server errors, network errors and unreadable bodies keep the generic message', async () => {
  assert.equal(await functionErrorMessage(httpError(500, { ok: false, error: 'private database detail' }), 'Generic.'), 'Generic.');
  assert.equal(await functionErrorMessage(httpError(409, 'not json'), 'Generic.'), 'Generic.');
  assert.equal(await functionErrorMessage(httpError(409, { ok: false }), 'Generic.'), 'Generic.');
  assert.equal(await functionErrorMessage(new TypeError('Failed to fetch'), 'Generic.'), 'Generic.');
  assert.equal(await functionErrorMessage(null, 'Generic.'), 'Generic.');
});

test('the response can still be read by the caller afterwards', async () => {
  const error = httpError(409, { ok: false, error: 'Taken.' });
  assert.equal(await functionErrorMessage(error, 'x'), 'Taken.');
  assert.deepEqual(await error.context.json(), { ok: false, error: 'Taken.' });
});
