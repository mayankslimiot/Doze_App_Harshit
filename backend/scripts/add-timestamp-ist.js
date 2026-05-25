#!/usr/bin/env node
/**
 * Migration script: add timestampIST to existing HealthData and HealthData180s documents.
 * timestampIST = same moment as timestamp but formatted in IST (e.g. "2025-02-13 18:30:00 IST")
 * for CSV export so managers see Indian time, not UTC.
 *
 * Run from backend directory: node scripts/add-timestamp-ist.js
 * Requires: .env with MONGO_URI
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const COLLECTIONS = ["healthdata_new", "healthdata_180s"];

const pipeline = [
  {
    $set: {
      timestampIST: {
        $concat: [
          {
            $dateToString: {
              date: "$timestamp",
              format: "%Y-%m-%d %H:%M:%S",
              timezone: "Asia/Kolkata",
            },
          },
          " IST",
        ],
      },
    },
  },
];

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set in .env");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  for (const collectionName of COLLECTIONS) {
    const coll = db.collection(collectionName);
    const filter = {
      timestamp: { $exists: true, $ne: null },
      $or: [{ timestampIST: { $exists: false } }, { timestampIST: null }],
    };

    const countBefore = await coll.countDocuments(filter);
    console.log(`\n[${collectionName}] Documents missing timestampIST: ${countBefore}`);

    if (countBefore === 0) {
      console.log(`[${collectionName}] Nothing to update.`);
      continue;
    }

    const result = await coll.updateMany(filter, pipeline);
    console.log(`[${collectionName}] Update result:`, {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  }

  await mongoose.disconnect();
  console.log("\nDone.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
