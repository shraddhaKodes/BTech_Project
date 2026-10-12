export const PHASES = ["a", "b", "c"];
export const VOLTAGE_LOW = 0.95;
export const VOLTAGE_HIGH = 1.05;

export function phaseList(phases) {
  if (!phases) {
    return [];
  }

  return String(phases).toLowerCase().split("").filter((phase) => PHASES.includes(phase));
}

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "--";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
}

export function formatPu(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "--";
}

export function formatAngle(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "--";
}

export function getVoltageMagnitude(measurement, phases) {
  if (!measurement?.voltage) {
    return null;
  }

  const values = phaseList(phases)
    .map((phase) => measurement.voltage?.[phase]?.magnitude)
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function voltageState(value) {
  if (!Number.isFinite(value)) {
    return "unknown";
  }

  if (value < VOLTAGE_LOW || value > VOLTAGE_HIGH) {
    return "alarm";
  }

  if (value <= VOLTAGE_LOW + 0.01 || value >= VOLTAGE_HIGH - 0.01) {
    return "warning";
  }

  return "normal";
}

export function normalizeMeasurement(raw, fallbackBus) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const bus = raw.bus ?? raw.node ?? raw.id ?? fallbackBus;

  if (!bus) {
    return null;
  }

  return {
    ...raw,
    bus: String(bus),
    timestamp: raw.timestamp ?? raw.createdAt ?? new Date().toISOString(),
    step: raw.step ?? raw.sample ?? null,
    loadFactor: raw.loadFactor ?? null,
    voltage: raw.voltage ?? {},
  };
}

export function buildMeasurementMaps(measurements) {
  const latestByBus = new Map();
  const historyByBus = new Map();

  measurements.forEach((measurement) => {
    const normalized = normalizeMeasurement(measurement);

    if (!normalized) {
      return;
    }

    const existing = historyByBus.get(normalized.bus) ?? [];
    historyByBus.set(normalized.bus, [...existing, normalized].slice(-80));
    latestByBus.set(normalized.bus, normalized);
  });

  return { latestByBus, historyByBus };
}

export function buildForecastSeries(prediction, phases) {
  const predictions = prediction?.predictions ?? [];

  return predictions.map((point, index) => ({
    index,
    step: point.step,
    timestamp: point.targetTimestamp,
    value: getVoltageMagnitude(point, phases),
  })).filter((point) => Number.isFinite(point.value));
}

export function buildAlarmList(predictionsByBus, nodesById) {
  const alarms = [];

  predictionsByBus.forEach((prediction, bus) => {
    const node = nodesById.get(bus);
    const phases = node?.phases ?? "abc";

    (prediction?.predictions ?? []).forEach((point) => {
      phaseList(phases).forEach((phase) => {
        const value = point.voltage?.[phase]?.magnitude;

        if (Number.isFinite(value) && (value < VOLTAGE_LOW || value > VOLTAGE_HIGH)) {
          alarms.push({
            bus,
            phase,
            step: point.step,
            timestamp: point.targetTimestamp,
            value,
          });
        }
      });
    });
  });

  return alarms
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(0, 24);
}
