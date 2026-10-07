import express from "express";

import {
  createMeasurement,
  getMeasurements,
} from "../controllers/measurementController.js";

const router = express.Router();

router.post("/", createMeasurement);
router.get("/", getMeasurements);

export default router;
