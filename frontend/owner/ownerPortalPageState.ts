// OW-02 c9 / OW-31 c2, c8: which data each Owner Web Portal page needs, and
// whether the page shows its content, a loading state, or an error with Retry.

export type PortalDataset = 'inventory' | 'sales' | 'activity' | 'reviews' | 'staff' | 'configuration';

export type PortalPageState =
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

/**
 * The first failed dataset the page needs wins; otherwise the page waits only
 * for data it has none of yet (a refresh keeps the current content on screen).
 */
export function portalPageState(
  needs: readonly PortalDataset[],
  errors: Partial<Record<PortalDataset, string>>,
  loading: ReadonlySet<PortalDataset>,
  loaded: ReadonlySet<PortalDataset> = new Set(),
): PortalPageState {
  const failed = needs.find((name) => errors[name]);
  if (failed) return { kind: 'error', message: errors[failed] as string };
  if (needs.some((name) => loading.has(name) && !loaded.has(name))) return { kind: 'loading' };
  return { kind: 'ready' };
}
