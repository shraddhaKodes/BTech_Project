import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import CityScene from './components/CityScene.jsx';
import SidePanel from './components/SidePanel.jsx';
import TopBar from './components/TopBar.jsx';
import { live, applyFrame, setMeta, setSectors, STATUS_COLOR, STATUS_LABEL } from './store';
import { getBuses } from './api';
import { useLive } from './store';

export default function App() {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('voltage');          // 'voltage' heat-map | 'sector' colouring
  useLive();
  const buses = useMemo(() => new Map(list.map((b) => [b.id, b])), [list]);

  useEffect(() => { getBuses().then(setList).catch((e) => console.error('API not reachable', e)); }, []);

  useEffect(() => {
    const s = io({ transports: ['websocket'] });
    s.on('connect', () => setMeta({ connected: true }));
    s.on('disconnect', () => setMeta({ connected: false }));
    s.on('hello', (h) => { live.vBase = h.vBase; live.limits = h.limits; live.staleMs = h.staleMs; setSectors(h.sectors ?? []); applyFrame(h.snapshot); });
    s.on('frame', applyFrame);
    s.on('status', (st) => setMeta({ status: st }));
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && setSelectedId(null);
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <div className="app">
      <div className="scene">
        <CityScene selectedId={selectedId} onSelect={setSelectedId} mode={mode} buses={buses} />
      </div>
      <TopBar buses={buses} onSelect={setSelectedId} mode={mode} setMode={setMode} />
      <SidePanel selectedId={selectedId} buses={buses} onSelect={setSelectedId} />
      <div className="legend">
        {mode === 'sector'
          ? <>{live.sectors.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.name} · {s.buses.length} buses</span>)}<em>coverage of each PMU</em></>
          : <>{STATUS_LABEL.map((l, i) => <span key={l}><i style={{ background: STATUS_COLOR[i] }} />{l}</span>)}<em>0.95–1.05 pu normal · 0.90–1.10 warning</em></>}
      </div>
    </div>
  );
}
