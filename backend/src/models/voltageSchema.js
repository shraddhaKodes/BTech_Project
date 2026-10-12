
import mongoose from "mongoose";

export const phasorSchema = new mongoose.Schema(
  {
    magnitude: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isFinite,
        message: "Magnitude must be a finite number",
      },
    },
    angle: {
      type: Number,
      required: false,
      validate: {
        validator: Number.isFinite,
        message: "Angle must be a finite number when provided",
      },
    },
  },
  { _id: false }
);

export const voltageSchema = new mongoose.Schema(
  {
    a: { type: phasorSchema, required: false },
    b: { type: phasorSchema, required: false },
    c: { type: phasorSchema, required: false },
  },
  { _id: false }
);
