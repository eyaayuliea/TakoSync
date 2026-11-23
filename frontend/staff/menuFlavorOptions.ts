// OW-21 c7, c8: the POS flavor tabs. The four designed flavors keep their tabs and
// artwork; any other product the owner adds gets a tab for its flavor, with its
// Regular product and its Combo + Cheese product, so it appears on the POS
// (greyed out when unavailable).

export type FlavorTab = { id: string; label: string; productName: string; comboName?: string };

type CatalogItem = { name: string; flavor?: string | null; portionType?: string | null };

export function extraFlavorTabs(catalog: readonly CatalogItem[], knownProductNames: readonly string[]): FlavorTab[] {
  const known = new Set(knownProductNames);
  const tabs = new Map<string, { label: string; regular?: string; combo?: string }>();
  for (const item of catalog) {
    if (known.has(item.name)) continue;
    const label = item.flavor?.trim() || item.name;
    const key = label.toLowerCase();
    const tab = tabs.get(key) ?? { label };
    if (item.portionType === 'Combo + Cheese') tab.combo = tab.combo ?? item.name;
    else tab.regular = tab.regular ?? item.name;
    tabs.set(key, tab);
  }
  return [...tabs.entries()]
    .sort((left, right) => left[1].label.localeCompare(right[1].label))
    .map(([key, tab]) => ({
      id: `extra:${key}`,
      label: tab.label,
      productName: (tab.regular ?? tab.combo) as string,
      ...(tab.regular && tab.combo ? { comboName: tab.combo } : {}),
    }));
}
