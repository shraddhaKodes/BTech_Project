import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newClock, observe, toServerTime, describe } from '../src/pmu/clock.js';
import { interpolateFrames, lerpAngle } from '../src/pmu/interp.js';
import { encodePmuPacket, parsePmuPacket } from '../src/udp/parser.js';
import { MemoryBus } from '../src/mq/memoryBus.js';
import { MemoryStore } from '../src/cache/memoryStore.js';
import { LiveState } from '../src/state.js';
import { loadSectors } from '../src/sectors.js';
import { startPipeline } from '../src/pmu/pipeline.js';
import { buildTruth, startPmu } from '../scripts/pmu-emulator.js';

const quiet = { log() {}, warn() {}, error() {} };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('PMU v2 packet round-trip', () => {
  const rows = [{ id: 7, v: [2400, 2390, 0], a: [1, -119, 0] }];
  const p = parsePmuPacket(encodePmuPacket({ pmuId: 2, seq: 9, tLocalMs: 1.7e12 + 0.25, tTrueS: 3.5, chunk: 1, chunks: 3, rows }));
  assert.deepEqual([p.pmuId, p.seq, p.chunk, p.chunks, p.tTrueS], [2, 9, 1, 3, 3.5]);
  assert.equal(p.tLocalMs, 1.7e12 + 0.25);
  assert.deepEqual(p.rows, rows);
  assert.throws(() => parsePmuPacket(Buffer.alloc(64)), /not a PMU v2/);
});

test('angle interpolation takes the short way round ±180°', () => {
  assert.ok(Math.abs(lerpAngle(179, -179, 0.5) - 180) < 1e-9);
  assert.ok(Math.abs(lerpAngle(-10, 10, 0.25) - -5) < 1e-9);
});

test('interpolateFrames: exact / interp / hold, absent phases stay absent', () => {
  const f0 = { t: 100, rows: [{ id: 1, v: [100, 0, 0], a: [0, 0, 0] }] };
  const f1 = { t: 140, rows: [{ id: 1, v: [120, 0, 0], a: [10, 0, 0] }] };
  const mid = interpolateFrames(f0, f1, 120);
  assert.equal(mid.mode, 'interp'); assert.equal(mid.rows[0].v[0], 110); assert.equal(mid.rows[0].a[0], 5); assert.equal(mid.rows[0].v[1], 0);
  assert.equal(interpolateFrames(f0, f1, 100).mode, 'exact');
  assert.equal(interpolateFrames(f0, null, 150).mode, 'hold');
});

test('clock model recovers offset and drift from jittery arrivals', () => {
  const c = newClock(), drift = 120e-6, offset = 5000, base = 1.7e12;
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    const tRef = base + i * 33.3333;                      // true time
    const tLocal = tRef + offset + drift * (tRef - base);  // PMU clock
    observe(c, tLocal, tRef + 0.8 + rnd() * 3);           // arrival = true time + 0.8 ms + 0..3 ms queueing
  }
  const d = describe(c);
  assert.ok(Math.abs(d.driftPpm - 120) < 15, `drift ${d.driftPpm}`);
  const tRef = base + 400 * 33.3333, est = toServerTime(c, tRef + offset + drift * (tRef - base));
  assert.ok(Math.abs(est - (tRef + 0.8)) < 1.0, `mapping error ${est - tRef} ms`);   // ≈ fixed latency, well under 1 ms
});

test('end-to-end: two unsynchronised PMUs are aligned to a common grid', { timeout: 30000 }, async () => {
  const here = new URL('../', import.meta.url);
  const net = JSON.parse(fs.readFileSync(new URL('data/network.json', here)));
  const sectors = loadSectors(new URL('data/sectors.json', here).pathname);
  // free ports for the test
  for (const p of sectors.pmus.values()) p.port = p.id === 1 ? 25011 : 25012;
  sectors.pmus.get(2).clockOffsetMs = 40;       // exaggerate: 40 ms clock offset, 150 ppm drift, 7 ms sampling phase
  const cfg = { sync: { outHz: 50, latenessMs: 25, stallMs: 1000, retainMs: 3000, maxBacklogMs: 500, tickMs: 10 } };
  const state = new LiveState();
  const pipe = await startPipeline({ cfg, sectors, state, bus: new MemoryBus(), store: new MemoryStore(), log: quiet });

  const truth = buildTruth(net), t0 = performance.timeOrigin + performance.now();
  const emu = [1, 2].map((id) => {
    const s = sectors.sectors.find((x) => x.pmu.id === id), p = s.pmu;
    return startPmu({ port: sectors.pmus.get(id).port, pmuId: id, ids: s.buses, truth, t0, rateHz: p.rateHz, clockOffsetMs: id === 2 ? 40 : 0, driftPpm: id === 2 ? 150 : 0, jitterMs: p.jitterMs, phaseMs: p.phaseMs });
  });

  const frames = [];
  let last = '$';
  const t_end = Date.now() + 9000;
  while (Date.now() < t_end) {
    for (const e of await pipe.store.xread('frames:aligned', last, 100)) { last = e.id; frames.push(e.obj); }
  }
  emu.forEach((e) => e.stop()); await pipe.stop();

  assert.ok(frames.length > 200, `aligned frames: ${frames.length}`);
  // 1) every aligned frame contains BOTH sectors, i.e. all 125 buses
  const full = frames.filter((f) => f.rows.length === 125);
  assert.ok(full.length / frames.length > 0.95, `${full.length}/${frames.length} complete frames`);
  // 2) grid is regular (20 ms) and monotonic
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].T > frames[i - 1].T);
  const steps = new Set(frames.slice(1).map((f, i) => Math.round(f.T - frames[i].T)));
  assert.ok([...steps].every((s) => s % 20 === 0), `grid steps ${[...steps]}`);
  // 3) time alignment: interpolated true time vs grid time should differ only by a constant (after warm-up)
  const warm = frames.filter((f) => f.k > frames[0].k + 150);
  const dev = warm.map((f) => f.simTime * 1000 - (f.T - t0));
  const med = [...dev].sort((a, b) => a - b)[dev.length >> 1];
  const worst = Math.max(...dev.map((d) => Math.abs(d - med)));
  assert.ok(worst < 3, `residual time error after sync: ${worst.toFixed(2)} ms`);
  // 4) value accuracy: compare with the ground truth at the matching true time
  let maxErr = 0;
  for (const f of warm.slice(0, 100)) {
    const ref = truth(f.simTime, f.rows.map((r) => r.id)), byId = new Map(ref.map((r) => [r.id, r]));
    for (const r of f.rows) maxErr = Math.max(maxErr, Math.abs(r.v[0] - byId.get(r.id).v[0]) / 2401.78);
  }
  assert.ok(maxErr < 0.003, `max voltage error ${maxErr} pu`);
  assert.ok(state.buses.size === 125, `LiveState buses ${state.buses.size}`);
});
