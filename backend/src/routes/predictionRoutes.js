import express from "express";

import { getPredictions } from "../controllers/predictionController.js";

// Stored forecasts. See predictRoutes.js for the manual forecast trigger.
const router = express.Router();

router.get("/", getPredictions);

export default router;
