export const OFFICIAL_RELEASE_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest";

export const isNewerVersion = (current: string, latest: string): boolean => {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentParts[index] || 0;
    const latestPart = latestParts[index] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
};
