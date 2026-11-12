export type PendingInventoryCountCorrection = {
  requestId: string;
  actorId: string;
  branchId: string;
  countLineId: string;
  correctedActualQuantity: number;
  reason: string;
  createdAt: string;
};

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY = 'takosync.pendingInventoryCountCorrections.v1';

export function isDefinitiveCorrectionRequestRejection(code: string | undefined) {
  return code === 'P0001' || code === '22023';
}

function isPendingCorrection(value: unknown): value is PendingInventoryCountCorrection {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<PendingInventoryCountCorrection>;
  return typeof request.requestId === 'string'
    && typeof request.actorId === 'string'
    && typeof request.branchId === 'string'
    && typeof request.countLineId === 'string'
    && Number.isFinite(request.correctedActualQuantity)
    && request.correctedActualQuantity! >= 0
    && typeof request.reason === 'string'
    && typeof request.createdAt === 'string';
}

export function createPendingInventoryCountCorrectionStore(storage: AsyncKeyValueStorage) {
  let queue: Promise<void> = Promise.resolve();
  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const read = async () => {
    const serialized = await storage.getItem(PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY);
    if (serialized === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error('Saved count-correction recovery data is unreadable. It has been preserved; contact support before clearing app data.');
    }
    if (!Array.isArray(parsed) || !parsed.every(isPendingCorrection)) {
      throw new Error('Saved count-correction recovery data is invalid. It has been preserved; contact support before clearing app data.');
    }
    return parsed;
  };
  const write = async (requests: PendingInventoryCountCorrection[]) => {
    await storage.setItem(PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY, JSON.stringify(requests));
  };

  return {
    load: () => exclusive(read),
    save: (request: PendingInventoryCountCorrection) => exclusive(async () => {
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
