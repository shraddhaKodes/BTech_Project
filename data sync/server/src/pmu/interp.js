/** Interpolation of phasor frames onto a common time grid. */
const DEG = Math.PI / 180;

/** Shortest-arc linear interpolation of an angle in degrees. */
export function lerpAngle(a0, a1, w) {
  let d = ((a1 - a0 + 540) % 360) - 180;       // wrap difference into [-180, 180)
  return a0 + d * w;
}
const lerp = (x0, x1, w) => x0 + (x1 - x0) * w;

/**
 * Interpolate a PMU frame at time t between frame f0 (t0) and f1 (t1). Frames are { t, rows:[{id,v,a}], tTrueS }.
 * Phase conductors that are absent (≈0 V) stay 0. Returns rows plus the age of the nearest sample.
 */
export function interpolateFrames(f0, f1, t) {
  if (!f0 && !f1) return null;
  if (!f1 || (f0 && t <= f0.t)) return { rows: f0.rows, tTrueS: f0.tTrueS, mode: t === f0.t ? 'exact' : 'hold', gapMs: t - f0.t };
  if (!f0) return { rows: f1.rows, tTrueS: f1.tTrueS, mode: 'hold', gapMs: f1.t - t };
  const w = f1.t === f0.t ? 0 : (t - f0.t) / (f1.t - f0.t);
  const byId = new Map(f1.rows.map((r) => [r.id, r]));
  const rows = f0.rows.map((r0) => {
    const r1 = byId.get(r0.id);
    if (!r1) return r0;
    return {
      id: r0.id,
      v: r0.v.map((x, k) => (x > 0.05 && r1.v[k] > 0.05 ? lerp(x, r1.v[k], w) : Math.max(x, r1.v[k]) > 0.05 ? (w < 0.5 ? x : r1.v[k]) : 0)),
      a: r0.a.map((x, k) => (r0.v[k] > 0.05 && r1.v[k] > 0.05 ? lerpAngle(x, r1.a[k], w) : w < 0.5 ? x : r1.a[k])),
    };
  });
  const tTrueS = f0.tTrueS != null && f1.tTrueS != null ? lerp(f0.tTrueS, f1.tTrueS, w) : null;
  return { rows, tTrueS, mode: 'interp', gapMs: Math.min(t - f0.t, f1.t - t) };
}
export const toRad = (d) => d * DEG;
