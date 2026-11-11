import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import CityScene from './components/CityScene.jsx';
import SidePanel from './components/SidePanel.jsx';
import TopBar from './components/TopBar.jsx';
import { live, applyFrame, setMeta, STATUS_COLOR, STATUS_LABEL } from './store';
import { getBuses } from './api';

export default function App() {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [heatmap, setHeatmap] = useState(true);
  const buses = useMemo(() => new Map(list.map((b) => [b.id, b])), [list]);

  useEffect(() => { getBuses().then(setList).catch((e) => console.error('API not reachable', e)); }, []);

  useEffect(() => {
    const s = io({ transports: ['websocket'] });
    s.on('connect', () => setMeta({ connected: true }));
    s.on('disconnect', () => setMeta({ connected: false }));
    s.on('hello', (h) => { live.vBase = h.vBase; live.limits = h.limits; live.staleMs = h.staleMs; applyFrame(h.snapshot); });
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
        <CityScene selectedId={selectedId} onSelect={setSelectedId} heatmap={heatmap} buses={buses} />
      </div>
      <TopBar buses={buses} onSelect={setSelectedId} heatmap={heatmap} setHeatmap={setHeatmap} />
      <SidePanel selectedId={selectedId} buses={buses} onSelect={setSelectedId} />
      <div className="legend">
        {STATUS_LABEL.map((l, i) => <span key={l}><i style={{ background: STATUS_COLOR[i] }} />{l}</span>)}
        <em>0.95–1.05 pu normal · 0.90–1.10 warning</em>
      </div>
    </div>
  );
}
