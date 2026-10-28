export function accountCardColumnCount(width: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  if (safeWidth < 600) return 1;
  return 2 + Math.floor((safeWidth - 600) / 450);
}
