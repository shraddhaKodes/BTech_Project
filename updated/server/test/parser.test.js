import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePacket, encodeBinary } from '../src/udp/parser.js';
import { classify, STATUS } from '../src/state.js';

const rows = [{ id: 83, v: [2400, 2390, 2410], a: [0, -120, 120] }, { id: 7, v: [2300, 0, 0], a: [-1, 0, 0] }];

test('binary roundtrip', () => {
  const p = parsePacket(encodeBinary(12.5, rows));
  assert.equal(p.simTime, 12.5); assert.deepEqual(p.rows, rows);
});
test('json (ids + vmag) and json (buses)', () => {
  const a = parsePacket(Buffer.from(JSON.stringify({ t: 1, ids: [83], vmag: [[1, 2, 3]], vang: [[0, -120, 120]] })));
  assert.deepEqual(a.rows, [{ id: 83, v: [1, 2, 3], a: [0, -120, 120] }]);
  const b = parsePacket(Buffer.from(JSON.stringify({ t: 1, buses: [{ id: 5, v: [9, 9, 9] }] })));
  assert.equal(b.rows[0].id, 5);
});
test('malformed packets are rejected', () => {
  assert.throws(() => parsePacket(Buffer.from('hello')));
  assert.throws(() => parsePacket(encodeBinary(0, rows).subarray(0, 40)));
  assert.throws(() => parsePacket(Buffer.from('{"foo":1}')));
});
test('classify uses per-unit bands and ignores absent phases', () => {
  assert.equal(classify([1.0, 0.99, 1.01]), STATUS.NORMAL);
  assert.equal(classify([0.93, 1.0, 1.0]), STATUS.WARN);
  assert.equal(classify([0.88, 1.0, 1.0]), STATUS.VIOLATION);
  assert.equal(classify([1.0, 0, 0]), STATUS.NORMAL);
  assert.equal(classify([0, 0, 0]), STATUS.NODATA);
});
