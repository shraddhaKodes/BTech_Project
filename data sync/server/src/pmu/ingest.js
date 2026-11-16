import dgram from 'node:dgram';
import { parsePmuPacket } from '../udp/parser.js';
import { TOPICS } from '../mq/index.js';

/**
 * Stage 1 – ingest. One UDP socket per PMU. Chunks of a frame are reassembled, stamped with the server arrival
 * time and published to the `pmu.raw` topic (key = pmuId → one partition per PMU keeps its frames ordered).
 * Nothing here touches the clock model: ingest only has to be fast and never block on downstream work.
 */
export function startPmuIngest({ sectors, bus, metrics, log = console, partialTimeoutMs = 150 }) {
  const socks = [];
  for (const pmu of sectors.pmus.values()) {
    const m = metrics.pmus.get(pmu.id);
    const pending = new Map();                       // seq -> { chunks:Map, ta, ... }
    const publish = (key, f) => bus.publish(TOPICS.raw, pmu.id, f).catch((e) => log.warn('[ingest] publish failed:', e.message));
    const flush = (seq, partial) => {
      const f = pending.get(seq); if (!f) return;
      pending.delete(seq); clearTimeout(f.timer);
      const rows = [...f.chunks.values()].flat();
      if (partial) { m.partial++; bus.publish(TOPICS.dlq, pmu.id, { reason: 'partial-frame', pmuId: pmu.id, seq, got: f.chunks.size, of: f.total }).catch(() => {}); return; }
      publish(pmu.id, { pmuId: pmu.id, seq, tLocalMs: f.tLocalMs, tTrueS: f.tTrueS, ta: f.ta, rows });
    };
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('message', (msg) => {
      const ta = performance.timeOrigin + performance.now();   // epoch ms with sub-millisecond resolution
      let p;
      try { p = parsePmuPacket(msg); } catch (e) { m.bad++; if (m.bad <= 3) log.warn(`[ingest:pmu${pmu.id}] ${e.message}`); return; }
      if (p.pmuId !== pmu.id) { m.bad++; return; }
      let f = pending.get(p.seq);
      if (!f) {
        f = { chunks: new Map(), total: p.chunks, ta, tLocalMs: p.tLocalMs, tTrueS: p.tTrueS, timer: null };
        f.timer = setTimeout(() => flush(p.seq, true), partialTimeoutMs);
        pending.set(p.seq, f);
      }
      f.chunks.set(p.chunk, p.rows);
      if (f.chunks.size === f.total) flush(p.seq, false);
    });
    sock.on('error', (e) => log.error(`[ingest:pmu${pmu.id}] socket error`, e.message));
    sock.bind(pmu.port, '0.0.0.0', () => log.log(`[ingest] PMU ${pmu.id} (${pmu.name}, ${pmu.rateHz} Hz) listening on UDP :${pmu.port}`));
    socks.push(sock);
  }
  return { close: () => socks.forEach((s) => { try { s.close(); } catch { /* already closed */ } }) };
}
