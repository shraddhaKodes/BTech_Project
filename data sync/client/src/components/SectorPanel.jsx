import { live, useLive } from '../store';

const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

/** Alignment strip: last second of frames per PMU – raw (uncorrected) stamps vs corrected stamps vs the common output grid. */
function Timeline({ pmus, outHz }) {
  const W = 330, rowH = 26, H = 28 + pmus.length * rowH * 2, WIN = 400;                 // show the newest 400 ms
  const latest = Math.max(0, ...pmus.flatMap((p) => p.timeline.map((r) => r[2])));
  if (!latest) return null;
  const x = (t) => W - 6 - ((latest - t) / WIN) * (W - 12);
  const grid = []; const P = 1000 / outHz;
  for (let T = Math.floor((latest - WIN) / P) * P; T <= latest; T += P) grid.push(T);
  return (
    <svg className="tl" viewBox={`0 0 ${W} ${H}`}>
      {grid.map((T) => <line key={T} x1={x(T)} x2={x(T)} y1={14} y2={H - 4} stroke="#1e293b" />)}
      <text x={4} y={10} fill="#64748b" fontSize="9">common {outHz} Hz grid (thin lines) · last {WIN} ms</text>
      {pmus.map((p, i) => {
        const y0 = 20 + i * rowH * 2;
        return (
          <g key={p.id}>
            <text x={4} y={y0 + 9} fill={p.color} fontSize="9">PMU {p.id} raw stamps</text>
            <text x={4} y={y0 + rowH + 9} fill={p.color} fontSize="9">PMU {p.id} corrected</text>
            {p.timeline.map(([, raw, cor], k) => (
              <g key={k}>
                {x(raw) > 0 && x(raw) < W && <rect x={x(raw) - 1} y={y0 + 12} width="2" height="10" fill="none" stroke={p.color} strokeWidth=".8" />}
                {x(cor) > 0 && x(cor) < W && <rect x={x(cor) - 1} y={y0 + rowH + 12} width="2" height="10" fill={p.color} />}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function SectorPanel() {
  useLive();
  const sync = live.meta.status?.pmu;
  if (!live.sectors.length) return null;
  const pmus = sync?.pmus ?? [];
  return (
    <>
      <h2>PMU sectors</h2>
      <div className="sectors">
        {live.sectors.map((s) => {
          const p = pmus.find((x) => x.sector === s.id);
          const live_ = p && p.lastArriveAgoMs != null && p.lastArriveAgoMs < 1500;
          return (
            <div key={s.id} className="sector" style={{ borderColor: s.color }}>
              <div className="sec-h"><b style={{ color: s.color }}>{s.name}</b><span className={`dot ${live_ ? 'ok' : 'warn'}`}>PMU {p?.id ?? '–'} {live_ ? 'streaming' : 'no data'}</span></div>
              <div className="kv"><span>Buses covered</span><b>{s.buses.length}</b></div>
              {p && (
                <>
                  <div className="kv"><span>Reporting rate</span><b>{f(p.measuredRateHz)} Hz <small>/ {p.nominalRateHz} nominal</small></b></div>
                  <div className="kv"><span>Clock offset vs server</span><b>{f(p.clock.offsetMs, 2)} ms</b></div>
                  <div className="kv"><span>Clock drift</span><b>{f(p.clock.driftPpm, 0)} ppm</b></div>
                  <div className="kv"><span>Arrival jitter</span><b>{f(p.clock.jitterMs, 2)} ms</b></div>
                  <div className="kv"><span>Network latency</span><b>{f(p.latencyMs, 1)} ms</b></div>
                  <div className="kv"><span>Buffered frames</span><b>{p.bufferDepth}</b></div>
                  <div className="kv"><span>Late / partial dropped</span><b>{p.late} / {p.partial}</b></div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {sync && (
        <>
          <h3>Synchroniser</h3>
          <div className="kv"><span>Output grid</span><b>{sync.align.outHz} Hz · {f(sync.align.fps)} fr/s</b></div>
          <div className="kv"><span>Output delay</span><b>{f(sync.align.outLagMs, 0)} ms</b></div>
          <div className="kv"><span>Interpolated / held / gap</span><b>{sync.align.interp} / {sync.align.hold} / {sync.align.gap}</b></div>
          <div className="kv"><span>Kafka raw-topic lag</span><b>{sync.queue.raw}</b></div>
          <div className="kv"><span>Residual skew (sim only)</span><b>{sync.skewMs == null ? '—' : `${f(sync.skewMs, 2)} ms`}</b></div>
          <div className="kv"><span>Queue / cache</span><b>{sync.backend.mq} · {sync.backend.cache}</b></div>
          <Timeline pmus={sync.pmus} outHz={sync.align.outHz} />
        </>
      )}
      {!sync && <p className="hint">PMU pipeline disabled (<code>PMU_ENABLED=0</code>).</p>}
    </>
  );
}
