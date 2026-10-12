import Measurement from "../models/Measurement.js";
import { schedulePrediction } from "./predictionQueue.js";
import { emitEvent } from "./socket.js";
import { recordPacket } from "./stats.js";
import { validatePacket } from "./validatePacket.js";

const DUPLICATE_KEY = 11000;

const latencyOf = (rawPacket) => {
  const sentAt = rawPacket?.sentAt;

  if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) {
    return null;
  }

  return Date.now() - sentAt;
};

/**
 * Replays resend steps that are already stored. Those collisions are expected,
 * so duplicate key errors are counted rather than treated as a failure.
 */
const storeDocuments = async (documents) => {
  try {
    const inserted = await Measurement.insertMany(documents, { ordered: false });
    return { stored: inserted.length, duplicates: 0 };
  } catch (error) {
    const writeErrors = error.writeErrors ?? (error.code === DUPLICATE_KEY ? [error] : []);
    const duplicates = writeErrors.filter(
      (item) => (item.code ?? item.err?.code) === DUPLICATE_KEY
    ).length;

    if (duplicates === 0 || duplicates !== writeErrors.length) {
      throw error;
    }

    return {
      stored: error.result?.insertedCount ?? documents.length - duplicates,
      duplicates,
    };
  }
};

/**
 * Single ingestion path for every transport (HTTP POST, TCP, server-side replay
 * and a future UDP listener). Validates, stores one document per bus, publishes
 * the step and queues forecasting without blocking the caller.
 *
 * `source` is the sender-declared provenance, already checked against the
 * allow-list by validatePacket.
 *
 * @returns {Promise<{ok:boolean, stored:number, rejected:number, duplicates:number, latencyMs:number|null, errors?:string[], details?:object[]}>}
 */
export const ingestMeasurement = async (rawPacket) => {
  const latencyMs = latencyOf(rawPacket);
  const { packet, accepted, rejected, errors } = validatePacket(rawPacket);

  if (!packet) {
    recordPacket({ invalid: true, latencyMs, seq: rawPacket?.seq ?? null });

    return {
      ok: false,
      stored: 0,
      rejected: 0,
      duplicates: 0,
      latencyMs,
      errors,
    };
  }

  const receivedAt = new Date();
  const documents = accepted.map((node) => ({
    ...node,
    timestamp: packet.timestamp,
    step: packet.step,
    runId: packet.runId,
    source: packet.source,
    ...(packet.loadFactor !== undefined && { loadFactor: packet.loadFactor }),
    ...(packet.seq !== undefined && { seq: packet.seq }),
    receivedAt,
  }));

  const { stored, duplicates } = documents.length > 0 ? await storeDocuments(documents) : { stored: 0, duplicates: 0 };

  recordPacket({
    seq: packet.seq ?? null,
    latencyMs,
    received: accepted.length + rejected.length,
    stored,
    rejected: rejected.length,
    duplicates,
    step: packet.step,
  });

  const stepPacket = {
    seq: packet.seq ?? null,
    runId: packet.runId,
    step: packet.step,
    timestamp: packet.timestamp,
    loadFactor: packet.loadFactor ?? null,
    source: packet.source,
    nodes: accepted,
  };

  emitEvent("measurement", stepPacket);

  if (stored > 0) {
    schedulePrediction(stepPacket);
  }

  return {
    ok: true,
    stored,
    rejected: rejected.length,
    duplicates,
    latencyMs,
    ...(rejected.length > 0 && { details: rejected }),
  };
};
