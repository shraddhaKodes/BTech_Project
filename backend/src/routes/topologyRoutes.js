import express from "express";

import { getTopologyDocument } from "../controllers/topologyController.js";

const router = express.Router();

router.get("/", getTopologyDocument);

export default router;
