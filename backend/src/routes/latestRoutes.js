import express from "express";

import { getLatestMeasurements } from "../controllers/measurementController.js";

const router = express.Router();

router.get("/", getLatestMeasurements);

export default router;
