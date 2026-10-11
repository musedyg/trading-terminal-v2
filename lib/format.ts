// 价格精度：按价格量级选择小数位数（契约 CONTRACTS.md §3）

export function precisionForPrice(p: number): number {
  if (!Number.isFinite(p) || p < 0) return 4;
  if (p >= 100) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  if (p >= 0.1) return 5;
  if (p >= 0.01) return 6;
  return 8;
}
