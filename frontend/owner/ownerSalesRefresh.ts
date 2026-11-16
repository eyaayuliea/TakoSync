export async function refreshOwnerMonitoring(
  onRefresh: (() => Promise<void> | void) | undefined,
  fallback: () => Promise<void> | void,
): Promise<'shared' | 'sales-only'> {
  if (onRefresh) {
    await onRefresh();
    return 'shared';
  }
  await fallback();
  return 'sales-only';
}
