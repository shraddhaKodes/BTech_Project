import express from "express";
import cors from "cors";

import healthRoutes from "./routes/healthRoutes.js";
import measurementRoutes from "./routes/measurementRoutes.js";
import predictionRoutes from "./routes/predictionRoutes.js";

const app = express();

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/measurements", measurementRoutes);
app.use("/api/predict", predictionRoutes);

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
        statusCode === 500
          ? "Internal server error"
          : err.message || "Request failed",
    },
  });
});

export default app;
