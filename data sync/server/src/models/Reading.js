import mongoose from 'mongoose';
import { config } from '../config.js';

/** One stored voltage sample (decimated to DB_SAVE_INTERVAL_MS per bus). */
const ReadingSchema = new mongoose.Schema({
  busId: { type: Number, index: true },
  ts: { type: Date, default: Date.now },
  simTime: Number,
  v: [Number],        // |V| per phase, volts (phase-to-ground RMS)
  a: [Number],        // angle per phase, degrees
  s: Number,          // status code
}, { versionKey: false });

ReadingSchema.index({ busId: 1, ts: -1 });
ReadingSchema.index({ ts: 1 }, { expireAfterSeconds: config.retentionHours * 3600 });

export const Reading = mongoose.models.Reading || mongoose.model('Reading', ReadingSchema);
