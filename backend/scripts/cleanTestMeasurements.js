/**
 * Removes non-production measurement documents: the demo run, anything tagged
 * with a test/demo/mock source, and the early documents written before per-bus
 * ingestion existed (no runId).
 *
 *   node scripts/cleanTestMeasurements.js          # show counts, change nothing
 *   node scripts/cleanTestMeasurements.js --yes    # delete them
 *
 * Predictions belonging to a deleted run are removed too, so no forecast outlives
 * the measurements it was scored against.
 */
import mongoose from "mongoose";

import connectDB from "../src/config/db.js";
import Measurement from "../src/models/Measurement.js";
import Prediction from "../src/models/Prediction.js";

const TEST_SOURCES = ["test", "demo", "mock", "matlab-test"];

const CATEGORIES = {
  "runId demo-run": { runId: "demo-run" },
  [`source in (${TEST_SOURCES.join(", ")})`]: { source: { $in: TEST_SOURCES } },
  "no runId (pre-ingestion documents)": { runId: { $exists: false } },
};

const UNION_FILTER = { $or: Object.values(CATEGORIES) };

const run = async () => {
  const confirm = process.argv.slice(2).includes("--yes");

  await connectDB();
  console.log(`Database: ${mongoose.connection.name}`);

  for (const [label, filter] of Object.entries(CATEGORIES)) {
    console.log(`  ${label}: ${await Measurement.countDocuments(filter)}`);
  }

  const total = await Measurement.countDocuments(UNION_FILTER);
  console.log(`Total measurement documents matching: ${total}`);

  if (total === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!confirm) {
    console.log('No changes were made. Re-run with --yes to delete these documents.');
    return;
  }

  const runIds = await Measurement.distinct("runId", UNION_FILTER);
  const measurements = await Measurement.deleteMany(UNION_FILTER);
  console.log(`Deleted ${measurements.deletedCount} measurement document(s).`);

  const predictions = await Prediction.deleteMany({ runId: { $in: runIds } });
  console.log(`Deleted ${predictions.deletedCount} prediction document(s) from those runs.`);
};

run()
  .catch((error) => {
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
