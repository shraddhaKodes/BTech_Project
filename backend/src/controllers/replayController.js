import { replayStatus, startReplay, stopReplay } from "../services/replay.js";

export const startCsvReplay = (req, res, next) => {
  try {
    return res.status(202).json(startReplay(req.body ?? {}));
  } catch (error) {
    return next(error);
  }
};

export const stopCsvReplay = (req, res) => {
  res.json(stopReplay());
};

export const getReplayStatus = (req, res) => {
  res.json(replayStatus());
};
