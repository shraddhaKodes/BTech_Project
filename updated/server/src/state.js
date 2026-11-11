import { config } from './config.js';

export const STATUS = { NORMAL: 0, WARN: 1, VIOLATION: 2, NODATA: 3 };

/** Classify a bus from its per-phase per-unit voltages. Phases at ~0 V are treated as "not present". */
export function classify(pu, limits = config.limits) {
  const p = pu.filter((x) => Number.isFinite(x) && x > 0.05);
  if (!p.length) return STATUS.NODATA;
  const lo = Math.min(...p), hi = Math.max(...p);
  if (lo < limits.warn[0] || hi > limits.warn[1]) return STATUS.VIOLATION;
  if (lo < limits.normal[0] || hi > limits.normal[1]) return STATUS.WARN;
  return STATUS.NORMAL;
}

export class LiveState {
  constructor(cfg = config) {
    this.cfg = cfg;
    this.buses = new Map();      // id -> { v, a, s, ts, simTime }
    this.history = new Map();    // id -> [{ ts, t, v, s }]
    this.dirtyWs = new Set();    // changed since last websocket emit
    this.dirtyDb = new Set();    // changed since last DB flush
    this.stats = { packets: 0, badPackets: 0, rows: 0, lastPacketTs: 0, lastSimTime: 0 };
    this._rate = { n: 0, t: Date.now(), pps: 0 };
  }

  apply(simTime, rows, ts = Date.now()) {
    this.stats.packets++; this._rate.n++;
    this.stats.lastPacketTs = ts; this.stats.lastSimTime = simTime;
    for (const r of rows) {
      const pu = r.v.map((x) => x / this.cfg.vBaseLN);
      const s = classify(pu, this.cfg.limits);
      const rec = { v: r.v, a: r.a, s, ts, simTime };
      this.buses.set(r.id, rec);
      let h = this.history.get(r.id);
      if (!h) this.history.set(r.id, (h = []));
      h.push({ ts, t: simTime, v: r.v, s });
      if (h.length > this.cfg.historyLen) h.shift();
      this.dirtyWs.add(r.id); this.dirtyDb.add(r.id);
      this.stats.rows++;
    }
  }

  takeDirty(which) {
    const set = which === 'db' ? this.dirtyDb : this.dirtyWs;
    const ids = [...set]; set.clear(); return ids;
  }

  packetsPerSecond() {
    const now = Date.now(), dt = (now - this._rate.t) / 1000;
    if (dt >= 1) { this._rate.pps = this._rate.n / dt; this._rate.n = 0; this._rate.t = now; }
    return this._rate.pps;
  }

  summary() {
    let min = null, max = null; const counts = [0, 0, 0, 0];
    const now = Date.now();
    for (const [id, b] of this.buses) {
      const stale = now - b.ts > this.cfg.staleMs;
      counts[stale ? 3 : b.s]++;
      for (const x of b.v) {
        const pu = x / this.cfg.vBaseLN; if (pu <= 0.05) continue;
        if (!min || pu < min.pu) min = { id, pu };
        if (!max || pu > max.pu) max = { id, pu };
      }
    }
    return { counts, min, max, buses: this.buses.size };
  }
}
