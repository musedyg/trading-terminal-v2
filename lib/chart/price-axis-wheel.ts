// 价格轴滚轮缩放的纯计算：LWC 默认不支持在价格轴上滚轮缩放（仅支持按住拖动），
// PriceChart 在容器捕获阶段接管落在价格轴条带内的滚轮事件，用本函数算出新可见区间，
// 再经 IPriceScaleApi.setVisibleRange 应用。以光标所在价格为中心缩放（同 TradingView 手感）。

export interface PriceRange {
  from: number;
  to: number;
}

/** deltaMode 归一化倍率：1=行（火狐），2=页，其余按像素 */
const DELTA_MODE_FACTOR: Record<number, number> = { 1: 33, 2: 400 };

/** 单次滚轮事件的最大等效像素，避免触控板高速滚动一下跳太远 */
const MAX_DELTA_PX = 240;

/** 每像素的对数缩放系数：约 100px 滚轮一格 ≈ 区间 ×/÷ 1.17 */
const ZOOM_PER_PX = 0.0016;

/**
 * 按滚轮增量缩放价格区间。
 * deltaY < 0（上滚）= 放大（区间变窄）；deltaY > 0（下滚）= 缩小（区间变宽）。
 * center 是缩放中心价格（通常是光标所在价格），缩放后 center 把两侧按同比例拉伸/压缩。
 * 区间非法或增量为 0 时原样返回（同一引用，方便调用方判断"未变化"）。
 */
export function zoomPriceRange(
  range: PriceRange,
  center: number,
  deltaY: number,
  deltaMode: number,
): PriceRange {
  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.to <= range.from) {
    return range;
  }
  if (!Number.isFinite(center) || !Number.isFinite(deltaY) || deltaY === 0) {
    return range;
  }
  const px = deltaY * (DELTA_MODE_FACTOR[deltaMode] ?? 1);
  const clamped = Math.max(-MAX_DELTA_PX, Math.min(MAX_DELTA_PX, px));
  const factor = Math.exp(clamped * ZOOM_PER_PX);
  const from = center - (center - range.from) * factor;
  const to = center + (range.to - center) * factor;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return range;
  }
  return { from, to };
}
