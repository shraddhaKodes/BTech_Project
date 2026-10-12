import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

// dotenv is loaded here rather than in server.js: ES module imports are evaluated
// before the importing module's body runs, so a module that reads process.env at
// import time would otherwise see an unpopulated environment.
dotenv.config();

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toList = (value, fallback) => {
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
};

const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5173";

// Provenance labels a sender may declare in `source`. Real Simulink replay is
// always accepted; test/demo/mock data only when explicitly enabled, so a
// production dashboard can never silently show generated values.
export const REAL_SOURCES = ["simulink-qsts"];
export const TEST_SOURCES = ["matlab-test", "demo", "mock"];
export const DEFAULT_SOURCE = "simulink-qsts";

export const config = {
  backendRoot,
  port: toInt(process.env.PORT, 5000),
  // 0.0.0.0 so a second laptop running MATLAB/Simulink can reach the feeder.
  tcpHost: process.env.TCP_HOST || "0.0.0.0",
  tcpPort: toInt(process.env.TCP_PORT, 6000),
  udpPort: toInt(process.env.UDP_PORT, 6001),
  mongoUri: process.env.MONGODB_URI,
  mlServiceUrl: String(process.env.ML_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/+$/, ""),
  historyLength: toInt(process.env.HISTORY_L, 12),
  horizon: toInt(process.env.HORIZON_H, 12),
  monitoredBuses: toList(process.env.MONITORED_BUSES, ["150", "1", "13", "67", "83", "114"]),
  allowTestData: process.env.ALLOW_TEST_DATA === "true",
  // Server-side CSV replay only reads files inside this directory.
  replayDir: path.resolve(process.env.REPLAY_DIR || path.join(backendRoot, "data")),
  corsOrigins: [...new Set([frontendUrl, "http://localhost:5173", "http://127.0.0.1:5173"])],
  topologyPath: path.join(backendRoot, "data", "feeder_topology.json"),
};

// Operational limits, in per-unit and degrees.
export const VOLTAGE_LOW = 0.95;
export const VOLTAGE_HIGH = 1.05;
export const MAGNITUDE_LIMITS = { min: 0, max: 2 };
export const ANGLE_LIMITS = { min: -180, max: 180 };
