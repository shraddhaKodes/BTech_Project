"""Voltage forecasting service for the IEEE 123-node SCADA backend.

Contract, mirrored by backend/src/services/mlService.js:

    POST /predict
      request  {bus, horizon, history: [{step, timestamp, loadFactor, voltage}]}
               history holds HISTORY_L items, oldest first
      response {bus, model, horizon,
                predictions: [{step, targetTimestamp, voltage: {a|b|c: {magnitude, angle}}}]}

The served model is `persistence-baseline`: it repeats the last observed phasor
for every horizon step. That is a legitimate forecasting baseline, not a
placeholder - trained RNN/LSTM/BiLSTM models will be added later under their own
names, and only `forecast` needs replacing when they are. Voltages are per-unit
and angles are in degrees.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="IEEE-123 voltage forecasting service")

MODEL_NAME = "persistence-baseline"
STEP_INTERVAL = timedelta(minutes=15)


class Phasor(BaseModel):
    magnitude: float
    angle: float | None = None


class HistoryPoint(BaseModel):
    step: int
    timestamp: datetime | None = None
    loadFactor: float | None = None
    voltage: dict[str, Phasor]


class PredictionRequest(BaseModel):
    bus: str
    horizon: int = Field(default=12, ge=1)
    history: list[HistoryPoint]


class ForecastPoint(BaseModel):
    step: int
    targetTimestamp: datetime
    voltage: dict[str, Phasor]


class PredictionResponse(BaseModel):
    bus: str
    model: str
    horizon: int
    predictions: list[ForecastPoint]


def step_interval(history: list[HistoryPoint]) -> timedelta:
    """Infer the sampling interval instead of assuming 15 minutes."""
    stamps = [point.timestamp for point in history if point.timestamp is not None]

    if len(stamps) >= 2:
        delta = stamps[-1] - stamps[-2]
        if delta > timedelta(0):
            return delta

    return STEP_INTERVAL


def forecast(history: list[HistoryPoint], horizon: int) -> list[ForecastPoint]:
    """Persistence baseline: every horizon step repeats the last observed phasor."""
    latest = history[-1]
    interval = step_interval(history)
    origin = latest.timestamp or datetime.now(timezone.utc)

    points: list[ForecastPoint] = []

    for offset in range(1, horizon + 1):
        voltage = {
            phase: Phasor(magnitude=phasor.magnitude, angle=phasor.angle)
            for phase, phasor in latest.voltage.items()
        }

        points.append(
            ForecastPoint(
                step=latest.step + offset,
                targetTimestamp=origin + interval * offset,
                voltage=voltage,
            )
        )

    return points


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "ML Service is running", "model": MODEL_NAME}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "model": MODEL_NAME}


@app.post("/predict", response_model=PredictionResponse, response_model_exclude_none=True)
def predict(request: PredictionRequest) -> PredictionResponse:
    if not request.history:
        raise HTTPException(status_code=422, detail="history must not be empty")

    return PredictionResponse(
        bus=request.bus,
        model=MODEL_NAME,
        horizon=request.horizon,
        predictions=forecast(request.history, request.horizon),
    )
