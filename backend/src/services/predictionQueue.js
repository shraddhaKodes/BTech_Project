import Measurement from "../models/Measurement.js";
import Prediction from "../models/Prediction.js";
import { VOLTAGE_HIGH, VOLTAGE_LOW, config } from "../config/env.js";
import { predictVoltages } from "./mlService.js";
import { emitEvent } from "./socket.js";
import { recordPrediction, setMlAvailability } from "./stats.js";

const ML_COOLDOWN_MS = 30000;

// Only the newest step is worth forecasting, so a slow ML service causes the
// queue to coalesce work instead of growing without bound.
let pendingStep = null;
let draining = false;
let mlCooldownUntil = 0;

const buildAlarms = ({ bus, runId, model, points }) => {
  const alarms = [];

  points.forEach((point) => {
    Object.entries(point.voltage).forEach(([phase, phasor]) => {
      const magnitude = phasor?.magnitude;

      if (!Number.isFinite(magnitude)) {
        return;
      }

      if (magnitude < VOLTAGE_LOW || magnitude > VOLTAGE_HIGH) {
        alarms.push({
          bus,
          phase,
          runId,
          model,
          step: point.step,
          targetTimestamp: point.targetTimestamp,
          magnitude,
          type: magnitude < VOLTAGE_LOW ? "undervoltage" : "overvoltage",
          limits: { low: VOLTAGE_LOW, high: VOLTAGE_HIGH },
        });
      }
    });
  });

  return alarms;
};

const toError = (predicted, actual) => {
  const error = {};

  Object.entries(actual).forEach(([phase, measured]) => {
    const forecast = predicted?.[phase];

    if (!forecast) {
      return;
    }

    error[phase] = {
      magnitude: Math.abs(forecast.magnitude - measured.magnitude),
      ...(Number.isFinite(forecast.angle) &&
        Number.isFinite(measured.angle) && {
          angle: Math.abs(forecast.angle - measured.angle),
        }),
    };
  });

  return Object.keys(error).length > 0 ? error : undefined;
};

/**
 * Writes the measured voltage back into every open forecast that targeted this
 * step, together with the absolute per-phase error. Only unscored forecasts match,
 * so each one is scored once, at the first target step that arrives.
 */
const backfillActuals = async ({ runId, step, voltagesByBus }) => {
  const openForecasts = await Prediction.find({
    runId,
    "predictions.step": step,
    actual: { $exists: false },
  });

  for (const forecast of openForecasts) {
    const actual = voltagesByBus.get(forecast.bus);

    if (!actual) {
      continue;
    }

    const point = forecast.predictions.find((item) => item.step === step);

    if (!point) {
      continue;
    }

    forecast.actualStep = step;
    forecast.actual = actual;
    forecast.error = toError(point.voltage, actual);
    await forecast.save();
  }

  return openForecasts.length;
};

const loadHistory = async ({ bus, runId, originStep }) => {
  const documents = await Measurement.find({
    bus,
    runId,
    step: { $lte: originStep },
  })
    .sort({ step: -1 })
    .limit(config.historyLength)
    .lean();

  if (documents.length < config.historyLength) {
    return null;
  }

  return documents
    .reverse()
    .map(({ step, timestamp, loadFactor, voltage }) => ({
      step,
      timestamp,
      loadFactor: loadFactor ?? null,
      voltage,
    }));
};

const toForecastPoints = (rawPoints) =>
  (Array.isArray(rawPoints) ? rawPoints : [])
    .map((point) => ({
      step: point?.step,
      targetTimestamp: new Date(point?.targetTimestamp),
      voltage: point?.voltage,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.step) &&
        !Number.isNaN(point.targetTimestamp.getTime()) &&
        point.voltage &&
        typeof point.voltage === "object"
    );

/**
 * Forecasts one bus from its stored history and publishes the result.
 * Returns null when there is not enough history yet; throws when the ML call fails.
 */
export const predictForBus = async ({ bus, runId, originStep, originTimestamp }) => {
  const history = await loadHistory({ bus, runId, originStep });

  if (!history) {
    recordPrediction("skippedShortHistory");
    return null;
  }

  let response;

  try {
    recordPrediction("requested");
    response = await predictVoltages({ bus, horizon: config.horizon, history });
    setMlAvailability(true);
  } catch (error) {
    recordPrediction("failed");
    setMlAvailability(false, error.message);
    throw error;
  }

  const points = toForecastPoints(response?.predictions);
  const model = response?.model ?? "unknown";
  const alarms = buildAlarms({ bus, runId, model, points });

  const saved = await Prediction.findOneAndUpdate(
    { runId, bus, originStep },
    {
      bus,
      runId,
      model,
      horizonSteps: points.length,
      originStep,
      originTimestamp,
      predictions: points,
      alarm: alarms.length > 0,
    },
    { upsert: true, returnDocument: "after" }
  );

  recordPrediction("stored");
  emitEvent("prediction", saved);

  alarms.forEach((alarm) => {
    recordPrediction("alarms");
    emitEvent("alarm", alarm);
  });

  return saved;
};

const processStep = async ({ runId, step, timestamp, nodes }) => {
  const voltagesByBus = new Map(nodes.map((node) => [node.bus, node.voltage]));

  await backfillActuals({ runId, step, voltagesByBus });

  const monitored = nodes
    .map((node) => node.bus)
    .filter((bus) => config.monitoredBuses.includes(bus));

  for (const bus of monitored) {
    if (Date.now() < mlCooldownUntil) {
      return;
    }

    try {
      await predictForBus({ bus, runId, originStep: step, originTimestamp: timestamp });
    } catch (error) {
      // An unreachable ML service must never stall ingestion: back off and carry on.
      if (error.unreachable) {
        mlCooldownUntil = Date.now() + ML_COOLDOWN_MS;
        console.warn(
          `[predict] ML service unreachable (${error.message}); pausing forecasts for ${ML_COOLDOWN_MS / 1000}s`
        );
        return;
      }

      console.error(`[predict] bus ${bus} step ${step} failed: ${error.message}`);
    }
  }
};

const drain = async () => {
  if (draining) {
    return;
  }

  draining = true;

  try {
    while (pendingStep) {
      const current = pendingStep;
      pendingStep = null;
      await processStep(current);
    }
  } catch (error) {
    console.error("[predict] queue error:", error.message);
  } finally {
    draining = false;
  }
};

/** Fire-and-forget: ingestion never waits on the ML service. */
export const schedulePrediction = (step) => {
  pendingStep = step;
  drain();
};
