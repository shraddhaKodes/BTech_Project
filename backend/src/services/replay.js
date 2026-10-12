import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { config } from "../config/env.js";
import { ingestMeasurement } from "./ingestion.js";

const STEP_MS = 15 * 60 * 1000;

// One replay at a time; /stop only sets a flag the step loop checks between steps.
const state = {
  running: false,
  stopRequested: false,
  runId: null,
  csvPath: null,
  stepsPerSecond: null,
  stepsTotal: 0,
  stepsSent: 0,
  stored: 0,
  rejected: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
};

const snapshot = () => ({ ...state, status: state.running ? "running" : "idle" });

const fail = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// csvPath may be relative to REPLAY_DIR or absolute inside it; anything else is
// refused so the endpoint cannot be used to read arbitrary server files.
const resolveCsvPath = (csvPath) => {
  const root = path.resolve(config.replayDir);
  const resolved = path.resolve(root, csvPath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw fail(`csvPath must be inside the replay directory ${root}`, 400);
  }

  return resolved;
};

/**
 * Groups QSTS CSV rows by step. Value columns look like `bus60_Va_mag` /
 * `bus60_Va_ang`; `step` is required and `load_factor` optional.
 */
const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    throw fail("CSV has no data rows.", 400);
  }

  const header = lines[0].split(",").map((name) => name.trim());
  const stepIndex = header.indexOf("step");
  const loadIndex = header.indexOf("load_factor");

  if (stepIndex < 0) {
    throw fail('CSV must have a "step" column.', 400);
  }

  const valueColumns = [];
  header.forEach((name, index) => {
    const match = /^bus(.+)_V([abc])_(mag|ang)$/.exec(name);
    if (match) {
      valueColumns.push({ index, bus: match[1], phase: match[2], field: match[3] });
    }
  });

  if (valueColumns.length === 0) {
    throw fail("CSV has no bus<id>_V<phase>_(mag|ang) columns.", 400);
  }

  const byStep = new Map();

  lines.slice(1).forEach((line) => {
    const cells = line.split(",");
    const step = Number(cells[stepIndex]);

    if (!Number.isFinite(step)) {
      return;
    }

    const entry = byStep.get(step) ?? { nodes: new Map(), loadFactor: undefined };

    if (loadIndex >= 0 && cells[loadIndex]?.trim() !== "") {
      const loadFactor = Number(cells[loadIndex]);
      if (Number.isFinite(loadFactor)) {
        entry.loadFactor = loadFactor;
      }
    }

    valueColumns.forEach(({ index, bus, phase, field }) => {
      const value = Number(cells[index]);
      if (!Number.isFinite(value)) {
        return;
      }

      const node = entry.nodes.get(bus) ?? { bus, voltage: {} };
      node.voltage[phase] = node.voltage[phase] ?? {};
      node.voltage[phase][field === "mag" ? "magnitude" : "angle"] = value;
      entry.nodes.set(bus, node);
    });

    byStep.set(step, entry);
  });

  return [...byStep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, entry]) => ({
      step,
      loadFactor: entry.loadFactor,
      // Angles are optional; preserve magnitude-only measurements as received.
      nodes: [...entry.nodes.values()]
        .map((node) => ({
          bus: node.bus,
          voltage: Object.fromEntries(
            Object.entries(node.voltage).filter(
              ([, phasor]) => Number.isFinite(phasor.magnitude)
            )
          ),
        }))
        .filter((node) => Object.keys(node.voltage).length > 0),
    }));
};

const runSteps = async (steps) => {
  const base = Date.now() - steps.length * STEP_MS;
  const delayMs = 1000 / state.stepsPerSecond;

  try {
    for (const { step, loadFactor, nodes } of steps) {
      if (state.stopRequested) {
        break;
      }

      const result = await ingestMeasurement({
        runId: state.runId,
        step,
        source: "simulink-qsts",
        timestamp: new Date(base + step * STEP_MS).toISOString(),
        ...(loadFactor !== undefined && { loadFactor }),
        nodes,
      });

      state.stepsSent += 1;
      state.stored += result.stored ?? 0;
      state.rejected += result.rejected ?? 0;

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.running = false;
    state.finishedAt = new Date();
  }
};

export const startReplay = ({ csvPath, runId, stepsPerSecond }) => {
  if (state.running) {
    throw fail(`Replay "${state.runId}" is already running; call /api/replay/stop first.`, 409);
  }

  if (!csvPath || typeof csvPath !== "string") {
    throw fail("csvPath is required.", 400);
  }

  if (!runId || typeof runId !== "string") {
    throw fail("runId is required.", 400);
  }

  const rate = Number(stepsPerSecond);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw fail("stepsPerSecond must be a positive number.", 400);
  }

  const resolved = resolveCsvPath(csvPath);

  if (!existsSync(resolved)) {
    throw fail(`No such file in the replay directory: ${csvPath}`, 404);
  }

  const steps = parseCsv(readFileSync(resolved, "utf8"));

  if (steps.length === 0) {
    throw fail("CSV parsed to zero steps.", 400);
  }

  Object.assign(state, {
    running: true,
    stopRequested: false,
    runId,
    csvPath: resolved,
    stepsPerSecond: rate,
    stepsTotal: steps.length,
    stepsSent: 0,
    stored: 0,
    rejected: 0,
    startedAt: new Date(),
    finishedAt: null,
    error: null,
  });

  // Ingestion is fire-and-forget: the HTTP reply must not wait for the whole run.
  runSteps(steps);

  return snapshot();
};

export const stopReplay = () => {
  if (!state.running) {
    return snapshot();
  }

  state.stopRequested = true;
  return snapshot();
};

export const replayStatus = () => snapshot();
