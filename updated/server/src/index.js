import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { LiveState } from './state.js';
import { startUdp } from './udp/listener.js';
import { connectDb, db } from './db.js';
import { Bus, seedBuses } from './models/Bus.js';
import { Reading } from './models/Reading.js';
import { createApi } from './routes/api.js';
import { attachSocket } from './socket.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const network = JSON.parse(fs.readFileSync(path.join(here, '../data/network.json'), 'utf8'));

const state = new LiveState(config);
await startUdp(state, { port: config.udpPort, host: config.udpHost });

if (await connectDb(config.mongoUri)) {
  await seedBuses(network.nodes);
  console.log(`[db] ${network.nodes.length} buses seeded`);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', createApi({ state, network, cfg: config }));

const dist = path.join(here, '../../client/dist');            // production: serve the built React app
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
attachSocket(server, state, config);

// batched, decimated persistence of readings
setInterval(async () => {
  const ids = state.takeDirty('db');
  if (!db.ready || !ids.length) return;
  const docs = ids.map((id) => {
    const b = state.buses.get(id);
    return { busId: id, ts: new Date(b.ts), simTime: b.simTime, v: b.v, a: b.a, s: b.s };
  });
  try { await Reading.insertMany(docs, { ordered: false }); }
  catch (e) { console.warn('[db] insert failed:', e.message); }
}, config.dbIntervalMs);

server.listen(config.httpPort, () => console.log(`[http] API + websocket on http://localhost:${config.httpPort}`));
