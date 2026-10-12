/**
 * Seeds a clearly-labelled demo run so the dashboard can be exercised without a
 * MATLAB laptop. Everything it writes carries source: "demo", which the backend
 * only accepts when started with ALLOW_TEST_DATA=true, and the UI labels amber.
 *
 *   node scripts/seedDemo.js --allow-demo [--steps 24] [--run-id demo-1]
 *
 * Refuses to run without --allow-demo. Voltages start from the published IEEE
 * full-load benchmark profile in data/feeder_topology.json and add a smooth
 * daily variation; they are demo values, not measurements.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../src/config/env.js";

const args = process.argv.slice(2);

if (!args.includes("--allow-demo")) {
  console.error(
    "Refusing to seed demo data. Re-run with --allow-demo to confirm you want\n" +
      'labelled demo values (source: "demo") in the database, and start the\n' +
      "backend with ALLOW_TEST_DATA=true so it accepts them."
  );
  process.exit(1);
}

const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const steps = Number.parseInt(argValue("--steps", "24"), 10);
const runId = argValue("--run-id", `demo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`);
const baseUrl = `http://127.0.0.1:${config.port}`;

const topology = JSON.parse(
  readFileSync(path.join(config.backendRoot, "data", "feeder_topology.json"), "utf8")
);
const buses = topology.nodes.filter((node) => node.kind === "bus");
const PHASE_ANGLE = { a: 0, b: -120, c: 120 };

const STEP_MS = 15 * 60 * 1000;
// End the run at "now" so the dashboard's last-update reads as live.
const base = Date.now() - steps * STEP_MS;

const voltageFor = (bus, step) => {
  const daily = (Math.sin((step / 96) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const voltage = {};

  String(bus.phases).split("").forEach((phase) => {
    const benchmark = bus.benchmarkVoltagePu?.[phase] ?? 1.0;
    voltage[phase] = {
      magnitude: Number((benchmark * (1 - 0.02 * daily)).toFixed(6)),
      angle: Number((PHASE_ANGLE[phase] + step * 0.25).toFixed(4)),
    };
  });

  return voltage;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let stored = 0;

for (let step = 1; step <= steps; step += 1) {
  const reply = await fetch(`${baseUrl}/api/measurements`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      seq: step,
      runId,
      step,
      source: "demo",
      timestamp: new Date(base + step * STEP_MS).toISOString(),
      loadFactor: Number((0.6 + 0.35 * ((Math.sin((step / 96) * Math.PI * 2 - Math.PI / 2) + 1) / 2)).toFixed(4)),
      nodes: buses.map((bus) => ({ bus: bus.id, voltage: voltageFor(bus, step) })),
    }),
  }).then((response) => response.json());

  if (reply.ok === false) {
    console.error(`Step ${step} rejected:`, JSON.stringify(reply.errors ?? reply));
    console.error('If the error mentions ALLOW_TEST_DATA, start the backend with ALLOW_TEST_DATA=true.');
    process.exit(1);
  }

  stored += reply.stored ?? 0;
  process.stdout.write(`\rstep ${step}/${steps} stored=${stored}`);
  await wait(60);
}

console.log(`\nSeeded ${stored} demo documents (runId "${runId}", source "demo") across ${buses.length} buses.`);
console.log("Remove them later with: node scripts/cleanTestMeasurements.js --yes");
