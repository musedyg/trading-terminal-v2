/**
 * 帧合并任务：多次 schedule() 只在下一动画帧执行一次，cancel() 后不再执行。
 *
 * 语义对齐 @tradingview/lwc-toolkit 的 `scheduling/coalesced-task`：
 * 该子模块未随 toolkit 1.0.0 发布（仅存在于仓库主干文档），故本地实现同名同义版本，
 * 待官方发布后可直接替换为包导入。
 * 无 rAF 的环境（Node 单测）降级为同步执行，保证行为确定。
 */
export interface CoalescedTask {
  schedule: () => void;
  cancel: () => void;
}

export function createCoalescedTask(task: () => void): CoalescedTask {
  let rafId: number | null = null;
  let cancelled = false;

  const hasRaf = typeof requestAnimationFrame === 'function';

  return {
    schedule() {
      if (cancelled) return;
      if (!hasRaf) {
        task();
        return;
      }
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!cancelled) task();
      });
    },
    cancel() {
      cancelled = true;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
    },
  };
}
