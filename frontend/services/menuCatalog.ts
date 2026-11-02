export function filterBranchVisibleMenuVariants<T extends { id: string }>(
  variants: T[],
  visibleVariantIds: ReadonlySet<string>,
) {
  return variants.filter((variant) => visibleVariantIds.has(variant.id));
}
