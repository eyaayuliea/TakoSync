import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  AUDIT_GENESIS_HASH,
  auditEventHash,
  canonicalAuditEvent,
  canonicalAuditTimestamp,
  formatAuditCheckpointExport,
  parseAuditCheckpointExport,
  verifyAuditEvents,
} from './auditChain.ts';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// The same vector the database test checks (computed by Postgres and by Python hashlib).
const VECTOR = {
  id: '00000000-0000-4000-8000-0000000000a1',
  chain_scope: 'global',
  sequence_number: 1,
  action: 'test.action',
  user_id: null,
  branch_id: null,
  description: 'Hello "Tako" ñ\n',
  created_at: '2026-11-22 10:00:00.123456+08',
};

test('AC-AUDIT-02-01: canonical JSON matches the database byte for byte', () => {
  assert.equal(
    canonicalAuditEvent(VECTOR),
    '{"action":"test.action","actor_id":null,"branch_id":null,"chain_scope":"global","description":"Hello \\"Tako\\" ñ\\n","event_id":"00000000-0000-4000-8000-0000000000a1","event_timestamp":"2026-11-22T02:00:00.123456Z","sequence_number":1}',
  );
});

test('AC-AUDIT-02-02: SHA-256(previous || canonical) matches the database digest', async () => {
  assert.equal(
    await auditEventHash(AUDIT_GENESIS_HASH, canonicalAuditEvent(VECTOR), sha256),
    'e06f0b3b2a97d69093354e11e702c7ea987cfadf9359a764e90b50cc8297cfcf',
  );
});

test('timestamps from the API keep microseconds and become UTC', () => {
  assert.equal(canonicalAuditTimestamp('2026-11-22T02:00:00.1+00:00'), '2026-11-22T02:00:00.100000Z');
  assert.equal(canonicalAuditTimestamp('2026-11-22T10:00:00.123456+08:00'), '2026-11-22T02:00:00.123456Z');
  assert.equal(canonicalAuditTimestamp('2026-11-22T00:30:00Z'), '2026-11-22T00:30:00.000000Z');
  assert.equal(canonicalAuditTimestamp('2026-11-22 01:00:00+0800'), '2026-11-21T17:00:00.000000Z');
  assert.throws(() => canonicalAuditTimestamp('yesterday'), RangeError);
});

async function buildChain(count) {
  const events = [];
  let previous = AUDIT_GENESIS_HASH;
  for (let sequence = 1; sequence <= count; sequence += 1) {
    const event = {
      id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
      chain_scope: 'branch-1',
      sequence_number: sequence,
      action: 'inventory.usage',
      user_id: 'user-1',
      branch_id: 'branch-1',
      description: `usage ${sequence}`,
      created_at: `2026-11-22T02:00:0${sequence % 10}.000001Z`,
      previous_hash: previous,
    };
    event.event_hash = await auditEventHash(previous, canonicalAuditEvent(event), sha256);
    previous = event.event_hash;
    events.push(event);
  }
  return events;
}

test('AC-AUDIT-02-06: an untouched chain verifies from genesis or from a checkpoint', async () => {
  const events = await buildChain(5);
  assert.deepEqual(await verifyAuditEvents({ events, sha256 }), {
    status: 'VALID', verifiedEventCount: 5, finalHash: events[4].event_hash, firstInvalidSequence: null,
  });
  const fromCheckpoint = await verifyAuditEvents({ events, sha256, from: { sequence: 3, hash: events[2].event_hash } });
  assert.equal(fromCheckpoint.status, 'VALID');
  assert.equal(fromCheckpoint.verifiedEventCount, 2);
});

test('AC-AUDIT-02-07: edits, gaps and broken links are reported at their position', async () => {
  const edited = await buildChain(5);
  edited[2] = { ...edited[2], description: 'changed' };
  const result = await verifyAuditEvents({ events: edited, sha256 });
  assert.equal(result.status, 'INVALID');
  assert.equal(result.reason, 'EVENT_HASH_MISMATCH');
  assert.equal(result.firstInvalidSequence, 3);
  assert.equal(result.storedHash, edited[2].event_hash);

  const gap = (await buildChain(5)).filter((event) => event.sequence_number !== 4);
  assert.deepEqual(
    [(await verifyAuditEvents({ events: gap, sha256 })).reason, (await verifyAuditEvents({ events: gap, sha256 })).firstInvalidSequence],
    ['SEQUENCE_GAP', 4],
  );

  const relinked = await buildChain(5);
  relinked[3] = { ...relinked[3], previous_hash: AUDIT_GENESIS_HASH };
  assert.equal((await verifyAuditEvents({ events: relinked, sha256 })).reason, 'PREVIOUS_HASH_MISMATCH');
});

test('AC-AUDIT-02-11: an exported checkpoint catches a fully recomputed chain', async () => {
  const original = await buildChain(4);
  const exported = { sequence: 4, hash: original[3].event_hash };
  // Rewrite event 2 and recompute every hash after it, as a database administrator could.
  const rewritten = [];
  let previous = AUDIT_GENESIS_HASH;
  for (const event of original) {
    const next = { ...event, description: event.sequence_number === 2 ? 'rewritten' : event.description, previous_hash: previous };
    next.event_hash = await auditEventHash(previous, canonicalAuditEvent(next), sha256);
    previous = next.event_hash;
    rewritten.push(next);
  }
  assert.equal((await verifyAuditEvents({ events: rewritten, sha256 })).status, 'VALID');
  const checked = await verifyAuditEvents({ events: rewritten, sha256, expect: exported });
  assert.equal(checked.status, 'INVALID');
  assert.equal(checked.reason, 'CHECKPOINT_MISMATCH');
});

test('checkpoint exports round-trip', () => {
  const text = formatAuditCheckpointExport([
    { chainScope: 'global', sequenceNumber: 12, eventHash: 'a'.repeat(64), createdAt: '2026-11-22T02:00:00Z' },
    { chainScope: 'branch-1', sequenceNumber: 340, eventHash: 'b'.repeat(64), createdAt: '2026-11-22T02:00:00Z' },
  ], (scope) => (scope === 'global' ? 'Accounts & settings' : 'Branch 1'));
  assert.match(text, /^TakoSync audit checkpoint/);
  assert.deepEqual(parseAuditCheckpointExport(text), [
    { chainScope: 'global', sequenceNumber: 12, eventHash: 'a'.repeat(64) },
    { chainScope: 'branch-1', sequenceNumber: 340, eventHash: 'b'.repeat(64) },
  ]);
});
