/** 预警存储：内存模型 + 订阅通知 + localStorage 持久化 */
import { validateAlertModel, ALERTS_STORAGE_KEY, type AlertModel } from './types.ts';

export class AlertStore {
  private alerts = new Map<string, AlertModel>();
  private subscribers = new Set<() => void>();

  list(): AlertModel[] {
    return [...this.alerts.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): AlertModel | undefined {
    return this.alerts.get(id);
  }

  add(model: AlertModel): void {
    this.alerts.set(model.id, model);
    this.notify();
  }

  remove(id: string): boolean {
    const existed = this.alerts.delete(id);
    if (existed) this.notify();
    return existed;
  }

  /** 标记已触发（只触发一次） */
  markTriggered(id: string, at: number): void {
    const cur = this.alerts.get(id);
    if (!cur || cur.triggeredAt !== null) return;
    this.alerts.set(id, { ...cur, triggeredAt: at });
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
  save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(this.list()));
    } catch {
      // 配额不足或不可用：静默跳过
    }
  }

  /** 读取并逐个校验，异常时返回 [] */
  static load(): AlertModel[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const out: AlertModel[] = [];
      for (const item of parsed) {
        const valid = validateAlertModel(item);
        if (valid !== null) out.push(valid);
      }
      return out;
    } catch {
      return [];
    }
  }
}
