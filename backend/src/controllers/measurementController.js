import Measurement from "../models/Measurement.js";
import { ingestMeasurement } from "../services/ingestion.js";
import { parseDateString, parseLimit, trimmed } from "../utils/query.js";

export const createMeasurement = async (req, res, next) => {
  try {
    const result = await ingestMeasurement(req.body);

    if (!result.ok) {
      return res.status(400).json({
        error: {
          message: "Invalid measurement packet.",
          details: result.errors,
        },
      });
    }

    return res.status(result.stored > 0 ? 201 : 200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const getMeasurements = async (req, res, next) => {
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

    const from = parseDateString(req.query.from);
    const to = parseDateString(req.query.to);

    if (from === undefined) {
      return res.status(400).json({ error: { message: "from must be a valid date." } });
    }

    if (to === undefined) {
      return res.status(400).json({ error: { message: "to must be a valid date." } });
    }

    if (from || to) {
      filter.timestamp = {
        ...(from && { $gte: from }),
        ...(to && { $lte: to }),
      };
    }

    const measurements = await Measurement.find(filter)
      .sort({ timestamp: -1, step: -1, _id: -1 })
      .limit(parseLimit(req.query.limit))
      .lean();

    return res.json(measurements);
  } catch (error) {
    return next(error);
  }
};

// One document per bus: the newest measurement each bus has reported.
export const getLatestMeasurements = async (req, res, next) => {
  try {
    const runId = trimmed(req.query.runId);

    const measurements = await Measurement.aggregate([
      { $match: { bus: { $exists: true }, ...(runId && { runId }) } },
      { $sort: { timestamp: -1, step: -1, _id: -1 } },
      { $group: { _id: "$bus", measurement: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$measurement" } },
      { $sort: { bus: 1 } },
    ]);

    return res.json(measurements);
  } catch (error) {
    return next(error);
  }
};
