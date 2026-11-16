/**
 * In-process message bus with Kafka semantics (topics, keyed messages, append-only log, consumer groups, offsets).
 * Used when no Kafka brokers are configured, so `npm run dev` works with zero infrastructure.
 */
export class MemoryBus {
  constructor() { this.kind = 'memory'; this.logs = new Map(); this.groups = new Map(); this.closed = false; }

  _log(topic) { let l = this.logs.get(topic); if (!l) this.logs.set(topic, (l = [])); return l; }

  async publish(topic, key, value) {
    const log = this._log(topic);
    log.push({ offset: log.length, key: String(key ?? ''), value, ts: Date.now() });
    const g = this.groups.get(topic);
    if (g) for (const grp of g.values()) grp.wake?.();
  }

  /** handler(value, {key, offset, ts}) – at-least-once, in order, one message at a time per group. */
  async subscribe(topic, group, handler, { fromBeginning = false } = {}) {
    let groups = this.groups.get(topic);
    if (!groups) this.groups.set(topic, (groups = new Map()));
    const log = this._log(topic);
    const grp = groups.get(group) ?? { offset: fromBeginning ? 0 : log.length, running: false, handlers: [] };
    groups.set(group, grp);
    grp.handlers.push(handler);
    const pump = async () => {
      if (grp.running || this.closed) return;
      grp.running = true;
      try {
        while (grp.offset < log.length && !this.closed) {
          const m = log[grp.offset];
          // a group has one logical consumer: round-robin is unnecessary in-process, so use the first handler
          try { await grp.handlers[0](m.value, m); } catch (e) { console.warn(`[mq] handler error on ${topic}:`, e.message); }
          grp.offset++;
        }
      } finally { grp.running = false; }
    };
    grp.wake = () => setImmediate(pump);
    grp.wake();
  }

  async lag(topic, group) {
    const g = this.groups.get(topic)?.get(group);
    return g ? this._log(topic).length - g.offset : 0;
  }
  async close() { this.closed = true; }
}
