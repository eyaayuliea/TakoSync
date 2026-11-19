// Matches live `menu_addons` rows to the add-ons the Staff POS offers. The owner may spell a
// name differently (case, punctuation, "mayo" vs "mayonnaise"), so matching is tolerant, and
// the POS list, the checkout list and the total all use the same resolved list.

export type MenuAddonLike = { id: string; name: string; price: number; isAvailable: boolean };

export type SupportedAddonKey = 'japanese-mayonnaise' | 'takoyaki-sauce' | 'flakes';

type AddonDefinition = { key: SupportedAddonKey; label: string; pattern: RegExp };

export const SUPPORTED_ADDONS: readonly AddonDefinition[] = [
  // "Japanese white sauce" is the name seeded by the catalog migration for the same add-on.
  { key: 'japanese-mayonnaise', label: 'Japanese Mayonnaise', pattern: /^japanese (?:mayonnaise|mayo|white sauce)$/ },
  { key: 'takoyaki-sauce', label: 'Takoyaki Sauce', pattern: /^takoyaki sauce$/ },
  { key: 'flakes', label: 'Flakes', pattern: /^(?:bonito )?flakes$/ },
];

export function normalizeAddonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchSupportedAddon(name: string): SupportedAddonKey | null {
  const normalized = normalizeAddonName(name);
  return SUPPORTED_ADDONS.find((definition) => definition.pattern.test(normalized))?.key ?? null;
}

export function resolveMenuAddons<T extends MenuAddonLike>(addons: readonly T[]): {
  available: T[];
  missingLabels: string[];
} {
  const active = addons.filter((addon) => addon.isAvailable);
  const available = SUPPORTED_ADDONS.flatMap((definition) =>
    active.filter((addon) => matchSupportedAddon(addon.name) === definition.key));
  const missingLabels = SUPPORTED_ADDONS
    .filter((definition) => !active.some((addon) => matchSupportedAddon(addon.name) === definition.key))
    .map((definition) => definition.label);
  return { available, missingLabels };
}

/** Drops selections that no longer refer to an offered add-on so the total cannot include them. */
export function pruneSelectedAddonIds(
  selectedIds: readonly string[],
  available: ReadonlyArray<{ id: string }>,
): string[] {
  const offered = new Set(available.map((addon) => addon.id));
  return selectedIds.filter((id) => offered.has(id));
}
