// Parse Kubernetes resource quantity strings into a comparable number (base units)
// Examples: "500m" -> 0.5, "2" -> 2, "4Gi" -> 4294967296, "100Mi" -> 104857600

const SUFFIXES: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

export function parseQuantity(q: string | undefined): number {
  if (!q || q === '0') return 0;
  // milli-units: "500m"
  if (q.endsWith('m')) return parseFloat(q.slice(0, -1)) / 1000;
  // binary/decimal suffixes
  for (const [suffix, multiplier] of Object.entries(SUFFIXES)) {
    if (q.endsWith(suffix)) {
      return parseFloat(q.slice(0, -suffix.length)) * multiplier;
    }
  }
  return parseFloat(q) || 0;
}

export function formatQuantity(n: number, unit: string): string {
  if (unit === 'cpu') {
    return n < 1 ? `${Math.round(n * 1000)}m` : `${n}`;
  }
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}Gi`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}Mi`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}Ki`;
  return `${n}`;
}
