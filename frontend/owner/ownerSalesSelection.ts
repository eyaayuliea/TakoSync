export type OwnerSalesSelection = {
  branchId: string | null;
  period: 'Today' | 'Daily' | 'Weekly' | 'Monthly' | 'Custom';
  startDate?: string;
  endDate?: string;
};

export function resolveOwnerSalesSelection(input: OwnerSalesSelection): OwnerSalesSelection {
  return {
    branchId: input.branchId,
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export type OwnerSalesSelectionKeyInput = {
  period: string;
  branchId: string | null;
  fromText: string;
  toText: string;
};

export function ownerSalesSelectionKey(input: OwnerSalesSelectionKeyInput): string {
  return [input.period, input.branchId ?? 'all', input.fromText, input.toText].join('|');
}

/**
 * The parent loads one sales snapshot for the selection it passes in. That snapshot may be
 * reused only while the screen still shows exactly that selection. Once the user changes any
 * filter (period, branch or dates) the snapshot is dropped for good, so returning to the
 * original selection refetches instead of showing numbers loaded earlier.
 */
export type OwnerSalesSnapshotTracker = { key: string; reached: boolean } | null;

export function evaluateOwnerSalesSnapshot(
  tracker: OwnerSalesSnapshotTracker,
  currentKey: string,
): { reuse: boolean; tracker: OwnerSalesSnapshotTracker } {
  if (!tracker) return { reuse: false, tracker: null };
  if (currentKey === tracker.key) return { reuse: true, tracker: { key: tracker.key, reached: true } };
  // Before the screen has applied the parent's selection the keys can differ for one render;
  // only a change made after the snapshot was reached counts as a user filter change.
  return { reuse: false, tracker: tracker.reached ? null : tracker };
}
