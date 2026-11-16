import dgram from 'node:dgram';
import { parsePacket } from './parser.js';

/** Starts a UDP listener that feeds decoded packets into `state`. Returns the socket. */
export function startUdp(state, { port, host = '0.0.0.0', log = console }) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', (msg) => {
    try {
      const { simTime, rows } = parsePacket(msg);
      state.apply(simTime, rows);
    } catch (e) {
      state.stats.badPackets++;
      if (state.stats.badPackets <= 5 || state.stats.badPackets % 100 === 0)
        log.warn(`[udp] dropped packet (${msg.length} B): ${e.message}`);
    }
  });
  sock.on('error', (e) => log.error('[udp] socket error', e));
  return new Promise((resolve) =>
    sock.bind(port, host, () => { log.log(`[udp] listening on ${host}:${sock.address().port}`); resolve(sock); }));
}
