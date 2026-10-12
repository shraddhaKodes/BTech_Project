import { useEffect, useMemo, useRef, useState } from "react";
import { getHealth, getRecentMeasurements } from "../api/api.js";
import { normalizeMeasurement } from "../utils/scada.js";
import { useMockStream } from "./useMockStream.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const POLL_MS = 2500;

function useRealStream(enabled = true) {
  const seenKeys = useRef(new Set());
  const [state, setState] = useState({
    connectionState: "checking",
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

    let isCurrent = true;

    const poll = async () => {
      try {
        const health = await getHealth();
        if (health?.mongo?.connected !== true) {
          throw new Error("MongoDB is disconnected; stored measurements are unavailable.");
        }

        const measurements = (await getRecentMeasurements()).map((item) => normalizeMeasurement(item)).filter(Boolean);
        const last = measurements.at(-1);
        const newCount = measurements.reduce((count, measurement) => {
          const key = measurement._id ?? `${measurement.bus}-${measurement.step}-${measurement.timestamp}`;

          if (seenKeys.current.has(key)) {
            return count;
          }

          seenKeys.current.add(key);
          return count + 1;
        }, 0);

        if (isCurrent) {
          setState((current) => ({
            ...current,
            connectionState: "connected",
            measurements,
            lastUpdate: last?.timestamp ?? current.lastUpdate,
            messageCount: current.messageCount + newCount,
            error: "",
          }));
        }
      } catch (error) {
        if (isCurrent) {
          setState((current) => ({
            ...current,
            connectionState: "disconnected",
            error: error.message,
          }));
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, POLL_MS);

    return () => {
      isCurrent = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return state;
}

export function useScadaStream(topologyNodes) {
  const real = useRealStream(!USE_MOCK);
  const mock = useMockStream(topologyNodes, USE_MOCK);

  return useMemo(
    () => ({
      ...(USE_MOCK ? mock : real),
      isMock: USE_MOCK,
    }),
    [mock, real]
  );
}
