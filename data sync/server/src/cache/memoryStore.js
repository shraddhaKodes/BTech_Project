/** In-process stand-in for the Redis features we use: sorted sets, JSON values and capped streams. */
export class MemoryStore {
  constructor() { this.kind = 'memory'; this.z = new Map(); this.kv = new Map(); this.streams = new Map(); this.seq = 0; this.waiters = []; }

  async zadd(key, score, member) {
    let a = this.z.get(key); if (!a) this.z.set(key, (a = []));
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m][0] <= score) lo = m + 1; else hi = m; }
    a.splice(lo, 0, [score, member]);
  }
  _idx(a, t) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m][0] <= t) lo = m + 1; else hi = m; } return lo; }
  /** newest member with score <= t */
  async zbefore(key, t) { const a = this.z.get(key); if (!a) return null; const i = this._idx(a, t); return i ? { score: a[i - 1][0], member: a[i - 1][1] } : null; }
  /** oldest member with score > t */
  async zafter(key, t) { const a = this.z.get(key); if (!a) return null; const i = this._idx(a, t); return i < a.length ? { score: a[i][0], member: a[i][1] } : null; }
  async zlatest(key) { const a = this.z.get(key); return a?.length ? { score: a[a.length - 1][0], member: a[a.length - 1][1] } : null; }
  async zoldest(key) { const a = this.z.get(key); return a?.length ? { score: a[0][0], member: a[0][1] } : null; }
  async ztrim(key, minScore) { const a = this.z.get(key); if (!a) return; const i = this._idx(a, minScore - 1e-9); if (i) a.splice(0, i); }
  async zcount(key) { return this.z.get(key)?.length ?? 0; }

  async set(key, obj) { this.kv.set(key, JSON.stringify(obj)); }
  async get(key) { const v = this.kv.get(key); return v === undefined ? null : JSON.parse(v); }

  async xadd(stream, obj, maxlen = 2000) {
    let s = this.streams.get(stream); if (!s) this.streams.set(stream, (s = []));
    const id = `${Date.now()}-${this.seq++}`;
    s.push({ id, obj });
    if (s.length > maxlen) s.splice(0, s.length - maxlen);
    const w = this.waiters; this.waiters = []; w.forEach((f) => f());
    return id;
  }
  /** entries after lastId ('$' = only new ones). Resolves with [] after blockMs. */
  async xread(stream, lastId, blockMs = 200) {
    const pick = () => { const s = this.streams.get(stream) ?? []; return s.filter((e) => lastId !== '$' && cmpId(e.id, lastId) > 0); };
    if (lastId === '$') lastId = this.streams.get(stream)?.at(-1)?.id ?? '0-0';
    let out = pick(); if (out.length || !blockMs) return out;
    await new Promise((res) => { const t = setTimeout(res, blockMs); this.waiters.push(() => { clearTimeout(t); res(); }); });
    return pick();
  }
  async close() {}
}
const cmpId = (a, b) => { const [a1, a2] = a.split('-').map(Number), [b1, b2] = b.split('-').map(Number); return a1 - b1 || a2 - b2; };
