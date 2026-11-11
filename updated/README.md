# IEEE 123-bus · Live City (MERN + three.js)

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
docker compose up -d mongo   # optional – or point MONGO_URI at your own MongoDB
npm run dev                  # server :4000 (+ UDP :5005)  and  client http://localhost:5173
npm run sim -- --event       # fake MATLAB: streams 125 buses @10 Hz (--event adds a sag every 60 s)
```

Open http://localhost:5173. Production: `npm run build && npm start` (Express then serves `client/dist` on :4000).

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
server/  src/udp/{parser,listener}.js  src/state.js  src/socket.js  src/routes/api.js  src/models/{Bus,Reading}.js
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
