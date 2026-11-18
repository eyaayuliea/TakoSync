export type OwnerDiscrepancyStatus = 'Pending Review' | 'Adjusted';

export type OwnerDiscrepancy = {
  id: string;
  ingredient: string;
  unit: string;
  branchId: string;
  branch: string;
  expected: number;
  actual: number;
  difference: number;
  dateTime: string;
  submittedBy: string;
  remarks: string;
  status: OwnerDiscrepancyStatus;
  correctionRequest?: {
    requestedBy: string;
    dateTime: string;
    originalValue: number;
    revisedValue: number;
    reason: string;
  };
};

export type OwnerDiscrepanciesForcedState = 'success' | 'empty' | 'loading' | 'error' | null;

export const OWNER_DISCREPANCIES_SAVE_ERROR =
  'Unable to save. Please check your internet connection and try again.';

export function getForcedOwnerDiscrepanciesState(): OwnerDiscrepanciesForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_OWNER_DISCREPANCIES_STATE
    : undefined;
  if (value === 'success' || value === 'empty' || value === 'loading' || value === 'error') return value;
  return null;
}

export function forceOwnerDiscrepancySaveError(): boolean {
  return typeof process !== 'undefined'
    && process.env.EXPO_PUBLIC_FORCE_OWNER_DISCREPANCY_SAVE_ERROR === 'true';
}

export const ownerDiscrepancyMock: OwnerDiscrepancy[] = [
  { id: 'flour-b1', ingredient: 'All-Purpose Flour', unit: 'kg', branchId: 'branch-1', branch: 'Branch 1', expected: 12, actual: 10, difference: -2, dateTime: '12 Nov 2026 · 10:30 AM', submittedBy: 'Maria Santos', remarks: 'Recounted; shortage confirmed.', status: 'Pending Review' },
  { id: 'bonito-b1', ingredient: 'Bonito Flakes', unit: 'kg', branchId: 'branch-1', branch: 'Branch 1', expected: 2, actual: 2.3, difference: 0.3, dateTime: '11 Nov 2026 · 6:30 PM', submittedBy: 'Maria Santos', remarks: '', status: 'Adjusted' },
  { id: 'eggs-b3', ingredient: 'Eggs', unit: 'pcs', branchId: 'branch-3', branch: 'Branch 3', expected: 48, actual: 46, difference: -2, dateTime: '12 Nov 2026 · 9:15 AM', submittedBy: 'Ana Reyes', remarks: 'Miscounted one tray.', status: 'Pending Review', correctionRequest: { requestedBy: 'Ana Reyes', dateTime: '12 Nov 2026 · 9:40 AM', originalValue: 48, revisedValue: 50, reason: 'Miscounted one tray.' } },
  { id: 'octopus-b2', ingredient: 'Octopus', unit: 'kg', branchId: 'branch-2', branch: 'Branch 2', expected: 4, actual: 3, difference: -1, dateTime: '11 Nov 2026 · 8:40 PM', submittedBy: 'Maria Santos', remarks: 'Shortage found during count.', status: 'Pending Review' },
  { id: 'sauce-b1', ingredient: 'Takoyaki Sauce', unit: 'L', branchId: 'branch-1', branch: 'Branch 1', expected: 2, actual: 1.5, difference: -0.5, dateTime: '11 Nov 2026 · 7:55 PM', submittedBy: 'Maria Santos', remarks: 'Confirmed shortage.', status: 'Adjusted' },
  { id: 'mayonnaise-b3', ingredient: 'Mayonnaise', unit: 'kg', branchId: 'branch-3', branch: 'Branch 3', expected: 2.4, actual: 2, difference: -0.4, dateTime: '10 Nov 2026 · 9:00 PM', submittedBy: 'Ana Reyes', remarks: 'Adjustment verified.', status: 'Adjusted' },
];
