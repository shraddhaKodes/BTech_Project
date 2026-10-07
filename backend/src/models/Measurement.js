import mongoose from "mongoose";

const phasorSchema = new mongoose.Schema(
  {
    magnitude: {
      type: Number,
      required: true,
    },
    angle: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const voltageSchema = new mongoose.Schema(
  {
    a: {
      type: phasorSchema,
      required: true,
    },
    b: {
      type: phasorSchema,
      required: true,
    },
    c: {
      type: phasorSchema,
      required: true,
    },
  },
  { _id: false }
);

const powerSchema = new mongoose.Schema(
  {
    active: {
      type: Number,
      required: true,
    },
    reactive: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const measurementSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
    },
    frequency: {
      type: Number,
      required: true,
    },
    voltage: {
      type: voltageSchema,
      required: true,
    },
    power: {
      type: powerSchema,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

const Measurement = mongoose.model("Measurement", measurementSchema);

export default Measurement;
