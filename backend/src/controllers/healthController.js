import mongoose from "mongoose";

import { checkMlService } from "../services/mlService.js";

// The frontend polls /api/health every few seconds, so the ML probe result is
// cached briefly: a firewalled or hung ML host would otherwise make every poll
// wait for the full probe timeout.
const ML_PROBE_TTL_MS = 5000;

let cachedMlProbe = null;
let cachedMlProbeAt = 0;

const probeMlService = async () => {
  if (cachedMlProbe && Date.now() - cachedMlProbeAt < ML_PROBE_TTL_MS) {
    return cachedMlProbe;
  }

  cachedMlProbe = await checkMlService();
  cachedMlProbeAt = Date.now();

  return cachedMlProbe;
};

export const getHealth = async (req, res) => {
  const { connection } = mongoose;

  const mongo = {
    connected: connection.readyState === 1,
    host: connection.host ?? null,
    database: connection.name ?? null,
  };

  const ml = await probeMlService();

  return res.json({
    // Always 200: this endpoint reports whether the backend itself is alive, and
    // a dependency being down is surfaced through `status` instead.
    status: mongo.connected && ml.reachable ? "healthy" : "degraded",
    service: "backend",
    mongo,
    ml,
  });
};
