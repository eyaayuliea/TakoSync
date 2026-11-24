// Leaving the staff physical count: staff are asked only when they have typed
// something that is not saved yet, and can always leave (with or without saving
// a draft). The prompt never mentions expected quantities, so the count stays
// blind until it is submitted (ST-12 c2).

export type CountEntry = { ingredientId: string; physicalQuantity: string };

/** A comparable picture of what the staff member has entered. */
export function countEntriesSnapshot(lines: readonly CountEntry[], remarks: string, verified: boolean): string {
  const entries = lines
    .filter((line) => line.physicalQuantity.trim() !== '')
    .map((line) => `${line.ingredientId}=${line.physicalQuantity.trim()}`)
    .sort();
  return JSON.stringify([entries, remarks.trim(), verified]);
}

/** True when the entries differ from the last saved or loaded draft. */
export function hasUnsavedCountEntries(current: string, lastSaved: string | null): boolean {
  return current !== (lastSaved ?? countEntriesSnapshot([], '', false));
}
