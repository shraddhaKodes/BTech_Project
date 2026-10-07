import Measurement from "../models/Measurement.js";

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const validatePhasor = (phasor, fieldName, errors) => {
  if (!phasor || typeof phasor !== "object" || Array.isArray(phasor)) {
    errors.push(`${fieldName} is required.`);
    return;
  }

  if (!isFiniteNumber(phasor.magnitude)) {
    errors.push(`${fieldName}.magnitude must be a finite number.`);
  }

  if (!isFiniteNumber(phasor.angle)) {
    errors.push(`${fieldName}.angle must be a finite number.`);
  }
};

const validateMeasurement = (body) => {
  const errors = [];

  if (body.timestamp !== undefined) {
    const parsedTimestamp = new Date(body.timestamp);
    if (Number.isNaN(parsedTimestamp.getTime())) {
      errors.push("timestamp must be a valid date.");
    }
  }

  if (!isFiniteNumber(body.frequency)) {
    errors.push("frequency must be a finite number.");
  }

  if (!body.voltage || typeof body.voltage !== "object" || Array.isArray(body.voltage)) {
    errors.push("voltage is required.");
  } else {
    validatePhasor(body.voltage.a, "voltage.a", errors);
    validatePhasor(body.voltage.b, "voltage.b", errors);
    validatePhasor(body.voltage.c, "voltage.c", errors);
  }

  if (!body.power || typeof body.power !== "object" || Array.isArray(body.power)) {
    errors.push("power is required.");
  } else {
    if (!isFiniteNumber(body.power.active)) {
      errors.push("power.active must be a finite number.");
    }

    if (!isFiniteNumber(body.power.reactive)) {
      errors.push("power.reactive must be a finite number.");
    }
  }

  return errors;
};

export const createMeasurement = async (req, res, next) => {
  try {
    const errors = validateMeasurement(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        error: {
          message: "Invalid measurement payload.",
          details: errors,
        },
      });
    }

    const measurement = await Measurement.create(req.body);

    return res.status(201).json(measurement);
  } catch (error) {
    return next(error);
  }
};

export const getMeasurements = async (req, res, next) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(requestedLimit)
      ? 100
      : Math.min(Math.max(requestedLimit, 1), 500);

    const measurements = await Measurement.find()
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(limit);

    return res.json(measurements);
  } catch (error) {
    return next(error);
  }
};
