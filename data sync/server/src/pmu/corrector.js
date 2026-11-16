import { newClock, observe, toServerTime, describe } from './clock.js';
import { TOPICS } from '../mq/index.js';

export const bufKey = (pmuId) => `pmu:${pmuId}:frames`;

/**
 * Stage 2 – clock correction. Consumer group `corrector` on `pmu.raw`.
 * Maps each frame's PMU-local timestamp onto the server clock and stores it in a Redis sorted set (score = corrected time).
 * Frames that would land behind the aligner's watermark are too late to be used and go to the dead-letter topic.
 */
export async function startCorrector({ bus, store, metrics, sectors, log = console, group = 'corrector' }) {
  const clocks = new Map();
  for (const id of sectors.pmus.keys()) clocks.set(id, (await store.get(`clock:${id}`)) ?? newClock());
  const ewmaErr = new Map();                       // pmuId -> EWMA of (tCorrected - tTrue)   [ms], diagnostics only

  await bus.subscribe(TOPICS.raw, group, async (f) => {
    const m = metrics.pmus.get(f.pmuId); if (!m) return;
    const c = clocks.get(f.pmuId);
    observe(c, f.tLocalMs, f.ta);
    const t = toServerTime(c, f.tLocalMs);

    m.frames++;
    m.latencyMs = f.ta - t;                         // arrival minus corrected time ≈ network + queueing delay
    if (m.lastArriveTs) {
      const dt = f.ta - m.lastArriveTs, inst = dt > 0 ? 1000 / dt : 0;
      m.measuredRateHz = m.measuredRateHz ? m.measuredRateHz * 0.9 + inst * 0.1 : inst;
    }
    m.lastArriveTs = f.ta;
    m.clock = describe(c);
    // timeline for the UI: "naive" = pretend all clocks agreed at the first sample, "corrected" = our estimate
    const naive = f.tLocalMs - c.origin[0] + c.origin[1];
    m.timeline.push([Math.round(f.ta), +(naive).toFixed(2), +t.toFixed(2)]);
    if (m.timeline.length > 60) m.timeline.shift();

    if (f.tTrueS != null) {                         // simulation-only: how well do the two PMUs agree after correction?
      const e = t - f.tTrueS * 1000;
      ewmaErr.set(f.pmuId, ewmaErr.has(f.pmuId) ? ewmaErr.get(f.pmuId) * 0.98 + e * 0.02 : e);
      if (ewmaErr.size === sectors.pmus.size) { const v = [...ewmaErr.values()]; metrics.skewMs = Math.max(...v) - Math.min(...v); }
    }

    const st = await store.get('aligner:state');
    if (st && t <= st.lastT) {                      // behind the watermark → cannot be aligned any more
      m.late++;
      await bus.publish(TOPICS.dlq, f.pmuId, { reason: 'late', pmuId: f.pmuId, seq: f.seq, tCorr: t, watermark: st.lastT });
      return;
    }
    await store.zadd(bufKey(f.pmuId), t, { seq: f.seq, t, tTrueS: f.tTrueS, rows: f.rows });
    if (f.seq % 20 === 0) await store.set(`clock:${f.pmuId}`, c);   // survive restarts without a round-trip per frame
  });
  log.log('[sync] corrector running');
}
