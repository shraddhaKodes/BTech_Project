import { ANGLE_LIMITS, DEFAULT_SOURCE, MAGNITUDE_LIMITS, REAL_SOURCES, TEST_SOURCES, config } from "../config/env.js";
import { getPhases, isBus } from "./topology.js";

const PHASES = ["a", "b", "c"];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const parseTimestamp = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// The current sender emits one packet per step holding every bus. The earlier
// single-bus shape (voltage at the top level) is still accepted so existing
// test clients keep working.
const toNodes = (raw) => {
  if (Array.isArray(raw.nodes)) {
    return raw.nodes;
  }

  if (raw.voltage && typeof raw.voltage === "object" && !Array.isArray(raw.voltage)) {
    return [
      {
        bus: raw.bus,
        voltage: raw.voltage,
        frequency: raw.frequency,
        power: raw.power,
      },
    ];
  }

  return null;
};

const validatePhasor = (phasor, bus, phase, allowedPhases) => {
  if (!allowedPhases.includes(phase)) {
    return `phase "${phase}" does not exist at bus ${bus} (has ${allowedPhases.join("") || "none"}).`;
  }

  if (!phasor || typeof phasor !== "object" || Array.isArray(phasor)) {
    return `voltage.${phase} must be an object.`;
  }

  if (!isFiniteNumber(phasor.magnitude)) {
    return `voltage.${phase}.magnitude must be a finite number.`;
  }

  if (phasor.magnitude < MAGNITUDE_LIMITS.min || phasor.magnitude > MAGNITUDE_LIMITS.max) {
    return `voltage.${phase}.magnitude ${phasor.magnitude} is outside ${MAGNITUDE_LIMITS.min}..${MAGNITUDE_LIMITS.max} pu (per-unit, not volts).`;
  }

  if (phasor.angle !== undefined && !isFiniteNumber(phasor.angle)) {
    return `voltage.${phase}.angle must be a finite number.`;
  }

  if (
    phasor.angle !== undefined &&
    (phasor.angle < ANGLE_LIMITS.min || phasor.angle > ANGLE_LIMITS.max)
  ) {
    return `voltage.${phase}.angle ${phasor.angle} is outside ${ANGLE_LIMITS.min}..${ANGLE_LIMITS.max} degrees.`;
  }

  return null;
};

const validateSource = (value) => {
  const source =
    value === undefined || value === null || value === "" ? DEFAULT_SOURCE : String(value).trim();

  if (REAL_SOURCES.includes(source)) {
    return { source };
  }

  if (TEST_SOURCES.includes(source)) {
    if (config.allowTestData) {
      return { source };
    }

    return {
      error: `source "${source}" is test data; start the backend with ALLOW_TEST_DATA=true to accept it.`,
    };
  }

  return {
    error: `source "${source}" is not allowed (expected one of ${[...REAL_SOURCES, ...TEST_SOURCES].join(", ")}).`,
  };
};

const validateNode = (node, index) => {
  const label = node && typeof node === "object" ? (node.bus ?? `nodes[${index}]`) : `nodes[${index}]`;

  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return { bus: label, reason: "node must be an object." };
  }

  const bus = node.bus === undefined || node.bus === null ? "" : String(node.bus).trim();

  if (!bus) {
    return { bus: label, reason: "bus is required." };
  }

  if (!isBus(bus)) {
    return { bus, reason: `bus ${bus} is not a bus node in feeder_topology.json.` };
  }

  if (!node.voltage || typeof node.voltage !== "object" || Array.isArray(node.voltage)) {
    return { bus, reason: "voltage is required." };
  }

  const allowedPhases = getPhases(bus);
  const voltage = {};
  const problems = [];

  PHASES.forEach((phase) => {
    if (node.voltage[phase] === undefined) {
      return;
    }

    const problem = validatePhasor(node.voltage[phase], bus, phase, allowedPhases);

    if (problem) {
      problems.push(problem);
      return;
    }

    voltage[phase] = {
      magnitude: node.voltage[phase].magnitude,
      ...(node.voltage[phase].angle !== undefined && { angle: node.voltage[phase].angle }),
    };
  });

  const unknownKeys = Object.keys(node.voltage).filter((key) => !PHASES.includes(key));
  unknownKeys.forEach((key) => problems.push(`voltage.${key} is not a phase.`));

  if (problems.length > 0) {
    return { bus, reason: problems.join(" ") };
  }

  if (Object.keys(voltage).length === 0) {
    return { bus, reason: "voltage must contain at least one of phases a, b, c." };
  }

  const document = { bus, voltage };

  if (isFiniteNumber(node.frequency)) {
    document.frequency = node.frequency;
  }

  if (node.power && isFiniteNumber(node.power.active) && isFiniteNumber(node.power.reactive)) {
    document.power = { active: node.power.active, reactive: node.power.reactive };
  }

  return { document };
};

/**
 * Splits an incoming packet into a normalized header plus per-node accept/reject
 * lists. Packet-level problems go to `errors` and make `packet` null; a bad node
 * only rejects that node.
 */
export const validatePacket = (raw) => {
  const errors = [];
  const accepted = [];
  const rejected = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { packet: null, accepted, rejected, errors: ["Packet must be a JSON object."] };
  }

  const timestamp = parseTimestamp(raw.timestamp);
  if (!timestamp) {
    errors.push("timestamp is required and must be a valid date.");
  }

  if (!isFiniteNumber(raw.step)) {
    errors.push("step is required and must be a finite number.");
  }

  const nodes = toNodes(raw);
  if (!nodes) {
    errors.push("Packet must contain a nodes array or a top-level voltage.");
  } else if (nodes.length === 0) {
    errors.push("nodes must not be empty.");
  }

  if (raw.loadFactor !== undefined && !isFiniteNumber(raw.loadFactor)) {
    errors.push("loadFactor must be a finite number.");
  }

  const sourceCheck = validateSource(raw.source);
  if (sourceCheck.error) {
    errors.push(sourceCheck.error);
  }

  if (errors.length > 0) {
    return { packet: null, accepted, rejected, errors };
  }

  nodes.forEach((node, index) => {
    const result = validateNode(node, index);

    if (result.document) {
      accepted.push(result.document);
    } else {
      rejected.push({ bus: result.bus, reason: result.reason });
    }
  });

  return {
    packet: {
      timestamp,
      step: raw.step,
      runId: raw.runId === undefined || raw.runId === null ? "default" : String(raw.runId),
      source: sourceCheck.source,
      loadFactor: isFiniteNumber(raw.loadFactor) ? raw.loadFactor : undefined,
      seq: isFiniteNumber(raw.seq) ? raw.seq : undefined,
      sentAt: isFiniteNumber(raw.sentAt) ? raw.sentAt : undefined,
    },
    accepted,
    rejected,
    errors,
  };
};
