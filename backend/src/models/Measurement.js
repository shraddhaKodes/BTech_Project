import mongoose from "mongoose";

import { voltageSchema } from "./voltageSchema.js";

const powerSchema = new mongoose.Schema(
  {
    active: {
      type: Number,
    },
    reactive: {
      type: Number,
    },
  },
  { _id: false }
);

// One document per bus per simulated time step. Voltage magnitudes are per-unit
// and angles are in degrees.
const measurementSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
    },
    step: {
      type: Number,
      required: true,
    },
    bus: {
      type: String,
      required: true,
    },
    runId: {
      type: String,
      required: true,
    },
    loadFactor: {
      type: Number,
    },
    voltage: {
      type: voltageSchema,
      required: true,
    },
    frequency: {
      type: Number,
    },
    power: {
      type: powerSchema,
    },
    seq: {
      type: Number,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "simulink-qsts",
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

measurementSchema.index({ bus: 1, timestamp: 1 });

measurementSchema.index(
  { runId: 1, bus: 1, step: 1 },
  {
    unique: true,
    // Documents written before per-bus ingestion have none of these keys. Leaving
    // them out of the index lets it build without migrating or deleting them.
    partialFilterExpression: {
      runId: { $exists: true },
      bus: { $exists: true },
      step: { $exists: true },
    },
  }
);

const Measurement = mongoose.model("Measurement", measurementSchema);

export default Measurement;
