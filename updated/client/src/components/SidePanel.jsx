import { useEffect } from 'react';
import { live, useLive, useTick, seedHistory, phaseStatus, effectiveStatus, STATUS_COLOR, STATUS_LABEL, PHASES } from '../store';
import { getHistory } from '../api';
import Sparkline from './Sparkline';

const KIND = { house: 'Residential load', commercial: 'Commercial / 3-phase load', substation: 'Substation (source)', empty: 'Junction (no load)' };
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function Overview({ buses, onSelect }) {
  const rows = [];
  const counts = [0, 0, 0, 0];
  for (const b of buses.values()) {
    const rec = live.buses.get(b.id), s = effectiveStatus(rec);
    if (b.measured !== false) counts[s]++;
    if (rec) {
      const p = rec.v.map((x) => x / live.vBase).filter((x) => x > 0.05);
      if (p.length) rows.push({ id: b.id, min: Math.min(...p), max: Math.max(...p), s });
    }
  }
  const worst = [...rows].sort((a, b) => a.min - b.min).slice(0, 6);
  const hi = [...rows].sort((a, b) => b.max - a.max)[0];
  return (
    <div className="panel-body">
      <h2>Feeder overview</h2>
      <div className="grid4">
        {counts.map((c, s) => (
          <div key={s} className="stat"><b style={{ color: STATUS_COLOR[s] }}>{c}</b><span>{STATUS_LABEL[s]}</span></div>
        ))}
      </div>
      {!rows.length && <p className="hint">Waiting for UDP data from MATLAB… (or run <code>npm run sim</code>)</p>}
      {!!rows.length && (
        <>
          <h3>Lowest voltages</h3>
          <ul className="list">
            {worst.map((w) => (
              <li key={w.id} onClick={() => onSelect(w.id)}>
                <span>Bus {w.id}</span><span style={{ color: STATUS_COLOR[w.s] }}>{w.min.toFixed(3)} pu</span>
              </li>
            ))}
          </ul>
          {hi && <p className="hint">Highest: bus {hi.id} at {hi.max.toFixed(3)} pu</p>}
        </>
      )}
      <p className="hint">Click any house in the 3D city to focus it and see its live readings. Left-drag orbit · right-drag pan · wheel zoom · Esc to go back.</p>
    </div>
  );
}

export default function SidePanel({ selectedId, buses, onSelect }) {
  useLive(); useTick(1000);
  const b = buses.get(selectedId);

  useEffect(() => {                       // pre-fill the trace with what the server already has
    if (selectedId == null) return;
    getHistory(selectedId, 30).then((r) => r.rows?.length && seedHistory(selectedId, r.rows)).catch(() => {});
  }, [selectedId]);

  if (selectedId == null || !b) return <aside className="panel"><Overview buses={buses} onSelect={onSelect} /></aside>;

  const rec = live.buses.get(selectedId);
  const s = effectiveStatus(rec), age = rec ? Date.now() - rec.ts : null;
  const pu = rec ? rec.v.map((x) => x / live.vBase) : [NaN, NaN, NaN];
  const present = pu.filter((x) => x > 0.05);
  const avg = present.reduce((a, c) => a + c, 0) / (present.length || 1);
  const unb = present.length === 3 ? (Math.max(...present.map((x) => Math.abs(x - avg))) / avg) * 100 : null;

  return (
    <aside className="panel">
      <div className="panel-body">
        <button className="back" onClick={() => onSelect(null)}>← overview</button>
        <div className="head">
          <h2>{b.name ?? `Bus ${b.id}`}</h2>
          <span className="badge" style={{ background: STATUS_COLOR[s] }}>{STATUS_LABEL[s]}</span>
        </div>
        <p className="sub">{KIND[b.kind] ?? b.kind} · bus #{b.id}</p>

        {b.measured === false ? (
          <p className="hint">This bus is an open-switch terminal and has no voltage measurement in the Simulink model.</p>
        ) : !rec ? (
          <p className="hint">No UDP sample received for this bus yet.</p>
        ) : (
          <>
            <div className="age" style={{ color: age > live.staleMs ? '#f59e0b' : '#94a3b8' }}>
              {age > live.staleMs ? `stale · last update ${(age / 1000).toFixed(0)} s ago` : `live · updated ${(age / 1000).toFixed(1)} s ago`} · sim t = {fmt(rec.simTime, 2)} s
            </div>
            <div className="phases">
              {PHASES.map((p, k) => {
                const ps = phaseStatus(pu[k]);
                return (
                  <div key={p.key} className="phase" style={{ borderColor: ps == null ? '#1e293b' : STATUS_COLOR[ps] }}>
                    <div className="ph-h" style={{ color: p.color }}>Phase {p.key}</div>
                    {ps == null ? <div className="ph-na">not present</div> : (
                      <>
                        <div className="ph-v">{fmt(rec.v[k], 1)}<small> V</small></div>
                        <div className="ph-pu" style={{ color: STATUS_COLOR[ps] }}>{pu[k].toFixed(4)} pu</div>
                        <div className="ph-a">∠ {fmt(rec.a[k], 2)}°</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {unb != null && <div className="kv"><span>Voltage unbalance</span><b>{unb.toFixed(2)} %</b></div>}
            <h3>Last 30 s <span className="legend">{PHASES.map((p) => <i key={p.key} style={{ background: p.color }} />)}A · B · C</span></h3>
            <Sparkline hist={live.hist.get(selectedId) ?? []} />
          </>
        )}

        <h3>Load &amp; connection</h3>
        <div className="kv"><span>Active power</span><b>{fmt(b.P_kW, 0)} kW</b></div>
        <div className="kv"><span>Reactive power</span><b>{fmt(b.Q_kvar, 0)} kvar</b></div>
        <div className="kv"><span>Load model</span><b>{b.loadType?.replace('_', ' ') ?? '—'}</b></div>
        <div className="kv"><span>Phases / connection</span><b>{b.phases}-ph · {b.connection === 'D' ? 'Delta' : 'Wye'}</b></div>
        {b.capKvar > 0 && <div className="kv"><span>Capacitor bank</span><b>{fmt(b.capKvar, 0)} kvar</b></div>}
        <h3>Connected to</h3>
        <div className="chips">
          {b.neighbors?.map((n) => <button key={n} onClick={() => onSelect(n)}>Bus {n}</button>)}
        </div>
      </div>
    </aside>
  );
}
