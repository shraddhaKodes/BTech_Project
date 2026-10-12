import express from "express";

import { createPrediction } from "../controllers/predictionController.js";

// Manual forecast trigger for one bus. See predictionRoutes.js for reading
// stored forecasts.
const router = express.Router();

router.post("/", createPrediction);

export default router;
