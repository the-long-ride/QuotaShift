function readProfilePicture(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of [
    "picture",
    "avatar_url",
    "avatarUrl",
    "profile_picture_url",
    "profilePictureUrl",
  ]) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  for (const key of ["user", "profile", "account_user", "accountUser"]) {
    const nested = readProfilePicture(record[key]);
    if (nested) return nested;
  }
  return null;
}

export function extractCodexProfilePicture(value: unknown): string | null {
  const direct = readProfilePicture(value);
  if (direct) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const picture = readProfilePicture(item);
    if (picture) return picture;
  }
  return null;
}
