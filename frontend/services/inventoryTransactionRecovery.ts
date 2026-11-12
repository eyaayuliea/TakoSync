export type RetrySafeInventoryTransaction = {
  ingredientId: string;
  type: 'stock_in' | 'stock_out' | 'usage' | 'waste' | 'spoilage';
  quantity: number;
  unit: string;
  transactionDate: string;
  reason: string;
  notes: string;
  batchReference: string | null;
  expirationDate: string | null;
};

export type PendingInventoryTransaction = {
  requestId: string;
  actorId: string;
  actorLabel: string;
  branchId: string;
  branchLabel: string;
  transactionType: RetrySafeInventoryTransaction['type'];
  transactions: RetrySafeInventoryTransaction[];
  createdAt: string;
  status: 'pending' | 'processing';
  reference: string | null;
};

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const PENDING_INVENTORY_TRANSACTIONS_STORAGE_KEY = 'takosync.pendingInventoryTransactions.v1';

function isPendingTransaction(value: unknown): value is PendingInventoryTransaction {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<PendingInventoryTransaction>;
  return typeof request.requestId === 'string'
    && typeof request.actorId === 'string'
    && typeof request.actorLabel === 'string'
    && typeof request.branchId === 'string'
    && typeof request.branchLabel === 'string'
    && ['stock_in', 'stock_out', 'usage', 'waste', 'spoilage'].includes(request.transactionType ?? '')
    && Array.isArray(request.transactions)
    && request.transactions.length > 0
    && request.transactions.every((transaction) =>
      transaction !== null &&
      typeof transaction === 'object' &&
      typeof transaction.ingredientId === 'string' &&
      ['stock_in', 'stock_out', 'usage', 'waste', 'spoilage'].includes(transaction.type) &&
      Number.isFinite(transaction.quantity) &&
      transaction.quantity > 0 &&
      typeof transaction.unit === 'string' &&
      typeof transaction.transactionDate === 'string' &&
      typeof transaction.reason === 'string' &&
      typeof transaction.notes === 'string' &&
      (transaction.batchReference === null || typeof transaction.batchReference === 'string') &&
      (transaction.expirationDate === null || typeof transaction.expirationDate === 'string'),
    )
    && request.transactions.every((transaction) => transaction.type === request.transactionType)
    && typeof request.createdAt === 'string'
    && (request.status === 'pending' || request.status === 'processing')
    && (request.reference === null || typeof request.reference === 'string');
}

export function sameInventoryTransactionPayload(
  left: RetrySafeInventoryTransaction[],
  right: RetrySafeInventoryTransaction[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameInventoryTransactionWorkflow(
  left: RetrySafeInventoryTransaction['type'],
  right: RetrySafeInventoryTransaction['type'],
) {
  const workflow = (type: RetrySafeInventoryTransaction['type']) =>
    type === 'waste' || type === 'spoilage'
      ? 'waste'
      : type === 'usage' || type === 'stock_out'
        ? 'stock_out'
        : type;
  return workflow(left) === workflow(right);
}

export function canRetryPendingInventoryTransaction(
  request: PendingInventoryTransaction,
  actorId: string,
  branchId: string,
) {
  return request.actorId === actorId && request.branchId === branchId;
}

export async function runInventoryTransactionRequestOnce<T>(
  requestId: string,
  locks: Set<string>,
  run: () => Promise<T>,
): Promise<T | null> {
  if (locks.has(requestId)) return null;
  locks.add(requestId);
  try {
    return await run();
  } finally {
    locks.delete(requestId);
  }
}

export function createPendingInventoryTransactionStore(storage: AsyncKeyValueStorage) {
  let queue: Promise<void> = Promise.resolve();

  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  const read = async (): Promise<PendingInventoryTransaction[]> => {
    const serialized = await storage.getItem(PENDING_INVENTORY_TRANSACTIONS_STORAGE_KEY);
    if (serialized === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error('Saved inventory recovery data is unreadable. It has been preserved; contact support before clearing app data.');
    }
    if (!Array.isArray(parsed) || !parsed.every(isPendingTransaction)) {
      throw new Error('Saved inventory recovery data is invalid. It has been preserved; contact support before clearing app data.');
    }
    return parsed.map((request) => ({
      ...request,
      status: 'pending' as const,
      transactions: request.transactions.map((transaction) => ({ ...transaction })),
    }));
  };

  const write = async (requests: PendingInventoryTransaction[]) => {
    await storage.setItem(PENDING_INVENTORY_TRANSACTIONS_STORAGE_KEY, JSON.stringify(requests));
  };

  return {
    load: () => exclusive(async () => {
      const requests = await read();
      await write(requests);
      return requests;
    }),
    save: (request: PendingInventoryTransaction) => exclusive(async () => {
      const requests = await read();
      const index = requests.findIndex((entry) => entry.requestId === request.requestId);
      const next = [...requests];
      if (index < 0) next.push(request);
      else next[index] = request;
      await write(next);
      return next;
    }),
    markProcessing: (requestId: string) => exclusive(async () => {
      const requests = await read();
      const next = requests.map((request) => request.requestId === requestId
        ? { ...request, status: 'processing' as const }
        : request);
      if (!next.some((request) => request.requestId === requestId)) {
        throw new Error('The saved inventory request could not be found.');
      }
      await write(next);
      return next;
    }),
    resolve: (requestId: string) => exclusive(async () => {
      const requests = await read();
      const next = requests.filter((request) => request.requestId !== requestId);
      await write(next);
      return next;
    }),
  };
}
