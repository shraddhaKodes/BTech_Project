const startedAt = Date.now();

let latencyTotalMs = 0;

const state = {
  packets: { received: 0, invalid: 0 },
  nodes: { received: 0, stored: 0, rejected: 0, duplicates: 0 },
  seq: { last: null, gaps: 0, reordered: 0, observedAt: null },
  latencyMs: { samples: 0, min: null, max: null, mean: null },
  predictions: { requested: 0, stored: 0, failed: 0, skippedShortHistory: 0, alarms: 0 },
  ml: { available: true, lastError: null, lastChangeAt: null },
  lastStep: null,
};

const recordLatency = (latencyMs) => {
  // A negative value means the sender's clock is ahead of ours; there is no
  // meaningful latency to report, so the sample is dropped.
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0) {
    return;
  }

  const { latencyMs: latency } = state;

  latency.samples += 1;
  latency.min = latency.min === null ? latencyMs : Math.min(latency.min, latencyMs);
  latency.max = latency.max === null ? latencyMs : Math.max(latency.max, latencyMs);
  latencyTotalMs += latencyMs;
  latency.mean = Number((latencyTotalMs / latency.samples).toFixed(2));
};

const recordSeq = (seq) => {
  if (typeof seq !== "number" || !Number.isFinite(seq)) {
    return;
  }

  const { seq: tracker } = state;

  if (tracker.last === null) {
    tracker.last = seq;
  } else if (seq > tracker.last + 1) {
    tracker.gaps += seq - tracker.last - 1;
    tracker.last = seq;
  } else if (seq <= tracker.last) {
    tracker.reordered += 1;
  } else {
    tracker.last = seq;
  }

  tracker.observedAt = new Date().toISOString();
};

export const recordPacket = ({
  seq = null,
  latencyMs = null,
  received = 0,
  stored = 0,
  rejected = 0,
  duplicates = 0,
  invalid = false,
  step = null,
}) => {
  if (invalid) {
    state.packets.invalid += 1;
  } else {
    state.packets.received += 1;
  }

  state.nodes.received += received;
  state.nodes.stored += stored;
  state.nodes.rejected += rejected;
  state.nodes.duplicates += duplicates;

  recordSeq(seq);
  recordLatency(latencyMs);

  if (typeof step === "number" && Number.isFinite(step)) {
    state.lastStep = step;
  }
};

const PREDICTION_OUTCOMES = [
  "requested",
  "stored",
  "failed",
  "skippedShortHistory",
  "alarms",
];

export const recordPrediction = (outcome) => {
  if (!PREDICTION_OUTCOMES.includes(outcome)) {
    return;
  }

  state.predictions[outcome] += 1;
};

export const setMlAvailability = (available, lastError = null) => {
  if (state.ml.available === available && lastError === null) {
    return;
  }

  state.ml.available = available;
  state.ml.lastError = lastError;
  state.ml.lastChangeAt = new Date().toISOString();
};

export const getStats = () => ({
  uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  startedAt: new Date(startedAt).toISOString(),
  packets: { ...state.packets },
  nodes: { ...state.nodes },
  seq: { ...state.seq },
  latencyMs: { ...state.latencyMs },
  predictions: { ...state.predictions },
  ml: { ...state.ml },
  lastStep: state.lastStep,
});
