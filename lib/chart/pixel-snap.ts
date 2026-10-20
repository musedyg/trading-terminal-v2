/**
 * 像素对齐辅助：基于 @tradingview/lwc-toolkit 的 positionsLine / positionsBox。
 *
 * primitives 在 useBitmapCoordinateSpace 里按 pixelRatio 缩放 ctx 后以「媒体坐标」
 * 绘制；直接用原始坐标画 1px 线会落在半个设备像素上发虚。这里先把坐标送进
 * toolkit 的位图定位算法，再换算回媒体坐标，使轴向直线 / 矩形边恰好落在整像素上。
 */
import { positionsBox, positionsLine } from '@tradingview/lwc-toolkit/dimensions/positions';

/** 水平/垂直线中心对齐：返回对齐后的媒体坐标（线宽 widthMedia） */
export function snapLineCenter(positionMedia: number, pixelRatio: number, widthMedia: number): number {
  if (!Number.isFinite(positionMedia) || pixelRatio <= 0) return positionMedia;
  const { position, length } = positionsLine(positionMedia, pixelRatio, widthMedia);
  return (position + length / 2) / pixelRatio;
}

/** 一维区间对齐：返回对齐后的媒体坐标起点 + 长度（供矩形填充/描边用） */
export function snapSpan(
  p1Media: number,
  p2Media: number,
  pixelRatio: number,
): { start: number; length: number } {
  if (!Number.isFinite(p1Media) || !Number.isFinite(p2Media) || pixelRatio <= 0) {
    return { start: Math.min(p1Media, p2Media), length: Math.abs(p2Media - p1Media) };
  }
  const { position, length } = positionsBox(p1Media, p2Media, pixelRatio);
  return { start: position / pixelRatio, length: length / pixelRatio };
}
