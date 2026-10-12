import Measurement from "../models/Measurement.js";
import Prediction from "../models/Prediction.js";
import { config } from "../config/env.js";
import { predictForBus } from "../services/predictionQueue.js";
import { isBus } from "../services/topology.js";
import { parseLimit, trimmed } from "../utils/query.js";

export const getPredictions = async (req, res, next) => {
  try {
    const filter = {};
    const bus = trimmed(req.query.bus);
    const runId = trimmed(req.query.runId);

    if (bus) {
      filter.bus = bus;
    }

    if (runId) {
      filter.runId = runId;
    }

    const predictions = await Prediction.find(filter)
      .sort({ createdAt: -1, originStep: -1 })
      .limit(parseLimit(req.query.limit, 100, 1000))
      .lean();

    return res.json(predictions);
  } catch (error) {
    return next(error);
  }
};

// Manual forecast trigger: predicts from the newest stored step of one bus and
// stores/emits the result exactly like the automatic queue does.
export const createPrediction = async (req, res, next) => {
  try {
    const bus = trimmed(req.body?.bus);
    const runId = trimmed(req.body?.runId) ?? "default";

    if (!bus) {
      return res.status(400).json({ error: { message: "bus is required." } });
    }

    if (!isBus(bus)) {
      return res.status(400).json({
        error: { message: `bus ${bus} is not a bus node in feeder_topology.json.` },
      });
    }

    const latest = await Measurement.findOne({ bus, runId }).sort({ step: -1 }).lean();

    if (!latest) {
      return res.status(404).json({
        error: { message: `No stored measurements for bus ${bus} in run ${runId}.` },
      });
    }

    const prediction = await predictForBus({
      bus,
      runId,
      originStep: latest.step,
      originTimestamp: latest.timestamp,
    });

    if (!prediction) {
      return res.status(409).json({
        error: {
          message: `Bus ${bus} has fewer than ${config.historyLength} stored steps, so it cannot be forecast yet.`,
        },
      });
    }

    return res.json(prediction);
  } catch (error) {
    return next(error);
  }
};
