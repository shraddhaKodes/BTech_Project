import { getTopology } from "../services/topology.js";

export const getTopologyDocument = (req, res) => {
  res.json(getTopology());
};
