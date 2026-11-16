import { interpolateFrames } from './interp.js';
import { bufKey } from './corrector.js';
import { TOPICS } from '../mq/index.js';

export const ALIGNED_STREAM = 'frames:aligned';

/**
 * Stage 3 – alignment. Emits frames on a fixed grid  T_k = k · (1000 / outHz) ms  of the server clock.
 *
 * For every grid instant and every PMU the two corrected samples that bracket T are taken from the PMU's sorted set and
 * interpolated (magnitude linear, angle on the shortest arc). A grid instant is released only when every *live* PMU has a
 * sample at or after  T + lateness  (the watermark), so a sample that is merely delayed is still waited for; a PMU that has
 * been silent for `stallMs` is declared stale and its last data is held instead of blocking everybody.
 * Anything arriving behind the watermark was already dropped by the corrector (dead-letter topic).
 */
export function startAligner({ bus, store, metrics, sectors, cfg, log = console }) {
  const P = 1000 / cfg.sync.outHz;
  const ids = [...sectors.pmus.keys()];
  const period = new Map(ids.map((id) => [id, 1000 / sectors.pmus.get(id).rateHz]));
  let lastK = null, running = true, t0 = null;
  metrics.align.outHz = cfg.sync.outHz;

  async function tick() {
    const now = Date.now();
    const newest = new Map(), live = [];
    for (const id of ids) {
      const l = await store.zlatest(bufKey(id));
      newest.set(id, l?.score ?? null);
      const m = metrics.pmus.get(id);
      m.bufferDepth = await store.zcount(bufKey(id));
      const alive = l && m.lastArriveTs && now - m.lastArriveTs < cfg.sync.stallMs;
      if (alive) live.push(id);
    }
    if (!live.length) return;
    const watermark = Math.min(...live.map((id) => newest.get(id))) - cfg.sync.latenessMs;

    if (lastK == null) {                           // start once every live PMU has data; begin just after the latest "oldest" sample
      const olds = [];
      for (const id of live) olds.push((await store.zoldest(bufKey(id))).score);
      lastK = Math.ceil(Math.max(...olds) / P);
      t0 = lastK * P;
    }
    let k = lastK + 1;
    if (k * P < watermark - cfg.sync.maxBacklogMs) k = Math.ceil((watermark - cfg.sync.maxBacklogMs) / P);   // catch up after a stall
    let emitted = 0;
    for (; k * P <= watermark && emitted < 200; k++, emitted++) {
      const T = k * P;
      const rows = [], per = {}, tTrue = [];
      let worst = 'exact';
      for (const id of ids) {
        const b = await store.zbefore(bufKey(id), T), a = await store.zafter(bufKey(id), T);
        const f0 = b && { ...b.member, t: b.score }, f1 = a && { ...a.member, t: a.score };
        let r = interpolateFrames(f0, f1, T);
        if (!r) { per[id] = { mode: 'none' }; worst = 'hold'; continue; }
        let mode = r.mode;
        if (mode === 'interp' && f1.t - f0.t > 3 * period.get(id)) { mode = 'gap'; }     // too far apart to trust interpolation
        if (!live.includes(id)) mode = 'hold';
        per[id] = { mode, gapMs: +r.gapMs.toFixed(2), seq: (f0 ?? f1).seq };
        if (mode === 'hold' || mode === 'gap') worst = mode; else if (mode === 'interp' && worst === 'exact') worst = 'interp';
        rows.push(...r.rows);
        if (r.tTrueS != null) tTrue.push(r.tTrueS);
      }
      const frame = {
        T, k, simTime: tTrue.length ? tTrue.reduce((s, x) => s + x, 0) / tTrue.length : (T - t0) / 1000,
        quality: worst, pmus: per, rows,
      };
      await store.xadd(ALIGNED_STREAM, frame, 1000);
      await bus.publish(TOPICS.aligned, 'aligned', frame);
      const A = metrics.align; A.emitted++; A._n++; A[worst === 'exact' ? 'exact' : worst === 'interp' ? 'interp' : worst === 'gap' ? 'gap' : 'hold']++;
      A.outLagMs = now - T;
      lastK = k;
      await store.set('aligner:state', { lastK, lastT: T });
    }
    if (lastK != null) for (const id of ids) await store.ztrim(bufKey(id), lastK * P - cfg.sync.retainMs);
    metrics.queue.raw = await bus.lag(TOPICS.raw, 'corrector');
  }

  let busy = false;
  const timer = setInterval(async () => {
    if (busy || !running) return;
    busy = true;
    try { await tick(); } catch (e) { log.warn('[aligner]', e.message); } finally { busy = false; }
  }, cfg.sync.tickMs);
  log.log(`[sync] aligner running → ${cfg.sync.outHz} Hz grid, lateness ${cfg.sync.latenessMs} ms`);
  return { stop: () => { running = false; clearInterval(timer); } };
}
