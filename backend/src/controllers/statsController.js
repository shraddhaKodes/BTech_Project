import { socketCount } from "../services/socket.js";
import { getStats } from "../services/stats.js";

export const getStatistics = (req, res) => {
  res.json({
    ...getStats(),
    connectedSockets: socketCount(),
  });
};
