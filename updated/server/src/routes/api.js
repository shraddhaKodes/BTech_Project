import { Router } from 'express';
import { db } from '../db.js';
import { Bus } from '../models/Bus.js';
import { Reading } from '../models/Reading.js';

export function createApi({ state, network, cfg }) {
  const r = Router();
  const staticById = new Map(network.nodes.map((n) => [n.id, n]));

  const withLive = (b) => ({ ...b, live: state.buses.get(b.id) ?? null });

  async function listBuses() {
    if (db.ready) {
      const docs = await Bus.find().sort({ _id: 1 }).lean();
      return docs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
    }
    return network.nodes;
  }

  r.get('/health', (_req, res) => res.json({
    ok: true, mongo: db.ready, udp: { ...state.stats, pps: state.packetsPerSecond() }, vBaseLN: cfg.vBaseLN,
  }));

  r.get('/network', (_req, res) => res.json(network));                 // nodes + edges (topology)
  r.get('/summary', (_req, res) => res.json(state.summary()));
  r.get('/buses', async (_req, res, next) => { try { res.json(await listBuses()); } catch (e) { next(e); } });

  r.get('/buses/:id', async (req, res, next) => {
    try {
      const id = +req.params.id;
      const b = (await listBuses()).find((x) => x.id === id);
      if (!b) return res.status(404).json({ error: 'unknown bus' });
      res.json(withLive(b));
    } catch (e) { next(e); }
  });

  r.patch('/buses/:id', async (req, res, next) => {            // edit name / notes (needs MongoDB)
    try {
      if (!db.ready) return res.status(503).json({ error: 'MongoDB not connected' });
      const { name, notes } = req.body ?? {};
      const doc = await Bus.findByIdAndUpdate(+req.params.id, { $set: { ...(name && { name }), ...(notes !== undefined && { notes }) } }, { new: true }).lean();
      if (!doc) return res.status(404).json({ error: 'unknown bus' });
      res.json(doc);
    } catch (e) { next(e); }
  });

  /** GET /api/buses/83/history?seconds=60   (RAM when it covers the window, otherwise MongoDB) */
  r.get('/buses/:id/history', async (req, res, next) => {
    try {
      const id = +req.params.id;
      if (!staticById.has(id)) return res.status(404).json({ error: 'unknown bus' });
      const seconds = Math.min(Math.max(+req.query.seconds || 60, 1), 7 * 86400);
      const since = Date.now() - seconds * 1000;
      const ram = (state.history.get(id) ?? []).filter((h) => h.ts >= since);
      const ramCovers = ram.length && ram[0].ts <= since + 1500;
      if (db.ready && (req.query.source === 'db' || !ramCovers)) {
        const rows = await Reading.find({ busId: id, ts: { $gte: new Date(since) } }).sort({ ts: 1 }).limit(5000).lean();
        return res.json({ source: 'db', rows: rows.map((x) => ({ ts: +x.ts, t: x.simTime, v: x.v, s: x.s })) });
      }
      res.json({ source: 'memory', rows: ram });
    } catch (e) { next(e); }
  });

  return r;
}
