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
