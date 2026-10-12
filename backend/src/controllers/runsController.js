import Measurement from "../models/Measurement.js";

// One summary row per runId, newest first. The dashboard defaults to the newest
// run whose source is "simulink-qsts".
export const getRuns = async (req, res, next) => {
  try {
    const runs = await Measurement.aggregate([
      { $match: { runId: { $exists: true } } },
      {
        $group: {
          _id: "$runId",
          sources: { $addToSet: "$source" },
          buses: { $addToSet: "$bus" },
          steps: { $addToSet: "$step" },
          firstTimestamp: { $min: "$timestamp" },
          lastTimestamp: { $max: "$timestamp" },
        },
      },
      {
        $project: {
          _id: 0,
          runId: "$_id",
          source: {
            $cond: [
              { $eq: [{ $size: "$sources" }, 1] },
              { $arrayElemAt: ["$sources", 0] },
              "mixed",
            ],
          },
          buses: { $size: "$buses" },
          steps: { $size: "$steps" },
          firstTimestamp: 1,
          lastTimestamp: 1,
        },
      },
      { $sort: { lastTimestamp: -1 } },
    ]);

    return res.json(runs);
  } catch (error) {
    return next(error);
  }
};
