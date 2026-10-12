import express from "express";
import cors from "cors";

import { config } from "./config/env.js";
import healthRoutes from "./routes/healthRoutes.js";
import latestRoutes from "./routes/latestRoutes.js";
import measurementRoutes from "./routes/measurementRoutes.js";
import predictRoutes from "./routes/predictRoutes.js";
import predictionRoutes from "./routes/predictionRoutes.js";
import replayRoutes from "./routes/replayRoutes.js";
import runsRoutes from "./routes/runsRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import topologyRoutes from "./routes/topologyRoutes.js";

const app = express();

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/topology", topologyRoutes);
app.use("/api/measurements", measurementRoutes);
app.use("/api/latest", latestRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/runs", runsRoutes);
app.use("/api/replay", replayRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: "Route not found",
    },
  });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  console.error(err.message);
  if (err.stack && process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: {
      message:
        statusCode === 500 ? "Internal server error" : err.message || "Request failed",
      ...(err.details && { details: err.details }),
    },
  });
});

export default app;
