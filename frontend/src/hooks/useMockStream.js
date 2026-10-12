import { useEffect, useMemo, useState } from "react";
import { PHASES, phaseList } from "../utils/scada.js";

const MOCK_BUSES = ["150", "1", "13", "67", "83", "114"];
const STEP_MS = 1200;

function makeVoltage(bus, phases, step, forecastOffset = 0) {
  const phaseNames = phaseList(phases);
  const seed = Number.parseInt(bus, 10) || bus.charCodeAt(0);
  const daily = Math.sin(((step + forecastOffset) / 96) * Math.PI * 2 - Math.PI / 2);
  const local = Math.sin(((step + forecastOffset + seed) / 19) * Math.PI * 2);
  const loadFactor = 0.62 + 0.34 * ((daily + 1) / 2);
  const base = bus === "150" ? 1.0 : 1.035 - loadFactor * 0.075 - (seed % 9) * 0.002;

  return phaseNames.reduce((voltage, phase, index) => {
    const phaseOffset = (PHASES.indexOf(phase) - 1) * 0.004;
    voltage[phase] = {
      magnitude: base + phaseOffset + local * 0.006 + forecastOffset * -0.0015,
      angle: -120 * index + local * 2.5,
    };
    return voltage;
  }, {});
}

function makeMeasurement(node, step, now) {
  const daily = Math.sin((step / 96) * Math.PI * 2 - Math.PI / 2);

  return {
    bus: node.id,
    step,
    timestamp: now.toISOString(),
    loadFactor: 0.62 + 0.34 * ((daily + 1) / 2),
    voltage: makeVoltage(node.id, node.phases, step),
  };
}

function makePrediction(node, step, originTimestamp) {
  return {
    bus: node.id,
    model: "mock-daily-sine",
    horizonSteps: 12,
    originTimestamp,
    predictions: Array.from({ length: 12 }, (_, index) => {
      const offset = index + 1;
      const targetTimestamp = new Date(new Date(originTimestamp).getTime() + offset * STEP_MS);

      return {
        step: step + offset,
        targetTimestamp: targetTimestamp.toISOString(),
        voltage: makeVoltage(node.id, node.phases, step, offset),
      };
    }),
  };
}

export function useMockStream(topologyNodes, enabled = true) {
  const mockNodes = useMemo(
    () => MOCK_BUSES.map((id) => topologyNodes.find((node) => node.id === id)).filter(Boolean),
    [topologyNodes]
  );
  const [state, setState] = useState({
    connectionState: "mock",
    measurements: [],
    predictionsByBus: new Map(),
    lastUpdate: null,
    messageCount: 0,
    error: "",
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let step = 0;

    const pushFrame = () => {
      const now = new Date();
      const frame = mockNodes.map((node) => makeMeasurement(node, step, now));
      const predictionsByBus = new Map(
        mockNodes.map((node) => [node.id, makePrediction(node, step, now.toISOString())])
      );

      setState((current) => ({
        ...current,
        measurements: [...current.measurements, ...frame].slice(-360),
        predictionsByBus,
        lastUpdate: now.toISOString(),
        messageCount: current.messageCount + frame.length,
      }));

      step += 1;
    };

    pushFrame();
    const timer = window.setInterval(pushFrame, STEP_MS);

    return () => window.clearInterval(timer);
  }, [enabled, mockNodes]);

  return state;
}
