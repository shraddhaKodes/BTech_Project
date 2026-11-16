import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { LiveState } from '../src/state.js';
import { startUdp } from '../src/udp/listener.js';
import { encodeBinary } from '../src/udp/parser.js';

const quiet = { log() {}, warn() {}, error() {} };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('UDP → listener → state (real socket on loopback)', async () => {
  const state = new LiveState();
  const sock = await startUdp(state, { port: 0, host: '127.0.0.1', log: quiet });
  const tx = dgram.createSocket('udp4');
  tx.send(encodeBinary(3.2, [{ id: 83, v: [2380, 2395, 2402], a: [0, -120, 120] }]), sock.address().port, '127.0.0.1');
  tx.send(Buffer.from('garbage'), sock.address().port, '127.0.0.1');
  for (let i = 0; i < 20 && !state.buses.has(83); i++) await wait(25);
  await wait(50);
  assert.equal(state.buses.get(83).v[0], 2380);
  assert.equal(state.stats.lastSimTime, 3.2);
  assert.equal(state.stats.badPackets, 1);
  assert.deepEqual(state.takeDirty('ws'), [83]);
  tx.close(); sock.close();
});
