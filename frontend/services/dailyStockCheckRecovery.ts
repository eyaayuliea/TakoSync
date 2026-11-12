export type DailyStockCheckSubmissionLine = {
  ingredientId: string;
  recordedQuantity: number;
  inventoryRevision: number;
  physicalQuantity: number;
  unit: string;
};

export type PendingDailyStockCheck = {
  requestId: string;
  actorId: string;
  branchId: string;
  checkDate: string;
  remarks: string;
  lines: DailyStockCheckSubmissionLine[];
  createdAt: string;
};

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const PENDING_DAILY_STOCK_CHECKS_STORAGE_KEY = 'takosync.pendingDailyStockChecks.v1';

function isSubmissionLine(value: unknown): value is DailyStockCheckSubmissionLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<DailyStockCheckSubmissionLine>;
  return typeof line.ingredientId === 'string'
    && Number.isFinite(line.recordedQuantity)
    && Number.isFinite(line.inventoryRevision)
    && Number.isFinite(line.physicalQuantity)
    && typeof line.unit === 'string';
}

function isPendingDailyStockCheck(value: unknown): value is PendingDailyStockCheck {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<PendingDailyStockCheck>;
  return typeof request.requestId === 'string'
    && typeof request.actorId === 'string'
    && typeof request.branchId === 'string'
    && typeof request.checkDate === 'string'
    && typeof request.remarks === 'string'
    && Array.isArray(request.lines)
    && request.lines.length > 0
    && request.lines.every(isSubmissionLine)
    && typeof request.createdAt === 'string';
}

export function sameDailyStockCheckPayload(
  left: Pick<PendingDailyStockCheck, 'branchId' | 'checkDate' | 'remarks' | 'lines'>,
  right: Pick<PendingDailyStockCheck, 'branchId' | 'checkDate' | 'remarks' | 'lines'>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createPendingDailyStockCheckStore(storage: AsyncKeyValueStorage) {
  let queue: Promise<void> = Promise.resolve();
  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const read = async () => {
    const serialized = await storage.getItem(PENDING_DAILY_STOCK_CHECKS_STORAGE_KEY);
    if (serialized === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error('Saved daily count recovery data is unreadable. It has been preserved; contact support before clearing app data.');
    }
    if (!Array.isArray(parsed) || !parsed.every(isPendingDailyStockCheck)) {
      throw new Error('Saved daily count recovery data is invalid. It has been preserved; contact support before clearing app data.');
    }
    return parsed;
  };
  const write = async (requests: PendingDailyStockCheck[]) => {
    await storage.setItem(PENDING_DAILY_STOCK_CHECKS_STORAGE_KEY, JSON.stringify(requests));
  };

  return {
    load: () => exclusive(read),
    save: (request: PendingDailyStockCheck) => exclusive(async () => {
      const requests = await read();
      const existing = requests.findIndex((entry) => entry.requestId === request.requestId);
      if (existing < 0) requests.push(request);
      else requests[existing] = request;
      await write(requests);
      return requests;
    }),
    resolve: (requestId: string) => exclusive(async () => {
      const requests = (await read()).filter((entry) => entry.requestId !== requestId);
      await write(requests);
      return requests;
    }),
  };
}
