import http from "node:http";

import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { config } from "./src/config/env.js";
import Measurement from "./src/models/Measurement.js";
import Prediction from "./src/models/Prediction.js";
import { initSocketServer } from "./src/services/socket.js";
import startTcpServer from "./src/services/tcpServer.js";

const startServer = async () => {
  try {
    await connectDB();
    // Failing loudly here is the point: without the unique index a replayed step
    // would silently create duplicate documents.
    await Promise.all([Measurement.syncIndexes(), Prediction.syncIndexes()]);

    const httpServer = http.createServer(app);

    initSocketServer(httpServer);
    startTcpServer();

    httpServer.listen(config.port, () => {
      console.log(`Backend server running on port ${config.port}`);
      console.log(`  HTTP       http://0.0.0.0:${config.port}`);
      console.log(`  TCP        ${config.tcpHost}:${config.tcpPort}`);
      console.log(`  ML service ${config.mlServiceUrl}`);
      console.log(`  Forecasting buses (HISTORY_L=${config.historyLength}, HORIZON_H=${config.horizon}): ${config.monitoredBuses.join(", ")}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
