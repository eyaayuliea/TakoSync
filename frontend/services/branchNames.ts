// One display name for a branch everywhere (reports, filters, headers):
// "Manila · Branch 1", or "Branch 2" when the branch has no city.
export function formatBranchName(branch: { city?: string | null; code: string }): string {
  const city = branch.city?.trim();
  const number = Number(branch.code.replace(/\D/g, '')) || branch.code;
  return `${city ? `${city} · ` : ''}Branch ${number}`;
}
