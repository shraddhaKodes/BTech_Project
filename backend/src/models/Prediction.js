import mongoose from "mongoose";

import { voltageSchema } from "./voltageSchema.js";

const forecastPointSchema = new mongoose.Schema(
  {
    step: {
      type: Number,
      required: true,
    },
    targetTimestamp: {
      type: Date,
      required: true,
    },
    voltage: {
      type: voltageSchema,
      required: true,
    },
  },
  { _id: false }
);

const predictionSchema = new mongoose.Schema(
  {
    bus: {
      type: String,
      required: true,
    },
    runId: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    horizonSteps: {
      type: Number,
      required: true,
    },
    originStep: {
      type: Number,
      required: true,
    },
    originTimestamp: {
      type: Date,
      required: true,
    },
    predictions: {
      type: [forecastPointSchema],
      default: [],
    },
    // Filled in by the ingestion path once the real value for a forecast step
    // arrives. actualStep says which of the forecast points was scored.
    actualStep: {
      type: Number,
    },
    actual: {
      type: voltageSchema,
    },
    error: {
      type: voltageSchema,
    },
    alarm: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

predictionSchema.index({ bus: 1, createdAt: -1 });
predictionSchema.index({ runId: 1, bus: 1, originStep: 1 }, { unique: true });
// Used when a measured step arrives and has to be written back into every open
// forecast that covers it.
predictionSchema.index({ runId: 1, "predictions.step": 1 });

const Prediction = mongoose.model("Prediction", predictionSchema);

export default Prediction;
