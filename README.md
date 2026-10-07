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
Node.js / Express
       │
       ├──────────────► MongoDB
       │
       │ HTTP request
       ▼
Python FastAPI ML Service
       │
       ▼
Dummy Prediction
```

The current implementation focuses on establishing reliable communication between the backend, database, and ML service before implementing the actual ML model.

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
│   │   └── app.js
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
* Axios
* CORS
* dotenv

### Implemented APIs

| Method | Endpoint            | Purpose                       |
| ------ | ------------------- | ----------------------------- |
| GET    | `/api/health`       | Backend health check          |
| POST   | `/api/measurements` | Store electrical measurements |
| GET    | `/api/measurements` | Retrieve stored measurements  |
| POST   | `/api/predict`      | Send data to the ML service   |

---

## 2. MongoDB

The initial measurement schema follows the planned electrical telemetry structure:

```json
{
  "timestamp": "2026-10-05T10:15:30.120Z",
  "frequency": 49.98,
  "voltage": {
    "a": {
      "magnitude": 230.4,
      "angle": 1.8
    },
    "b": {
      "magnitude": 229.9,
      "angle": -118.3
    },
    "c": {
      "magnitude": 230.1,
      "angle": 121.2
    }
  },
  "power": {
    "active": 7.8,
    "reactive": 2.3
  }
}
```

> **Note:** This is the initial schema. The final schema will be reviewed after studying the IEEE-123 bus model and identifying the actual available measurements and ML requirements.

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

The current `/predict` endpoint uses a **dummy prediction** only for testing backend-to-ML communication.

The actual machine learning pipeline will be implemented later.

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
              Dummy Prediction
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

WebSocket communication is **not implemented at the current stage**.

If the final SCADA/monitoring system requires real-time communication, WebSocket will be integrated later.

Possible future flow:

```text
MATLAB / Simulink
        │
        ▼
Node.js Backend
        │
        ├──────────► MongoDB
        │
        └──────────► FastAPI ML Service
                         │
                         ▼
                    Prediction
                         │
                         ▼
                    WebSocket
                         │
                         ▼
                  React SCADA
```

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
* [x] Dummy prediction testing

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
* [ ] React SCADA interface
* [ ] WebSocket integration if required
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

Example:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
ML_SERVICE_URL=http://127.0.0.1:8000
```

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
