export function loadList<T>(key: string, seed: T[]): T[] {
  if (typeof window === 'undefined' || !window.localStorage) return seed;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      window.localStorage.setItem(key, JSON.stringify(seed));
      return [...seed];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : seed;
  } catch { return seed; }
}

export function saveList<T>(key: string, list: T[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
}

export function nextId(list: { id: string }[]): string {
  const nums = list.map((x) => Number(x.id)).filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1);
}
