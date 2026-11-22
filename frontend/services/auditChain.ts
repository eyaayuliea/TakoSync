/**
 * S3 — SHA-256 hash-chained, append-only audit log
 * (Algorithm Architecture Specification §2.8, §3.7; US-AUDIT-02).
 *
 * The database appends and verifies the chain (private.append_audit_event,
 * public.verify_audit_chain). This module is the same canonical form and
 * VERIFY_AUDIT_CHAIN in TypeScript, so an exported checkpoint or a downloaded
 * slice of events can be checked outside the database. The SHA-256 function is
 * passed in (Node crypto in tests, any platform digest in the app), so this
 * module has no imports.
 *
 *   H_i = SHA-256(H_{i-1} || canonical(event_i)), hex; genesis H = 64 zeros.
 */

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

export type AuditEvent = {
  id: string;
  chain_scope: string;
  sequence_number: number;
  action: string;
  user_id: string | null;
  branch_id: string | null;
  description: string;
  /** ISO timestamp as returned by the database (any offset). */
  created_at: string;
  previous_hash: string;
  event_hash: string;
};

export type Sha256Hex = (text: string) => string | Promise<string>;

/**
 * UTC ISO-8601 with microseconds, as the database writes it. JavaScript dates
 * keep only milliseconds, so the microseconds are read from the string itself.
 */
export function canonicalAuditTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value.trim());
  if (!match) throw new RangeError(`Unrecognised audit timestamp: ${value}`);
  const [, date, time, fraction = '', zone = 'Z'] = match;
  const micros = fraction.padEnd(6, '0');
  const offset = zone === 'Z' ? 'Z' : zone.length === 3 ? `${zone}:00` : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const instant = new Date(`${date}T${time}.${micros.slice(0, 3)}${offset}`);
  if (!Number.isFinite(instant.getTime())) throw new RangeError(`Unrecognised audit timestamp: ${value}`);
  return `${instant.toISOString().slice(0, 19)}.${micros}Z`;
}

/** CANONICALIZE (§2.8): keys in alphabetical order, JSON escaping, null for missing values. */
export function canonicalAuditEvent(event: Omit<AuditEvent, 'previous_hash' | 'event_hash'>): string {
  const entries: [string, string | number | null][] = [
    ['action', event.action],
    ['actor_id', event.user_id],
    ['branch_id', event.branch_id],
    ['chain_scope', event.chain_scope],
    ['description', event.description],
    ['event_id', event.id],
    ['event_timestamp', canonicalAuditTimestamp(event.created_at)],
    ['sequence_number', event.sequence_number],
  ];
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',')}}`;
}

export async function auditEventHash(previousHash: string, canonical: string, sha256: Sha256Hex): Promise<string> {
  return (await sha256(previousHash + canonical)).toLowerCase();
}

export type AuditVerification =
  | { status: 'VALID'; verifiedEventCount: number; finalHash: string; firstInvalidSequence: null }
  | {
      status: 'INVALID';
      reason: 'SEQUENCE_GAP' | 'PREVIOUS_HASH_MISMATCH' | 'EVENT_HASH_MISMATCH' | 'CHECKPOINT_MISMATCH';
      firstInvalidSequence: number;
      expectedHash?: string;
      storedHash?: string;
      verifiedEventCount: number;
    };

/**
 * VERIFY_AUDIT_CHAIN (§3.7) over one chain's events. Pass a checkpoint to start
 * after it, and/or an exported checkpoint to compare the hash at its sequence.
 */
export async function verifyAuditEvents(input: {
  events: readonly AuditEvent[];
  sha256: Sha256Hex;
  from?: { sequence: number; hash: string };
  expect?: { sequence: number; hash: string };
}): Promise<AuditVerification> {
  let previous = input.from?.hash ?? AUDIT_GENESIS_HASH;
  let expectedSequence = (input.from?.sequence ?? 0) + 1;
  let count = 0;
  const events = [...input.events]
    .filter((event) => event.sequence_number >= expectedSequence)
    .sort((left, right) => left.sequence_number - right.sequence_number);
  for (const event of events) {
    if (event.sequence_number !== expectedSequence) {
      return { status: 'INVALID', reason: 'SEQUENCE_GAP', firstInvalidSequence: expectedSequence, verifiedEventCount: count };
    }
    if (event.previous_hash !== previous) {
      return {
        status: 'INVALID', reason: 'PREVIOUS_HASH_MISMATCH', firstInvalidSequence: event.sequence_number,
        expectedHash: previous, storedHash: event.previous_hash, verifiedEventCount: count,
      };
    }
    const expected = await auditEventHash(previous, canonicalAuditEvent(event), input.sha256);
    if (event.event_hash !== expected) {
      return {
        status: 'INVALID', reason: 'EVENT_HASH_MISMATCH', firstInvalidSequence: event.sequence_number,
        expectedHash: expected, storedHash: event.event_hash, verifiedEventCount: count,
      };
    }
    previous = event.event_hash;
    count += 1;
    if (input.expect && event.sequence_number === input.expect.sequence && event.event_hash !== input.expect.hash) {
      return {
        status: 'INVALID', reason: 'CHECKPOINT_MISMATCH', firstInvalidSequence: event.sequence_number,
        expectedHash: input.expect.hash, storedHash: event.event_hash, verifiedEventCount: count,
      };
    }
    expectedSequence += 1;
  }
  return { status: 'VALID', verifiedEventCount: count, finalHash: previous, firstInvalidSequence: null };
}

export type AuditCheckpoint = { chainScope: string; sequenceNumber: number; eventHash: string; createdAt: string };

/** Plain text the owner sends outside the database (share sheet / e-mail) to keep as the checkpoint. */
export function formatAuditCheckpointExport(
  checkpoints: readonly AuditCheckpoint[],
  branchName: (scope: string) => string = (scope) => scope,
): string {
  const created = checkpoints[0]?.createdAt ?? new Date().toISOString();
  return [
    'TakoSync audit checkpoint',
    `Created ${created}`,
    'Keep this message. If any line stops matching, audit history was changed.',
    ...checkpoints.map((checkpoint) =>
      `${branchName(checkpoint.chainScope)} [${checkpoint.chainScope}] #${checkpoint.sequenceNumber} ${checkpoint.eventHash}`),
  ].join('\n');
}

/** Reads the lines written by formatAuditCheckpointExport back into checkpoints. */
export function parseAuditCheckpointExport(text: string): { chainScope: string; sequenceNumber: number; eventHash: string }[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = /\[([^\]]+)\]\s+#(\d+)\s+([0-9a-f]{64})\s*$/.exec(line.trim());
    return match ? [{ chainScope: match[1], sequenceNumber: Number(match[2]), eventHash: match[3] }] : [];
  });
}
