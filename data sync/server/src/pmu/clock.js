/**
 * Per-PMU clock model.
 *
 * Every PMU stamps its frames with its own clock:   tLocal = (1 + drift) * tRef + offset
 * The synchroniser does not know tRef, but it knows when each frame ARRIVED on the server clock:
 *   tArrive = tRef + latency,   latency = fixed part + non-negative random delay
 * so a line fitted through the *lower envelope* of (tLocal, tArrive) points (the frames that saw the least queueing)
 * maps any PMU clock onto the server clock:   tServer = a * tLocal + b   (a = 1/(1+drift)).
 * This is the classic min-delay estimator used for NTP-style clock recovery. Both PMUs end up on the same
 * timeline, so their frames can be compared even though their raw timestamps cannot.
 *
 * Pure code, no I/O – state is a plain object so it can live in Redis between messages.
 */
export function newClock(window = 600) {
  return { window, pts: [], a: 1, b: null, n: 0, jitterMs: 0, resid: [] };
}

function fit(pts) {
  const n = pts.length;
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p[0]; sy += p[1]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0;
  for (const p of pts) { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); }
  const a = sxx > 0 ? sxy / sxx : 1;
  return { a, b: my - a * mx, mx, my };
}

/** Feed one observation (tLocalMs from the PMU, tArriveMs from the server). Returns the updated clock. */
export function observe(c, tLocalMs, tArriveMs) {
  // work relative to the first sample so float64 keeps sub-microsecond precision on epoch-sized numbers
  if (c.origin == null) c.origin = [tLocalMs, tArriveMs];
  const x = tLocalMs - c.origin[0], y = tArriveMs - c.origin[1];
  c.pts.push([x, y]);
  if (c.pts.length > c.window) c.pts.shift();
  c.n++;
  if (c.pts.length < 8) {                      // warm-up: constant offset, unit slope
    c.a = 1; c.b = c.pts.reduce((m, p) => Math.min(m, p[1] - p[0]), Infinity);
    return c;
  }
  // pass 1: ordinary least squares; pass 2+3: keep only the least-delayed 40 % of points (lowest residuals) and refit
  let f = fit(c.pts);
  const res = c.pts.map((p) => p[1] - (f.a * p[0] + f.b));
  const q = [...res].sort((p, q2) => p - q2)[Math.floor(res.length * 0.4)];      // 40th percentile: the least-delayed frames
  const low = c.pts.filter((_, i) => res[i] <= q);
  if (low.length >= 6) f = fit(low);
  const res2 = c.pts.map((p) => p[1] - (f.a * p[0] + f.b));                      // refine once more around the new line
  const q2 = [...res2].sort((p, r) => p - r)[Math.floor(res2.length * 0.4)];
  const low2 = c.pts.filter((_, i) => res2[i] <= q2);
  if (low2.length >= 6) f = fit(low2);
  // pass 3: shift the line down to the envelope so it estimates the minimum-latency path
  let minRes = Infinity;
  for (const p of c.pts) minRes = Math.min(minRes, p[1] - (f.a * p[0] + f.b));
  c.a = f.a; c.b = f.b + minRes;
  const r = c.pts.map((p) => p[1] - (c.a * p[0] + c.b));
  const mean = r.reduce((s, v) => s + v, 0) / r.length;
  c.jitterMs = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / r.length);
  return c;
}

/** Map a PMU-local timestamp onto the server clock (ms). */
export function toServerTime(c, tLocalMs) {
  if (c.origin == null) return tArriveFallback(tLocalMs);
  return c.a * (tLocalMs - c.origin[0]) + c.b + c.origin[1];
}
const tArriveFallback = (t) => t;

/** Human numbers for the UI: estimated drift in ppm and offset (PMU minus server, +ve = PMU clock ahead) in ms at the latest sample. */
export function describe(c) {
  if (c.origin == null) return { driftPpm: 0, offsetMs: 0, jitterMs: 0, samples: 0 };
  const last = c.pts[c.pts.length - 1];
  const tLocalLast = last[0] + c.origin[0];
  return {
    driftPpm: (1 / c.a - 1) * 1e6,                   // PMU clock runs fast (+) / slow (-) relative to the server
    offsetMs: tLocalLast - toServerTime(c, tLocalLast),
    jitterMs: c.jitterMs,
    samples: c.n,
  };
}
