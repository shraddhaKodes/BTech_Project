# IEEE-123 Bus Intelligent Monitoring & Forecasting System

## Overview

This project aims to develop an intelligent monitoring and forecasting system based on the **IEEE 123-bus distribution system**.

The system combines electrical system simulation, backend data management, machine learning, and a SCADA-style frontend.

The project is being developed incrementally. The current backend and ML-service communication are implemented first, while the actual IEEE-123 study will be used to finalize the telemetry structure and ML requirements.

---

## Planned System Architecture

```text
MATLAB / Simulink
       │
       │ Electrical data / telemetry
       ▼
Node.js + Express Backend
       │
       ├──────────────► MongoDB
       │
       │ HTTP
       ▼
Python FastAPI ML Service
       │
       ▼
RNN / LSTM / BiLSTM
       │
       ▼
Prediction
       │
       ▼
React SCADA / Monitoring Interface
```

If real-time communication is required by the final system, **WebSocket communication will be integrated later** between the backend and frontend.

---

## Current Architecture

The currently implemented flow is:

```text
MATLAB / Simulink
       │  HTTP POST  or  TCP (newline-delimited JSON)
       ▼
Node.js / Express  (+ Socket.IO)
       │
       ├──────────────► MongoDB        one document per bus per time step
       │
       │ POST /predict (async queue, never blocks ingestion)
       ▼
Python FastAPI ML Service
       │
       ▼
Forecast per monitored bus
       │
       │ Socket.IO events: measurement / prediction / alarm / status
       ▼
React SCADA dashboard (currently still polls REST)
```

Ingestion is transport-agnostic: HTTP, TCP and any future UDP listener all call the
same `ingestMeasurement()` service, which validates against the feeder topology and
stores one document per bus per step.

---

## Project Structure

```text
BTech_Project/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── app.js
│   ├── data/
│   │   └── feeder_topology.json   # copy of frontend/src/data, used for validation
│   ├── scripts/
│   │   └── cleanTestMeasurements.js
│   ├── server.js
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
│
├── ml-service/
│   ├── app.py
│   ├── requirements.txt
│   └── venv/              # Local only, not committed
│
└── frontend/
```

---

# Current Implementation

## 1. Backend

The backend is implemented using:

* Node.js
* Express.js
* Mongoose
* MongoDB
* Socket.IO
* Axios
* CORS
* dotenv

### Implemented APIs

| Method | Endpoint            | Purpose                                              |
| ------ | ------------------- | ---------------------------------------------------- |
| GET    | `/api/health`       | Backend + MongoDB + ML reachability                  |
| GET    | `/api/stats`        | Packet/loss/latency/prediction counters              |
| GET    | `/api/topology`     | Feeder topology (nodes + edges)                      |
| POST   | `/api/measurements` | Ingest one time step (single bus or many buses)      |
| GET    | `/api/measurements` | Query measurements (`bus`, `runId`, `from`, `to`, `limit`) |
| GET    | `/api/latest`       | Latest measurement per bus                           |
| GET    | `/api/predictions`  | Stored forecasts (`bus`, `runId`, `limit`)           |
| POST   | `/api/predict`      | Manually trigger a forecast for one bus              |

TCP ingestion listens on `TCP_PORT` (newline-delimited JSON, same packet format as
the HTTP body). Socket.IO events emitted: `measurement`, `prediction`, `alarm`,
`status`.

---

## 2. MongoDB

One measurement document is stored **per bus per time step**. Voltage magnitudes
are **per-unit**; phase angles in **degrees** are optional and are stored only when
measured or calculated. A phase that does not exist at a bus is simply absent.
`frequency` and `power` are optional.

```json
{
  "timestamp": "2026-01-01T07:30:00.000Z",
  "step": 30,
  "bus": "60",
  "runId": "demo-run",
  "loadFactor": 0.855,
  "voltage": {
    "a": { "magnitude": 0.976933, "angle": 10.5 },
    "b": { "magnitude": 0.980433, "angle": -109.5 },
    "c": { "magnitude": 0.983933, "angle": 130.5 }
  },
  "seq": 8030,
  "receivedAt": "2026-10-11T15:28:58.368Z",
  "source": "tcp"
}
```

Indexes: `{ bus: 1, timestamp: 1 }` and a **unique** `{ runId: 1, bus: 1, step: 1 }`
(partial, so pre-existing documents without those keys are unaffected). Replaying the
same step therefore cannot create duplicates.

A forecast document records the origin step, the horizon of predicted points, and —
once the real value arrives — `actualStep`, `actual` and the absolute `error`:

```json
{
  "bus": "150",
  "runId": "demo-run",
  "model": "persistence-baseline",
  "horizonSteps": 12,
  "originStep": 30,
  "originTimestamp": "2026-01-01T07:30:00.000Z",
  "predictions": [
    { "step": 31, "targetTimestamp": "2026-01-01T07:45:00.000Z",
      "voltage": { "a": { "magnitude": 1.0315, "angle": 10.85 } } }
  ],
  "actualStep": 31,
  "actual": { "a": { "magnitude": 1.0315, "angle": 10.85 } },
  "error": { "a": { "magnitude": 0.0, "angle": 0.0 } },
  "alarm": false
}
```

Incoming packets are validated against `backend/data/feeder_topology.json`: the bus
must exist with `kind: "bus"`, magnitudes must be within 0–2 pu, any supplied angles
must be finite and within −180…180°, and only phases that exist at that bus are
accepted. Magnitude-only phasors are valid; the backend does not invent missing
angles.

---

## 3. ML Service

The ML service is implemented using:

* Python
* FastAPI
* Pydantic
* Uvicorn

### Current endpoints

```text
GET  /
GET  /health
POST /predict
```

The current `/predict` endpoint serves the **persistence baseline**: every horizon
step repeats the last observed phasor. It is a legitimate forecasting baseline, not a
placeholder. Trained RNN/LSTM/BiLSTM models will be added later under their own
names, and each stored prediction records which model produced it.

---

# Current Development Flow

```text
Node.js Backend
      │
      ▼
MongoDB
      │
      │
      └──────────────┐
                     ▼
              FastAPI ML Service
                     │
                     ▼
        Persistence-baseline forecast
```

This flow has been tested successfully.

---

# IEEE-123 Bus Study

The next major stage is the study and implementation of the **IEEE 123-bus distribution system** using MATLAB/Simulink.

The purpose of this stage is to understand:

* Available electrical measurements
* Measurement locations
* Sampling behaviour
* Relevant telemetry
* Possible disturbances and variations
* Data required for forecasting

The current MongoDB and ML schemas are therefore considered **initial designs**.

After the IEEE-123 study, the schema can be modified according to the actual electrical data and ML requirements.

---

# Machine Learning Pipeline

After the IEEE-123 study and dataset preparation, the ML pipeline will follow approximately:

```text
Raw Electrical Data
        │
        ▼
Data Analysis
        │
        ▼
Data Cleaning / Validation
        │
        ▼
Feature Selection
        │
        ▼
Scaling / Normalization
        │
        ▼
Time-Series Sequence Creation
        │
        ▼
RNN / LSTM / BiLSTM
        │
        ▼
Model Evaluation
        │
        ▼
Saved Model
        │
        ▼
FastAPI Inference
```

The exact input features, sequence length, prediction horizon, and model architecture will be decided after analysing the actual IEEE-123 data.

---

# Real-Time Communication

Socket.IO **is implemented** on the backend. It is attached to the HTTP server in
`server.js` and emits:

* `measurement` — the stored time step (all buses in the packet)
* `prediction` — a stored forecast for a monitored bus
* `alarm` — a predicted magnitude outside 0.95–1.05 pu
* `status` — backend/ML availability, on connect and every 5 s

CORS is restricted to the frontend origin (`FRONTEND_URL`, default
`http://127.0.0.1:5173`).

The React dashboard **still polls** `/api/health` and `/api/measurements` every 2.5 s
and does not yet open a Socket.IO connection; switching it to these events is a
frontend follow-up.

---

# Development Roadmap

### Completed

* [x] Project structure
* [x] Node.js backend setup
* [x] MongoDB connection
* [x] Measurement API
* [x] Measurement retrieval API
* [x] Prediction API
* [x] FastAPI ML service
* [x] Backend ↔ FastAPI communication
* [x] Persistence-baseline forecast testing
* [x] IEEE-123 feeder topology loaded for phase-aware validation
* [x] Per-bus, per-step measurement model with replay-safe unique index
* [x] Single transport-agnostic ingestion path (HTTP + TCP)
* [x] Packet loss / latency / prediction statistics
* [x] Async forecast queue with ML circuit breaker
* [x] Socket.IO real-time events (measurement / prediction / alarm / status)
* [x] React SCADA dashboard reading real backend data

### In Progress

* [ ] IEEE-123 bus study
* [ ] Identify actual electrical measurements
* [ ] Analyse available data
* [ ] Finalize telemetry schema
* [ ] Finalize ML input format
* [ ] Prepare training dataset

### Planned

* [ ] Data preprocessing
* [ ] Time-series sequence generation
* [ ] RNN baseline
* [ ] LSTM implementation
* [ ] BiLSTM comparison if required
* [ ] Model evaluation
* [ ] Real ML inference
* [ ] Switch the React dashboard from polling to Socket.IO events
* [ ] UDP ingestion listener (bridge from MATLAB)
* [ ] Deployment

---

# Collaboration

This project uses GitHub for team collaboration.

The `main` branch should contain stable and tested code.

Development work can be performed using separate branches, for example:

```text
main
 │
 ├── ieee123-study
 ├── ml-development
 └── frontend-development
```

Contributors should work on their respective branches and merge tested changes into `main`.

---

# Environment Variables

Sensitive environment variables should **not** be committed to GitHub.

Use a local `.env` file for actual configuration.

Example (see `backend/.env.example` for the full annotated list):

```env
PORT=5000
TCP_HOST=0.0.0.0
TCP_PORT=6000
UDP_PORT=6001
MONGODB_URI=mongodb://127.0.0.1:27017/scada
ML_SERVICE_URL=http://127.0.0.1:8000
FRONTEND_URL=http://127.0.0.1:5173
HISTORY_L=12
HORIZON_H=12
MONITORED_BUSES=150,1,13,67,83,114
```

`TCP_HOST`/`TCP_PORT` bind `0.0.0.0` so a second machine running MATLAB/Simulink can
reach the feeder. On Windows this requires an inbound firewall rule, e.g.:

```text
netsh advfirewall firewall add rule name="SCADA backend HTTP" dir=in action=allow protocol=TCP localport=5000
netsh advfirewall firewall add rule name="SCADA feeder TCP"   dir=in action=allow protocol=TCP localport=6000
```

`UDP_PORT` is reserved for a future UDP listener and is not wired up yet.

Only `.env.example` should be committed with placeholder values.

---

# Development Principle

The project is being developed incrementally:

```text
IEEE-123 Study
      ↓
Actual Data Understanding
      ↓
Schema Refinement
      ↓
ML Pipeline
      ↓
Real Prediction
      ↓
React SCADA
      ↓
Real-Time Communication (if required)
      ↓
Deployment
```

The backend is intentionally kept independent of ML-specific logic. Data preprocessing, sequence generation, scaling, model training, and inference logic will remain inside the Python ML service.
