import { Router } from "express";

import { getRuns } from "../controllers/runsController.js";

const router = Router();

router.get("/", getRuns);

export default router;
