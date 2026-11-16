#!/usr/bin/env node
/**
 * Fake "MATLAB" – streams plausible IEEE-123 voltages over UDP so you can test without Simulink.
 *   node server/scripts/simulate-udp.js [--host 127.0.0.1] [--port 5005] [--rate 10] [--format binary|json] [--event]
 * --event : every 60 s a voltage sag hits the feeder downstream of bus 76 (turns houses amber/red).
 */
import dgram from 'node:dgram';
import fs from 'node:fs';
import { encodeBinary } from '../src/udp/parser.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };
const host = arg('host', '127.0.0.1'), port = +arg('port', 5005), rate = +arg('rate', 10);
const format = arg('format', 'binary'), withEvent = arg('event', false) !== false;
const CHUNK = 25, VBASE = 2401.78, SOURCE = 150, EVENT_ROOT = 76;

const net = JSON.parse(fs.readFileSync(new URL('../data/network.json', import.meta.url)));
const adj = new Map(net.nodes.map((n) => [n.id, []]));
for (const e of net.edges) if (e.state !== 'open') { adj.get(e.from).push([e.to, e]); adj.get(e.to).push([e.from, e]); }

// BFS from the substation: cumulative feeder length, phase count and parent
const info = new Map([[SOURCE, { dist: 0, ph: 3, parent: null }]]);
const queue = [SOURCE];
while (queue.length) {
  const u = queue.shift();
  for (const [v, e] of adj.get(u)) if (!info.has(v)) {
    const p = info.get(u);
    info.set(v, { dist: p.dist + (e.lengthFt ?? 300), ph: Math.min(p.ph, e.phases >= 3 ? 3 : e.phases || 1), parent: u });
    queue.push(v);
  }
}
const maxDist = Math.max(...[...info.values()].map((i) => i.dist));
const inSubtree = (id, root) => { for (let c = id; c != null; c = info.get(c)?.parent) if (c === root) return true; return false; };
const buses = net.nodes.filter((n) => n.measured && info.has(n.id)).map((n) => ({ id: n.id, ...info.get(n.id) }));
const sock = dgram.createSocket('udp4');

let t = 0, sent = 0;
const smooth = (x) => x * x * (3 - 2 * x);
function sample() {
  const load = 1 + 0.18 * Math.sin((2 * Math.PI * t) / 40) + 0.05 * Math.sin((2 * Math.PI * t) / 7.3);
  const ph = t % 60, sag = withEvent && ph > 20 && ph < 40 ? smooth(Math.min(1, Math.min(ph - 20, 40 - ph) / 4)) : 0;
  return buses.map((b) => {
    const base = 1.02 - 0.06 * Math.pow(b.dist / maxDist, 0.85) * load - (sag && inSubtree(b.id, EVENT_ROOT) ? 0.11 * sag : 0);
    const present = b.ph === 3 ? [0, 1, 2] : b.ph === 2 ? [b.id % 3, (b.id + 1) % 3] : [b.id % 3];
    const off = [-0.006, 0.004, 0];
    const v = [0, 1, 2].map((k) => (present.includes(k) ? (base + off[k] + (Math.random() - 0.5) * 0.0016) * VBASE : 0));
    const a = [0, -120, 120].map((x, k) => (present.includes(k) ? x - (b.dist / 3000) * (1 + 0.1 * k) : 0));
    return { id: b.id, v, a };
  });
}

function tick() {
  const rows = sample();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const msg = format === 'json'
      ? Buffer.from(JSON.stringify({ t, ids: part.map((r) => r.id), vmag: part.map((r) => r.v), vang: part.map((r) => r.a) }))
      : encodeBinary(t, part);
    sock.send(msg, port, host); sent++;
  }
  t += 1 / rate;
}
setInterval(tick, 1000 / rate);
setInterval(() => console.log(`[sim] t=${t.toFixed(1)}s  packets sent=${sent}  buses=${buses.length}  → ${host}:${port} (${format}${withEvent ? ', sag event on' : ''})`), 5000);
console.log(`[sim] streaming ${buses.length} buses @ ${rate} Hz to ${host}:${port}`);
