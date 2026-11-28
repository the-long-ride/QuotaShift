/** Convert any provider display tier (e.g. "PRO+", "STD", "Max 20x") into a valid CSS modifier slug. */
export function tierBadgeSlug(tier: string | null | undefined): string {
  if (!tier) return "other";
  const slug = tier
    .trim()
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "other";
}
