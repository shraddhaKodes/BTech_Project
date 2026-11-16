import { PHASES, live } from '../store';

/** Live per-unit voltage trace for the 3 phases. `hist` = [{ts, v:[3]}] */
export default function Sparkline({ hist, windowMs = 30000 }) {
  const W = 320, H = 110, now = Date.now();
  const pts = hist.filter((h) => now - h.ts <= windowMs);
  const series = [0, 1, 2].map((k) => pts.map((h) => ({ t: h.ts, y: h.v[k] / live.vBase })).filter((p) => p.y > 0.05));
  const all = series.flat().map((p) => p.y);
  const lo = Math.min(0.9, ...(all.length ? [Math.min(...all) - 0.01] : [])), hi = Math.max(1.1, ...(all.length ? [Math.max(...all) + 0.01] : []));
  const X = (t) => ((t - (now - windowMs)) / windowMs) * W;
  const Y = (y) => H - ((y - lo) / (hi - lo)) * H;
  const { normal } = live.limits;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" preserveAspectRatio="none">
      <rect x="0" y={Y(normal[1])} width={W} height={Y(normal[0]) - Y(normal[1])} fill="#22c55e" opacity="0.08" />
      {[normal[0], 1, normal[1]].map((y) => <line key={y} x1="0" x2={W} y1={Y(y)} y2={Y(y)} stroke="#475569" strokeDasharray={y === 1 ? '0' : '3 4'} strokeWidth="0.7" />)}
      {series.map((s, k) => s.length > 1 && (
        <polyline key={k} fill="none" stroke={PHASES[k].color} strokeWidth="1.6" vectorEffect="non-scaling-stroke"
          points={s.map((p) => `${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} />
      ))}
      <text x="3" y={Y(normal[1]) - 2} fontSize="8" fill="#64748b">{normal[1]} pu</text>
      <text x="3" y={Y(normal[0]) + 9} fontSize="8" fill="#64748b">{normal[0]} pu</text>
    </svg>
  );
}
