import fs from "node:fs";

import { config } from "../config/env.js";

const loadTopology = () => {
  try {
    return JSON.parse(fs.readFileSync(config.topologyPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not load feeder topology from ${config.topologyPath}: ${error.message}`);
  }
};

const topology = loadTopology();
const nodesById = new Map(topology.nodes.map((node) => [String(node.id), node]));

export const getTopology = () => topology;

export const getNode = (bus) => nodesById.get(String(bus ?? "").trim());

export const isBus = (bus) => getNode(bus)?.kind === "bus";

// Buses are not always three-phase: 1, 2 or 3 phases depending on the node.
export const getPhases = (bus) => {
  const phases = getNode(bus)?.phases;
  return phases ? String(phases).toLowerCase().split("") : [];
};
