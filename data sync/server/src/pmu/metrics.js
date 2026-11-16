/** Shared counters/gauges for the PMU pipeline; read by the websocket status emitter and /api/pmus. */
export function newMetrics(sectorsCfg, backend) {
  const pmus = new Map();
  for (const p of sectorsCfg.pmus.values()) {
    pmus.set(p.id, {
      id: p.id, sector: p.sector, name: p.name, color: p.color, buses: p.buses,
      nominalRateHz: p.rateHz, measuredRateHz: 0, frames: 0, late: 0, partial: 0, bad: 0,
      clock: { offsetMs: 0, driftPpm: 0, jitterMs: 0, samples: 0 },
      latencyMs: 0, lastArriveTs: 0, bufferDepth: 0, skewRefMs: null, arrivals: [], timeline: [],
    });
  }
  return {
    pmus,
    align: { outHz: 0, emitted: 0, exact: 0, interp: 0, hold: 0, gap: 0, outLagMs: 0, fps: 0, _n: 0, _t: Date.now() },
    queue: { raw: 0, aligned: 0 },
    skewMs: null,                                  // diagnostic: residual inter-PMU time error after correction (simulation only)
    backend,
  };
}

export function snapshot(m, now = Date.now()) {
  const a = m.align;
  const dt = (now - a._t) / 1000;
  if (dt >= 1) { a.fps = a._n / dt; a._n = 0; a._t = now; }
  return {
    backend: m.backend,
    pmus: [...m.pmus.values()].map((p) => ({
      id: p.id, sector: p.sector, name: p.name, color: p.color, buses: p.buses,
      nominalRateHz: p.nominalRateHz, measuredRateHz: p.measuredRateHz,
      clock: p.clock, latencyMs: p.latencyMs, bufferDepth: p.bufferDepth,
      frames: p.frames, late: p.late, partial: p.partial, bad: p.bad,
      lastArriveAgoMs: p.lastArriveTs ? now - p.lastArriveTs : null,
      timeline: p.timeline,
    })),
    align: { outHz: a.outHz, fps: a.fps, emitted: a.emitted, exact: a.exact, interp: a.interp, hold: a.hold, gap: a.gap, outLagMs: a.outLagMs },
    queue: m.queue,
    skewMs: m.skewMs,
  };
}
