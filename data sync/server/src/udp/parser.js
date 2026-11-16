/**
 * UDP packet decoding. Two wire formats are accepted (auto-detected):
 *
 * 1) BINARY (little-endian float64, what MATLAB/Simulink "UDP Send" produces)
 *      [ version=1, simTime, N,  then N rows of: busId, |Va|, |Vb|, |Vc|, angA, angB, angC ]
 *    magnitudes in volts (phase-to-ground RMS), angles in degrees.
 *    A packet may carry any subset of buses (use ~25 per packet to stay under the 1500 B MTU).
 *
 * 2) JSON text (first non-space char is "{"):
 *      { "t": 1.2, "ids": [1,7], "vmag": [[a,b,c],[a,b,c]], "vang": [[a,b,c],[a,b,c]] }
 *    (vang optional)  — or —  { "t":1.2, "buses":[ {"id":1,"v":[a,b,c],"a":[a,b,c]} ] }
 */
export const BIN_VERSION = 1;
export const PMU_VERSION = 2;
const ROW = 7;

const tri = (x) => {
  if (!Array.isArray(x) || x.length < 1) return [NaN, NaN, NaN];
  return [Number(x[0]), Number(x[1] ?? 0), Number(x[2] ?? 0)];
};

/**
 * PMU packet (version 2, little-endian float64) – one chunk of one PMU frame:
 *   [ 2, pmuId, seq, tLocalMs, tTrueS, chunkIdx, chunkCount, N,  N x (busId, |Va|,|Vb|,|Vc|, angA,angB,angC) ]
 *   tLocalMs : timestamp from the PMU's OWN (unsynchronised) clock, milliseconds
 *   tTrueS   : simulation time in seconds, or NaN. Diagnostics only – the synchroniser never uses it.
 * All chunks of one frame share pmuId + seq + tLocalMs; the ingest stage reassembles them.
 */
export function parsePmuPacket(buf) {
  if (buf.length % 8 !== 0 || buf.length < 64) throw new Error(`bad PMU packet length ${buf.length}`);
  const d = (i) => buf.readDoubleLE(i * 8);
  if (d(0) !== PMU_VERSION) throw new Error(`not a PMU v2 packet (version ${d(0)})`);
  const pmuId = d(1), seq = d(2), tLocalMs = d(3), tTrueS = d(4), chunk = d(5), chunks = d(6), n = d(7);
  if (!Number.isInteger(pmuId) || !Number.isInteger(seq) || !Number.isInteger(n) || n < 0 || !Number.isFinite(tLocalMs)
      || !Number.isInteger(chunk) || !Number.isInteger(chunks) || chunk < 0 || chunk >= chunks)
    throw new Error('bad PMU header');
  if (buf.length / 8 !== 8 + ROW * n) throw new Error(`size mismatch: n=${n} len=${buf.length}`);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const o = 8 + k * ROW, id = d(o);
    if (!Number.isInteger(id) || id <= 0) continue;
    rows.push({ id, v: [d(o + 1), d(o + 2), d(o + 3)], a: [d(o + 4), d(o + 5), d(o + 6)] });
  }
  return { pmuId, seq, tLocalMs, tTrueS: Number.isFinite(tTrueS) ? tTrueS : null, chunk, chunks, rows };
}

export function encodePmuPacket({ pmuId, seq, tLocalMs, tTrueS = NaN, chunk = 0, chunks = 1, rows }) {
  const b = Buffer.alloc((8 + ROW * rows.length) * 8);
  let i = 0; const w = (x) => b.writeDoubleLE(x, 8 * i++);
  w(PMU_VERSION); w(pmuId); w(seq); w(tLocalMs); w(tTrueS); w(chunk); w(chunks); w(rows.length);
  for (const r of rows) { w(r.id); r.v.forEach(w); r.a.forEach(w); }
  return b;
}

export function parsePacket(buf) {
  let firstByte = 0;
  for (const b of buf) { if (b > 32) { firstByte = b; break; } }
  return firstByte === 0x7b ? parseJson(buf) : parseBinary(buf);
}

function parseBinary(buf) {
  if (buf.length % 8 !== 0 || buf.length < 24) throw new Error(`bad binary length ${buf.length}`);
  const d = (i) => buf.readDoubleLE(i * 8);
  if (d(0) !== BIN_VERSION) throw new Error(`unsupported version ${d(0)}`);
  const simTime = d(1), n = d(2);
  if (!Number.isInteger(n) || n < 0 || buf.length / 8 !== 3 + ROW * n)
    throw new Error(`size mismatch: n=${n} len=${buf.length}`);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const o = 3 + k * ROW, id = d(o);
    if (!Number.isInteger(id) || id <= 0) continue;
    rows.push({ id, v: [d(o + 1), d(o + 2), d(o + 3)], a: [d(o + 4), d(o + 5), d(o + 6)] });
  }
  return { simTime, rows };
}

function parseJson(buf) {
  const j = JSON.parse(buf.toString('utf8'));
  const simTime = Number(j.t ?? j.simTime ?? 0);
  const rows = [];
  if (Array.isArray(j.buses)) {
    for (const b of j.buses) rows.push({ id: Number(b.id), v: tri(b.v), a: b.a ? tri(b.a) : [0, -120, 120] });
  } else if (Array.isArray(j.ids) && Array.isArray(j.vmag)) {
    j.ids.forEach((id, k) => rows.push({ id: Number(id), v: tri(j.vmag[k]), a: j.vang ? tri(j.vang[k]) : [0, -120, 120] }));
  } else throw new Error('JSON must contain "buses" or "ids"+"vmag"');
  return { simTime, rows: rows.filter((r) => Number.isInteger(r.id) && r.id > 0) };
}

/** Encoder used by the simulator and the tests. */
export function encodeBinary(simTime, rows) {
  const b = Buffer.alloc((3 + ROW * rows.length) * 8);
  let i = 0; const w = (x) => b.writeDoubleLE(x, 8 * i++);
  w(BIN_VERSION); w(simTime); w(rows.length);
  for (const r of rows) { w(r.id); r.v.forEach(w); r.a.forEach(w); }
  return b;
}
