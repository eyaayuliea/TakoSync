import type { SaleSubmission } from './takosync';

export type PendingSaleCheckout = SaleSubmission & {
  requestId: string;
  actorId: string;
  actorLabel: string;
  branchLabel: string;
  createdAt: string;
};

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const PENDING_SALE_CHECKOUTS_STORAGE_KEY = 'takosync.pendingSaleCheckouts.v1';

function isPendingSaleCheckout(value: unknown): value is PendingSaleCheckout {
  if (!value || typeof value !== 'object') return false;
  const sale = value as Partial<PendingSaleCheckout>;
  return typeof sale.requestId === 'string'
    && typeof sale.transactionReference === 'string'
    && typeof sale.actorId === 'string'
    && typeof sale.actorLabel === 'string'
    && typeof sale.branchId === 'string'
    && typeof sale.branchLabel === 'string'
    && (sale.paymentMethod === 'Cash' || sale.paymentMethod === 'Card')
    && Number.isFinite(sale.totalAmount)
    && Array.isArray(sale.items)
    && sale.items.length > 0
    && sale.items.every((item) => item
      && typeof item.variantId === 'string'
      && Number.isInteger(item.quantity)
      && item.quantity > 0
      && Number.isFinite(item.unitPrice))
    && Array.isArray(sale.addons)
    && sale.addons.every((addon) => addon
      && typeof addon.addonId === 'string'
      && Number.isFinite(addon.unitPrice)
      && (addon.quantity === undefined || (Number.isInteger(addon.quantity) && addon.quantity > 0)))
    && typeof sale.createdAt === 'string';
}

export function canRetryPendingSaleCheckout(
  request: PendingSaleCheckout,
  actorId: string,
  branchId: string,
) {
  return request.actorId === actorId && request.branchId === branchId;
}

export function createPendingSaleCheckoutStore(storage: AsyncKeyValueStorage) {
  let queue: Promise<void> = Promise.resolve();
  const exclusive = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  const read = async (): Promise<PendingSaleCheckout[]> => {
    const serialized = await storage.getItem(PENDING_SALE_CHECKOUTS_STORAGE_KEY);
    if (serialized === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error('Saved checkout recovery data is unreadable. It has been preserved; contact support before clearing app data.');
    }
    if (!Array.isArray(parsed) || !parsed.every(isPendingSaleCheckout)) {
      throw new Error('Saved checkout recovery data is invalid. It has been preserved; contact support before clearing app data.');
    }
    return parsed.map((sale) => ({
      ...sale,
      items: sale.items.map((item) => ({ ...item })),
      addons: sale.addons.map((addon) => ({ ...addon })),
    }));
  };

  const write = (requests: PendingSaleCheckout[]) =>
    storage.setItem(PENDING_SALE_CHECKOUTS_STORAGE_KEY, JSON.stringify(requests));

  return {
    load: () => exclusive(read),
    save: (request: PendingSaleCheckout) => exclusive(async () => {
      const requests = await read();
      const index = requests.findIndex((entry) => entry.requestId === request.requestId);
      const next = [...requests];
      if (index < 0) next.push(request);
      else next[index] = request;
      await write(next);
      return next;
    }),
    resolve: (requestId: string) => exclusive(async () => {
      const next = (await read()).filter((request) => request.requestId !== requestId);
      await write(next);
      return next;
    }),
  };
}
