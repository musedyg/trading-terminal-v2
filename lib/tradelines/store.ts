/** TP/SL/挂单线存储：内存模型 + 订阅通知 + localStorage 持久化 */
import { validateTradeLineModel, type TradeLineModel } from './types.ts';

export class TradeLineStore {
  private lines = new Map<string, TradeLineModel>();
  private subscribers = new Set<() => void>();

  /** 按插入顺序返回全部线 */
  list(): TradeLineModel[] {
    return [...this.lines.values()];
  }

  get(id: string): TradeLineModel | undefined {
    return this.lines.get(id);
  }

  add(model: TradeLineModel): void {
    this.lines.set(model.id, model);
    this.notify();
  }

  updatePrice(id: string, price: number): void {
    const cur = this.lines.get(id);
    if (!cur || !Number.isFinite(price) || price <= 0) return;
    this.lines.set(id, { ...cur, price });
    this.notify();
  }

  remove(id: string): boolean {
    const existed = this.lines.delete(id);
    if (existed) this.notify();
    return existed;
  }

  clear(): void {
    if (this.lines.size === 0) return;
    this.lines.clear();
    this.notify();
  }

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

  /** 持久化；无 localStorage（SSR）时静默跳过 */
  save(key: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, JSON.stringify(this.list()));
    } catch {
      // 配额不足或不可用：静默跳过
    }
  }

  /** 读取并逐个校验，异常时返回 [] */
  static load(key: string): TradeLineModel[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(key);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const out: TradeLineModel[] = [];
      for (const item of parsed) {
        const valid = validateTradeLineModel(item);
        if (valid !== null) out.push(valid);
      }
      return out;
    } catch {
      return [];
    }
  }
}
