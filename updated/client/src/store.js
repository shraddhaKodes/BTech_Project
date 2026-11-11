// Tiny external store: websocket frames land here; React reads it via useLive()
// (no re-render of the whole tree per frame — the 3D scene reads `live` directly in useFrame).
import { useEffect, useState, useSyncExternalStore } from 'react';

export const STATUS_COLOR = ['#22c55e', '#f59e0b', '#ef4444', '#64748b'];
export const STATUS_LABEL = ['Normal', 'Warning', 'Violation', 'No data'];
export const PHASES = [
  { key: 'A', color: '#f4b942' },
  { key: 'B', color: '#2dd4bf' },
  { key: 'C', color: '#a78bfa' },
];
const HIST_MAX = 300;

export const live = {
  vBase: 2401.78,
  limits: { normal: [0.95, 1.05], warn: [0.9, 1.1] },
  staleMs: 3000,
  buses: new Map(),   // id -> { v:[3], a:[3], s, ts, simTime }
  hist: new Map(),    // id -> [{ ts, v:[3], s }]
  meta: { connected: false, status: null },
  version: 0,
};

const subs = new Set();
const notify = () => { live.version++; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export function applyFrame(f) {
  for (const [id, a] of Object.entries(f.buses)) {
    const n = +id;
    const rec = { v: a.slice(0, 3), a: a.slice(3, 6), s: a[6], ts: f.ts, simTime: f.simTime };
    live.buses.set(n, rec);
    let h = live.hist.get(n);
    if (!h) live.hist.set(n, (h = []));
    h.push({ ts: f.ts, v: rec.v, s: rec.s });
    if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX);
  }
  notify();
}

export function seedHistory(id, rows) {
  const cur = live.hist.get(id) ?? [];
  const last = rows.length ? rows[rows.length - 1].ts : 0;
  live.hist.set(id, rows.map((r) => ({ ts: r.ts, v: r.v, s: r.s })).concat(cur.filter((x) => x.ts > last)).slice(-HIST_MAX));
  notify();
}

export function setMeta(p) { Object.assign(live.meta, p); notify(); }
export const useLive = () => useSyncExternalStore(subscribe, () => live.version);
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

/** Per-phase status from a per-unit value (null when the phase is not present / ~0 V). */
export function phaseStatus(pu) {
  if (!(pu > 0.05)) return null;
  const { normal, warn } = live.limits;
  if (pu < warn[0] || pu > warn[1]) return 2;
  if (pu < normal[0] || pu > normal[1]) return 1;
  return 0;
}
export const effectiveStatus = (rec) => (!rec || Date.now() - rec.ts > live.staleMs ? 3 : rec.s);
