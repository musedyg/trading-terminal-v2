/** 画线存储：内存模型 + 选中态 + 订阅通知 + localStorage 持久化 */
import { validateDrawingModel } from './geometry.ts';
import type { DrawingModel } from './types.ts';

export class DrawingStore {
  private drawings = new Map<string, DrawingModel>();
  private selectedId: string | null = null;
  private subscribers = new Set<() => void>();

  /** 按插入顺序返回全部画线 */
  list(): DrawingModel[] {
    return [...this.drawings.values()];
  }

  get(id: string): DrawingModel | undefined {
    return this.drawings.get(id);
  }

  add(model: DrawingModel): void {
    this.drawings.set(model.id, model);
    this.notify();
  }

  update(id: string, patch: Partial<DrawingModel>): void {
    const existing = this.drawings.get(id);
    if (!existing) return;
    this.drawings.set(id, { ...existing, ...patch, id });
    this.notify();
  }

  remove(id: string): boolean {
    const existed = this.drawings.delete(id);
    if (existed) {
      if (this.selectedId === id) this.selectedId = null;
      this.notify();
    }
    return existed;
  }

  clear(): void {
    if (this.drawings.size === 0 && this.selectedId === null) return;
    this.drawings.clear();
    this.selectedId = null;
    this.notify();
  }

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.notify();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  /** 订阅变更通知，返回取消订阅函数 */
  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch {
        // 单个订阅者异常不影响其他订阅者
      }
    }
  }

  /** 持久化到 localStorage；无 localStorage（SSR）时静默跳过 */
  save(key: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, JSON.stringify(this.list()));
    } catch {
      // 配额不足或不可用：静默跳过
    }
  }

  /**
   * 从 localStorage 读取并逐个校验，异常或格式不对时返回 []。
   * legacyKey 可选：新键无数据时回退读取 M2 旧键（迁移兼容），读到即用。
   */
  static load(key: string, legacyKey?: string): DrawingModel[] {
    const primary = DrawingStore.readValidated(key);
    if (primary.length > 0 || !legacyKey) return primary;
    return DrawingStore.readValidated(legacyKey);
  }

  private static readValidated(key: string): DrawingModel[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(key);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const out: DrawingModel[] = [];
      for (const item of parsed) {
        const valid = validateDrawingModel(item);
        if (valid !== null) out.push(valid);
      }
      return out;
    } catch {
      return [];
    }
  }
}
