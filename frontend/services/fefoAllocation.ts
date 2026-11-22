/**
 * A1 — Branch-scoped FEFO lot allocation with a min-heap priority queue
 * (Algorithm Architecture Specification §2.2–2.4, §3.2–3.4, US-FEFO-01).
 *
 * The database function `private.fefo_allocate` is the implementation that
 * actually moves stock; this module is the same algorithm in TypeScript so the
 * apps can preview allocations, colour lots and be unit tested. Both use:
 *   - eligibility: same branch and item, status `active`, quantity > 0, and not
 *     expired. A lot is usable through the end of its expiration date in
 *     Asia/Manila, so it is expired once now >= expiration_date 24:00 +08:00.
 *     A lot with no expiration date never expires and is used last.
 *   - order key: (expiration_date, received_date, created_at, id), smallest first.
 *   - result: allocations, total allocated, shortfall, and a status of
 *     COMPLETED, PARTIAL or INSUFFICIENT_STOCK. Nothing goes below zero.
 * This module has no imports so it can be unit tested directly.
 */

export type LotStatus = 'active' | 'quarantined' | 'damaged' | 'reserved';
export type AllocationStatus = 'COMPLETED' | 'PARTIAL' | 'INSUFFICIENT_STOCK';
export type LotExpiryClass = 'GREEN' | 'YELLOW' | 'RED' | 'EXPIRED' | 'NO_EXPIRY';

export type FefoLot = {
  id: string;
  branchId: string;
  ingredientId: string;
  /** YYYY-MM-DD, or null when the item does not expire. */
  expirationDate: string | null;
  /** YYYY-MM-DD delivery date. */
  receivedDate: string;
  /** ISO timestamp the lot was recorded; second tie-breaker. */
  createdAt: string;
  quantityRemaining: number;
  status?: LotStatus;
};

export type FefoAllocation = { lotId: string; quantity: number; remainingAfter: number };

export type FefoCertificate = {
  branchId: string;
  ingredientId: string;
  requested: number;
  allocated: number;
  shortfall: number;
  status: AllocationStatus;
  allocations: FefoAllocation[];
  allocatedAt: string;
};

export const LOT_WARNING_HOURS_DEFAULT = 48;
export const LOT_CRITICAL_HOURS_DEFAULT = 24;

const MANILA_OFFSET_MS = 8 * 3_600_000;
const QUANTITY_SCALE = 1000; // quantities are numeric(12, 3)

/** Instant a lot stops being usable: the end of its expiration date in Asia/Manila. */
export function lotExpiresAt(expirationDate: string): number {
  const startOfDayUtc = Date.parse(`${expirationDate.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(startOfDayUtc)) {
    throw new RangeError('Expiration dates must use a valid YYYY-MM-DD date.');
  }
  return startOfDayUtc + 86_400_000 - MANILA_OFFSET_MS;
}

export function isLotExpired(lot: Pick<FefoLot, 'expirationDate'>, now: Date): boolean {
  return lot.expirationDate != null && now.getTime() >= lotExpiresAt(lot.expirationDate);
}

/** Compare two lots by the FEFO key; a negative result means `a` is used first. */
export function compareFefoLots(a: FefoLot, b: FefoLot): number {
  if (a.expirationDate !== b.expirationDate) {
    if (a.expirationDate == null) return 1;
    if (b.expirationDate == null) return -1;
    return a.expirationDate < b.expirationDate ? -1 : 1;
  }
  if (a.receivedDate !== b.receivedDate) return a.receivedDate < b.receivedDate ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** Binary min-heap: build O(N), push and pop O(log N). */
export class MinHeap<T> {
  private readonly items: T[];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number, initial: readonly T[] = []) {
    this.compare = compare;
    this.items = [...initial];
    for (let index = (this.items.length >> 1) - 1; index >= 0; index -= 1) this.siftDown(index);
  }

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.items[index], this.items[parent]) >= 0) return;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < this.items.length && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
      if (smallest === index) return;
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

export function isLotEligible(
  lot: FefoLot,
  scope: { branchId: string; ingredientId: string },
  now: Date,
  options: { includeExpired?: boolean } = {},
): boolean {
  return (
    lot.branchId === scope.branchId &&
    lot.ingredientId === scope.ingredientId &&
    (lot.status ?? 'active') === 'active' &&
    lot.quantityRemaining > 0 &&
    (options.includeExpired === true || !isLotExpired(lot, now))
  );
}

const toUnits = (value: number) => Math.round(value * QUANTITY_SCALE);
const fromUnits = (value: number) => value / QUANTITY_SCALE;

/**
 * FEFO_ALLOCATE (§3.3). Pure: returns the certificate and leaves the input lots
 * untouched. `includeExpired` is only for recording spoilage of expired stock,
 * which should come out of the expired lots.
 */
export function fefoAllocate(input: {
  branchId: string;
  ingredientId: string;
  quantity: number;
  lots: readonly FefoLot[];
  now?: Date;
  includeExpired?: boolean;
}): FefoCertificate {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new RangeError('The quantity to allocate must be greater than zero.');
  }
  const now = input.now ?? new Date();
  const scope = { branchId: input.branchId, ingredientId: input.ingredientId };
  const heap = new MinHeap(
    compareFefoLots,
    input.lots.filter((lot) => isLotEligible(lot, scope, now, { includeExpired: input.includeExpired })),
  );

  const requested = toUnits(input.quantity);
  let remaining = requested;
  const allocations: FefoAllocation[] = [];
  while (remaining > 0 && heap.size > 0) {
    const lot = heap.pop() as FefoLot;
    const available = toUnits(lot.quantityRemaining);
    const take = Math.min(remaining, available);
    if (take > 0) {
      allocations.push({ lotId: lot.id, quantity: fromUnits(take), remainingAfter: fromUnits(available - take) });
      remaining -= take;
    }
    // A lot is popped only once per allocation: it is either emptied or it covered
    // the rest of the request, so there is nothing to push back.
  }

  const allocated = requested - remaining;
  return {
    ...scope,
    requested: fromUnits(requested),
    allocated: fromUnits(allocated),
    shortfall: fromUnits(remaining),
    status: remaining === 0 ? 'COMPLETED' : allocated > 0 ? 'PARTIAL' : 'INSUFFICIENT_STOCK',
    allocations,
    allocatedAt: now.toISOString(),
  };
}

/** Use the owner's configured hours when valid, otherwise the defaults; red never exceeds the window. */
export function resolveLotExpiryWindow(configured?: {
  warningHours?: number | null;
  criticalHours?: number | null;
}): { warningHours: number; criticalHours: number } {
  const valid = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;
  const warningHours = valid(configured?.warningHours) ? configured.warningHours : LOT_WARNING_HOURS_DEFAULT;
  const critical = valid(configured?.criticalHours) ? configured.criticalHours : LOT_CRITICAL_HOURS_DEFAULT;
  return { warningHours, criticalHours: Math.min(critical, warningHours) };
}

/** CLASSIFY_EXPIRY (§2.4): hours left r; r <= 0 EXPIRED, r <= red RED, r <= window YELLOW, else GREEN. */
export function classifyLotExpiry(
  lot: Pick<FefoLot, 'expirationDate'>,
  now: Date = new Date(),
  configured?: { warningHours?: number | null; criticalHours?: number | null },
): LotExpiryClass {
  if (lot.expirationDate == null) return 'NO_EXPIRY';
  const { warningHours, criticalHours } = resolveLotExpiryWindow(configured);
  const hoursLeft = (lotExpiresAt(lot.expirationDate) - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) return 'EXPIRED';
  if (hoursLeft <= criticalHours) return 'RED';
  if (hoursLeft <= warningHours) return 'YELLOW';
  return 'GREEN';
}

/** Hours until the lot expires (negative once expired), rounded down; null when it never expires. */
export function lotHoursLeft(lot: Pick<FefoLot, 'expirationDate'>, now: Date = new Date()): number | null {
  if (lot.expirationDate == null) return null;
  return Math.floor((lotExpiresAt(lot.expirationDate) - now.getTime()) / 3_600_000);
}

export const LOT_EXPIRY_LABELS: Record<LotExpiryClass, string> = {
  GREEN: 'Good',
  YELLOW: 'Expires within 48 hours',
  RED: 'Use first — expires within 24 hours',
  EXPIRED: 'Expired — record as waste',
  NO_EXPIRY: 'No expiration date',
};

export function lotExpiryLabel(
  expiry: LotExpiryClass,
  configured?: { warningHours?: number | null; criticalHours?: number | null },
): string {
  const { warningHours, criticalHours } = resolveLotExpiryWindow(configured);
  if (expiry === 'YELLOW') return `Expires within ${warningHours} hours`;
  if (expiry === 'RED') return `Use first — expires within ${criticalHours} hours`;
  return LOT_EXPIRY_LABELS[expiry];
}

export type LotDisplayInput = {
  id: string;
  expirationDate: string | null;
  receivedDate: string;
  createdAt?: string;
  quantityRemaining: number;
  usable?: boolean;
};

export type LotDisplay<T extends LotDisplayInput> = T & {
  expiry: LotExpiryClass;
  expiryLabel: string;
  /** The lot FEFO takes from next: the first usable, unexpired lot with stock. */
  useFirst: boolean;
  held: boolean;
};

/**
 * Lots in FEFO order with their colour and the one to use next, for the staff
 * and owner lot lists (AC-FEFO-01-11). Empty lots go last.
 */
export function describeLotsForDisplay<T extends LotDisplayInput>(
  lots: readonly T[],
  now: Date = new Date(),
  window?: { warningHours?: number | null; criticalHours?: number | null },
): LotDisplay<T>[] {
  const keyed = lots.map((lot) => ({
    lot,
    key: {
      id: lot.id,
      branchId: '',
      ingredientId: '',
      expirationDate: lot.expirationDate,
      receivedDate: lot.receivedDate,
      createdAt: lot.createdAt ?? '',
      quantityRemaining: lot.quantityRemaining,
    } satisfies FefoLot,
  }));
  keyed.sort((left, right) => {
    const emptyOrder = Number(left.lot.quantityRemaining <= 0) - Number(right.lot.quantityRemaining <= 0);
    return emptyOrder !== 0 ? emptyOrder : compareFefoLots(left.key, right.key);
  });
  let nextFound = false;
  return keyed.map(({ lot }) => {
    const expiry = classifyLotExpiry(lot, now, window);
    const held = lot.usable === false;
    const useFirst = !nextFound && !held && lot.quantityRemaining > 0 && expiry !== 'EXPIRED';
    if (useFirst) nextFound = true;
    return {
      ...lot,
      expiry,
      expiryLabel: held ? 'On hold — not used for sales' : lotExpiryLabel(expiry, window),
      useFirst,
      held,
    };
  });
}

/** Badge tone for a lot colour: red for expired or under the red window, yellow for the warning window. */
export function lotExpiryTone(expiry: LotExpiryClass): 'low' | 'warning' | 'good' | 'neutral' {
  if (expiry === 'EXPIRED' || expiry === 'RED') return 'low';
  if (expiry === 'YELLOW') return 'warning';
  if (expiry === 'GREEN') return 'good';
  return 'neutral';
}
