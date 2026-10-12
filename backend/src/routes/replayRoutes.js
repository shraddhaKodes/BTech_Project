import { Router } from "express";

import { getReplayStatus, startCsvReplay, stopCsvReplay } from "../controllers/replayController.js";

const router = Router();

router.post("/start", startCsvReplay);
router.post("/stop", stopCsvReplay);
router.get("/", getReplayStatus);

export default router;
