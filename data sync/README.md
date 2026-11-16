# IEEE 123-bus · Live City (MERN + three.js + two-PMU sync pipeline)

MATLAB/Simulink streams bus voltages over **UDP** → Node server decodes them → **Socket.IO** pushes them to a
**React + three.js** city where every bus is a house. Click a house: the camera flies to it and the side panel
shows its live voltages (per phase, volts / per-unit / angle), status, a 30 s trace and its load data.
**MongoDB** stores the bus metadata and a decimated history of readings.

```
Simulink ──UDP :5005──▶ server/udp ─▶ LiveState (RAM, ring buffers) ─┬─▶ Socket.IO 'frame' (10 Hz deltas) ─▶ React/three.js
                                                                      └─▶ MongoDB (buses, readings w/ TTL)   ◀─ REST /api
```

## Quick start

Requirements: Node ≥ 20 (22 recommended). MongoDB is optional — without it the app runs in "memory only" mode.

```bash
npm install && npm run install:all     # root (concurrently) + server + client dependencies
# optional: a native MongoDB (mongod) for history – without it the app runs in memory-only mode
npm run dev                  # server :4000 (+ UDP :5005)  and  client http://localhost:5173
npm run sim -- --event       # fake MATLAB: streams 125 buses @10 Hz (--event adds a sag every 60 s)
```

Open http://localhost:5173. Production: `npm run build && npm start` (Express then serves `client/dist` on :4000).

## Two heterogeneous PMUs + synchronisation pipeline

The feeder is split into **Sector 1** (62 buses, substation side) and **Sector 2** (63 buses, everything downstream of bus 57)
in `server/data/sectors.json`. Each sector is observed by its own PMU with its **own clock, reporting rate and sampling phase**
(default: PMU 1 = 30 Hz, clock exact; PMU 2 = 25 Hz, +5 ms offset, 80 ppm drift, 7 ms phase). Their timestamps cannot be compared
directly, so frames go through a queue-based pipeline (inspired by the RocketMQ/Canal framework of Ji et al., ICCECT 2023: collect →
durable queue → consume on demand):

```
PMU1 ─UDP :5011─┐                                   ┌─ Redis ZSET  pmu:1:frames  (corrected time = score) ─┐
                ├▶ ingest ─▶ Kafka  pmu.raw ─▶ corrector ─┤                                                ├▶ aligner ─▶ Redis Stream frames:aligned ─▶ gateway ─▶ LiveState ─▶ Socket.IO ─▶ React
PMU2 ─UDP :5012─┘  (chunk reassembly)  (key = pmuId)  (clock model)  └─ Redis ZSET  pmu:2:frames ────────────────┘            └▶ Kafka pmu.aligned (replay / analytics)
                                         late / partial frames ─▶ Kafka pmu.dlq
```

* **Clock model** (`server/src/pmu/clock.js`) – `tLocal = tRef + offset + drift·t`. A min-delay line fit of (PMU stamp, server arrival)
  over the last 600 frames maps each PMU clock onto the server clock (offset, drift ppm, arrival jitter are shown in the UI).
* **Aligner** (`pmu/aligner.js`) – emits frames on a common grid (`SYNC_OUT_HZ`, default 50 Hz). For each grid instant it interpolates every PMU
  between the two corrected samples that bracket it (magnitude linear, angle on the shortest arc) and releases the instant when all live PMUs
  have data past `T + SYNC_LATENESS_MS` (watermark). A silent PMU is held after `SYNC_STALL_MS`; samples behind the watermark go to `pmu.dlq`.
* **Queues** – with `KAFKA_BROKERS` / `REDIS_URL` set the pipeline uses real Kafka (`kafkajs`) and Redis (`ioredis`). Leave them empty and an
  in-process bus/store with the same interface is used, so `npm run dev` still works with zero infrastructure.
* **UI** – top bar toggle *Voltage heat-map / PMU sectors* colours houses by sector; the side panel overview shows per-sector PMU rate (measured vs nominal),
  clock offset, drift, jitter, latency, buffer depth, dropped frames, the synchroniser's output rate/lag/interpolation counters, Kafka lag and a
  raw-vs-corrected timestamp strip against the common grid.

### Run it (no Docker)
```bash
npm install && npm run install:all
npm run dev                      # server (UDP :5005 legacy, :5011/:5012 PMUs) + client
npm run sim:pmu -- --event       # two virtual PMUs (clock offset/drift/jitter from sectors.json; override with --p2-offset 40 --p2-drift 150 …)
npm run bench:sync               # accuracy report (PMU2 with 40 ms offset, 150 ppm drift)
```
Real queues, natively (Linux / WSL2 – Kafka has no good native Windows build):
```bash
sudo apt install redis-server && redis-server --daemonize yes
# Kafka 3.x in KRaft mode (no ZooKeeper), from the unpacked tarball:
KAFKA_CLUSTER_ID=$(bin/kafka-storage.sh random-uuid)
bin/kafka-storage.sh format -t $KAFKA_CLUSTER_ID -c config/kraft/server.properties   # Kafka 4.x: config/server.properties
bin/kafka-server-start.sh config/kraft/server.properties
# then in server/.env:  KAFKA_BROKERS=localhost:9092   REDIS_URL=redis://127.0.0.1:6379
```
Topics (`pmu.raw` 2 partitions, `pmu.aligned`, `pmu.dlq`) are created automatically. From MATLAB use `matlab/stream_pmus_udp.m` instead of
`stream_v123_udp.m` (same V123 variable; it emulates the two PMUs and sends v2 packets to ports 5011/5012). Don't run the legacy v1 stream
and the PMU streams at the same time – both write into the same live state.

PMU packet (v2, little-endian float64): `[2, pmuId, seq, tLocalMs, simTimeS, chunkIdx, chunkCount, N, N×(busId,|Va|,|Vb|,|Vc|,angA,angB,angC)]`.
`simTimeS` is diagnostics only (it feeds the "residual skew" readout); the synchroniser never uses it.

## Connecting MATLAB / Simulink

Your model already logs every bus phasor into one variable, **`V123`** (To Workspace, 0.1 s, a mux of 130 three-phase
complex signals = 390 columns). `matlab/ieee123_signal_order.m` holds the exact signal order (125 buses; 251 and 451
are open-switch terminals without a measurement; RG1-4/XF1 are skipped).

1. **Replay (no model changes)** – after a run:
   ```matlab
   addpath matlab
   out = sim('IEEE123bus_v2019b_Discrete_ZIPload');
   stream_v123_udp(out.V123)              % or: stream_v123_udp(V123,'Time',tout,'Speed',5,'Loop',true)
   ```
2. **Live during simulation** – put `matlab/ieee123_udp_pack.m` in a *MATLAB Function* block fed by the Measurements
   output (`u`) and a Clock (`t`); wire its 5 outputs to 5 DSP System Toolbox *UDP Send* blocks (remote port 5005, Ts 0.1).
   (Pace the simulation with Simulation Pacing so it runs near real time.)
3. **Quick test** – `matlab/send_json_demo.m` sends one JSON packet.

### Wire format (auto-detected, see `server/src/udp/parser.js`)
* **Binary** little-endian float64: `[1, simTime, N, (busId, |Va|,|Vb|,|Vc|, angA,angB,angC) × N]`
  — volts are phase-to-ground RMS, angles in degrees. A packet may carry any subset of buses (25/packet fits one MTU).
* **JSON**: `{"t":1.2,"ids":[83],"vmag":[[2380,2395,2402]],"vang":[[0,-120,120]]}` or `{"t":1.2,"buses":[{"id":83,"v":[..],"a":[..]}]}`

Per-unit base is `V_BASE_LN = 2401.78 V` (4160 V / √3), which is what the model uses everywhere (the 480 V bus 610 is
already scaled to this base inside the model by `Gain2`). Status bands: 0.95–1.05 pu normal, 0.90–1.10 warning, else
violation (`server/src/config.js`). A phase at ≈0 V is shown as "not present".

## Using the UI
Click a house (or type a bus number and press Enter) → smooth camera focus, pulsing ring, live panel.
Neighbour chips in the panel jump along the feeder. `Esc`/click on the ground → back to the overview.
"Voltage heat-map" tints every house green / amber / red by its worst phase (grey = no recent data).

## REST API
`GET /api/health` · `/api/network` (nodes+edges) · `/api/summary` · `/api/buses` · `/api/buses/:id` (static + latest)
· `/api/buses/:id/history?seconds=60[&source=db]` · `PATCH /api/buses/:id {name, notes}` (needs MongoDB).

## Layout
```
server/  src/pmu/{ingest,clock,corrector,aligner,interp,pipeline,metrics}.js  src/mq/{memoryBus,kafkaBus}.js  src/cache/{memoryStore,redisStore}.js  src/sectors.js
         src/udp/{parser,listener}.js  src/state.js  src/socket.js  src/routes/api.js  src/models/{Bus,Reading}.js
         scripts/simulate-udp.js  data/network.json  test/*.test.js   (npm test)
client/  src/App.jsx  src/store.js  src/components/{CityScene,SidePanel,TopBar,Sparkline}.jsx
         public/models/ieee123_city.glb   (objects are named Bus_NNN, Road_a_b, Switch_a_b … carrying custom properties)
matlab/  stream_v123_udp.m  ieee123_udp_pack.m  ieee123_signal_order.m  send_json_demo.m
```
Configuration is via environment variables (`.env.example` → `server/.env`). Replace the model by exporting a new
GLB with the same `Bus_NNN` naming, or use the Blender script to regenerate it.

## Notes
* Readings are written at most once per `DB_SAVE_INTERVAL_MS` per bus and expire after `RETENTION_HOURS` (TTL index).
* UDP has no delivery guarantee; a bus that stops updating turns grey after 3 s.
* Only voltages are shown, because that is what the model exports; extending `parser.js`/`state.js` with currents or
  power is a small change (add columns per row and bump the version number).
