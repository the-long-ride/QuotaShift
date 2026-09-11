export const loadAccountOrder = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

export const saveAccountOrder = (key: string, order: string[]) => {
  localStorage.setItem(key, JSON.stringify(order));
};

export const sortByOrder = <T extends { id: string }>(items: T[], order: string[]): T[] => {
  const indexMap = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const indexA = indexMap.get(a.id);
    const indexB = indexMap.get(b.id);
    if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
    if (indexA !== undefined) return -1;
    if (indexB !== undefined) return 1;
    return 0;
  });
};

export const reorderItems = <T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] => {
  if (sourceId === targetId) return items;
  const result = [...items];
  const sourceIndex = result.findIndex((item) => item.id === sourceId);
  const targetIndex = result.findIndex((item) => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) return items;
  const [moved] = result.splice(sourceIndex, 1);
  result.splice(targetIndex, 0, moved);
  return result;
};
