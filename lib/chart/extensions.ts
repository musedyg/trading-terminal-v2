// M2 / M3 扩展点空壳（契约 CONTRACTS.md §4）
// M1 只留插槽、不实现。M2（画线工具）与 M3（指标窗格 / 多图网格 / Pine）在
// 这里接上各自组件与引擎，由协调员统一装配到页面与 PriceChart。

/** 画线层组件（M2 已实现：见 components/chart/DrawingsLayer.tsx，M2 完工） */
export function DrawingsLayer(): null {
  // 已实现：见 components/chart/DrawingsLayer.tsx（M2 完工）。
  // 函数体保持返回 null，避免与 PriceChart 的直接引用形成循环引用。
  return null;
}

/** 指标窗格组件（M3 实现） */
export function IndicatorPanes(): null {
  // TODO(M3): 在这里实现指标窗格 ——
  // 通过 lib/pine/engine.ts 的 PineEngine（PineTS）跑用户 Pine 源码，
  // 把 PineResult.plots 渲染成主图叠加系列或下方独立指标窗格。
  return null;
}

/** 多图网格组件（M3 实现） */
export function MultiChartGrid(): null {
  // TODO(M3): 在这里实现多图网格（1/2/4/6 分屏）——
  // 每个窗格独立维护品种/周期状态，复用 PriceChart 组件，
  // 十字光标可选同步，布局可命名保存。
  return null;
}
