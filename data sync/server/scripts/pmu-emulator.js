#!/usr/bin/env node
/**
 * Two heterogeneous virtual PMUs. Each one samples the SAME underlying power system at its own rate and phase, stamps
 * frames with its OWN clock (offset + drift) and sends them over UDP with network jitter – exactly the situation the
 * synchroniser has to undo.
 *
 *   node server/scripts/pmu-emulator.js [--host 127.0.0.1] [--event] [--p1-offset 0] [--p2-offset 5] [--p2-drift 80] ...
 *
 * Per-PMU parameters (rate, port, clock offset/drift, jitter, sampling phase) come from data/sectors.json and can be
 * overridden with --p1-rate, --p1-offset, --p1-drift, --p1-jitter, --p1-phase (same for p2).
 */
import dgram from 'node:dgram';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePmuPacket } from '../src/udp/parser.js';

const VBASE = 2401.78, SOURCE = 150, EVENT_ROOT = 76, CHUNK = 25;
const here = new URL('../', import.meta.url);

/** Ground truth: a smooth continuous-time function of the true time t (s) for every measured bus. */
export function buildTruth(net) {
  const adj = new Map(net.nodes.map((n) => [n.id, []]));
  for (const e of net.edges) if (e.state !== 'open') { adj.get(e.from).push([e.to, e]); adj.get(e.to).push([e.from, e]); }
  const info = new Map([[SOURCE, { dist: 0, ph: 3, parent: null }]]);
  const q = [SOURCE];
  while (q.length) {
    const u = q.shift();
    for (const [v, e] of adj.get(u)) if (!info.has(v)) {
      const p = info.get(u);
      info.set(v, { dist: p.dist + (e.lengthFt ?? 300), ph: Math.min(p.ph, e.phases >= 3 ? 3 : e.phases || 1), parent: u });
      q.push(v);
    }
  }
  const maxDist = Math.max(...[...info.values()].map((i) => i.dist));
  const inSub = (id, root) => { for (let c = id; c != null; c = info.get(c)?.parent) if (c === root) return true; return false; };
  const smooth = (x) => x * x * (3 - 2 * x);
  return function sample(t, ids, withEvent = false) {
    const load = 1 + 0.18 * Math.sin((2 * Math.PI * t) / 40) + 0.05 * Math.sin((2 * Math.PI * t) / 7.3);
    const osc = Math.sin(2 * Math.PI * 2 * t);                          // 2 Hz electromechanical oscillation: makes time skew visible
    const ph = t % 60, sag = withEvent && ph > 20 && ph < 40 ? smooth(Math.min(1, Math.min(ph - 20, 40 - ph) / 4)) : 0;
    const dfAngle = 18 * Math.sin((2 * Math.PI * t) / 10);              // slow frequency excursion → angle drift (deg)
    return ids.map((id) => {
      const b = info.get(id);
      const base = 1.02 - 0.06 * Math.pow(b.dist / maxDist, 0.85) * load - (sag && inSub(id, EVENT_ROOT) ? 0.11 * sag : 0) + 0.008 * osc;
      const present = b.ph === 3 ? [0, 1, 2] : b.ph === 2 ? [id % 3, (id + 1) % 3] : [id % 3];
      const off = [-0.006, 0.004, 0];
      const v = [0, 1, 2].map((k) => (present.includes(k) ? (base + off[k]) * VBASE : 0));
      const a = [0, -120, 120].map((x, k) => (present.includes(k) ? x - (b.dist / 3000) * (1 + 0.1 * k) + dfAngle + 2 * osc : 0));
      return { id, v, a };
    });
  };
}

/** Start one virtual PMU. Returns { stop() }. `t0` = epoch ms of true time 0 (shared by all PMUs). */
export function startPmu({ host = '127.0.0.1', port, pmuId, ids, truth, rateHz, clockOffsetMs = 0, driftPpm = 0, jitterMs = 0, phaseMs = 0, t0, withEvent = false }) {
  const sock = dgram.createSocket('udp4');
  const period = 1000 / rateHz, drift = driftPpm * 1e-6;
  let n = 0, stopped = false, sent = 0;
  const nowTrue = () => performance.timeOrigin + performance.now() - t0;          // ms of true time
  const step = () => {
    if (stopped) return;
    const tSample = phaseMs + n * period;                                         // true sampling instant (ms)
    const tLocalMs = t0 + tSample + clockOffsetMs + drift * tSample;              // what this PMU's own clock says (offset + drift since start)
    const rows = truth(tSample / 1000, ids, withEvent);
    const seq = n++;
    const delay = jitterMs * 2 * Math.random();                                   // network/queueing delay, ≥ 0
    setTimeout(() => {
      const chunks = Math.ceil(rows.length / CHUNK);
      for (let c = 0; c < chunks; c++) {
        sock.send(encodePmuPacket({ pmuId, seq, tLocalMs, tTrueS: tSample / 1000, chunk: c, chunks, rows: rows.slice(c * CHUNK, (c + 1) * CHUNK) }), port, host);
      }
      sent++;
    }, Math.max(0, tSample + delay - nowTrue()));
    setTimeout(step, Math.max(0, tSample + period - nowTrue() - 5));              // wake ~5 ms before the next sampling instant
  };
  step();
  return { stop() { stopped = true; sock.close(); }, get sent() { return sent; } };
}

// ───────────────────────────── CLI ─────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]; };
  const host = arg('host', '127.0.0.1'), withEvent = arg('event', false) !== false;
  const net = JSON.parse(fs.readFileSync(new URL('data/network.json', here)));
  const cfg = JSON.parse(fs.readFileSync(arg('sectors', fileURLToPath(new URL('data/sectors.json', here)))));
  const truth = buildTruth(net), t0 = performance.timeOrigin + performance.now();
  const handles = cfg.sectors.map((s) => {
    const k = `p${s.pmu.id}`, p = s.pmu;
    const o = { host, port: +arg(`${k}-port`, p.port), pmuId: p.id, ids: s.buses, truth, withEvent, t0,
      rateHz: +arg(`${k}-rate`, p.rateHz), clockOffsetMs: +arg(`${k}-offset`, p.clockOffsetMs), driftPpm: +arg(`${k}-drift`, p.driftPpm),
      jitterMs: +arg(`${k}-jitter`, p.jitterMs), phaseMs: +arg(`${k}-phase`, p.phaseMs) };
    console.log(`[pmu${p.id}] ${s.name}: ${s.buses.length} buses @ ${o.rateHz} Hz → ${host}:${o.port}  clock offset ${o.clockOffsetMs} ms, drift ${o.driftPpm} ppm, jitter ≤${2 * o.jitterMs} ms, phase ${o.phaseMs} ms`);
    return startPmu(o);
  });
  setInterval(() => console.log(`[pmu] frames sent: ${handles.map((h) => h.sent).join(' / ')}`), 5000);
}
