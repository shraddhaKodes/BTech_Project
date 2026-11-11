import { Server } from 'socket.io';
import { db } from './db.js';

const r2 = (a) => a.map((x) => Math.round(x * 100) / 100);

/** Wire-format per bus: [Va,Vb,Vc (V), angA,angB,angC (deg), status] */
const pack = (b) => [...r2(b.v), ...r2(b.a), b.s];

export function attachSocket(httpServer, state, cfg) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  const frameFor = (ids) => {
    const buses = {};
    for (const id of ids) { const b = state.buses.get(id); if (b) buses[id] = pack(b); }
    return { ts: Date.now(), simTime: state.stats.lastSimTime, buses };
  };

  io.on('connection', (sock) => {
    sock.emit('hello', {
      vBase: cfg.vBaseLN, limits: cfg.limits, staleMs: cfg.staleMs,
      snapshot: frameFor([...state.buses.keys()]),
    });
  });

  // delta frames: only buses that changed since the previous emit
  const frameTimer = setInterval(() => {
    const ids = state.takeDirty('ws');
    if (ids.length) io.volatile.emit('frame', frameFor(ids));
  }, 1000 / cfg.emitHz);

  const statusTimer = setInterval(() => {
    io.emit('status', {
      pps: state.packetsPerSecond(), packets: state.stats.packets, bad: state.stats.badPackets,
      lastPacketAgoMs: state.stats.lastPacketTs ? Date.now() - state.stats.lastPacketTs : null,
      simTime: state.stats.lastSimTime, mongo: db.ready, clients: io.engine.clientsCount,
      summary: state.summary(),
    });
  }, 1000);

  io.close_timers = () => { clearInterval(frameTimer); clearInterval(statusTimer); };
  return io;
}
