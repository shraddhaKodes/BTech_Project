import { useState } from 'react';
import { live, useLive, useTick } from '../store';

export default function TopBar({ buses, onSelect, mode, setMode }) {
  useLive(); useTick(1000);
  const [q, setQ] = useState('');
  const st = live.meta.status;
  const udpOk = st && st.lastPacketAgoMs != null && st.lastPacketAgoMs < live.staleMs;
  const go = () => { const id = parseInt(q, 10); if (buses.has(id)) { onSelect(id); setQ(''); } };
  return (
    <header className="topbar">
      <div className="brand">⚡ IEEE 123-bus <span>live city</span></div>
      <div className="search">
        <input list="bus-list" placeholder="Go to bus…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <datalist id="bus-list">{[...buses.keys()].map((id) => <option key={id} value={id} />)}</datalist>
        <button onClick={go}>Focus</button>
      </div>
      <div className="seg">
        <button className={mode === 'voltage' ? 'on' : ''} onClick={() => setMode('voltage')}>Voltage heat-map</button>
        <button className={mode === 'sector' ? 'on' : ''} onClick={() => setMode('sector')}>PMU sectors</button>
      </div>
      <div className="chips status">
        <span className={`dot ${live.meta.connected ? 'ok' : 'bad'}`}>server</span>
        <span className={`dot ${udpOk ? 'ok' : 'warn'}`}>UDP {udpOk ? `${(st.pps ?? 0).toFixed(0)} pkt/s` : 'no data'}</span>
        {st?.pmu && <span className={`dot ${st.pmu.align.fps > 1 ? 'ok' : 'warn'}`}>sync {st.pmu.align.fps.toFixed(0)} fr/s · {st.pmu.backend.mq}/{st.pmu.backend.cache}</span>}
        {st && <span className="dot plain">sim t = {st.simTime?.toFixed(1)} s</span>}
        {st && <span className={`dot ${st.mongo ? 'ok' : 'warn'}`}>{st.mongo ? 'MongoDB' : 'memory only'}</span>}
      </div>
    </header>
  );
}
