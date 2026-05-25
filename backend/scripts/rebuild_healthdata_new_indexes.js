#!/usr/bin/env node

/**
 * Rebuilds critical indexes for the healthdata_new collection.
 *
 * Why:
 * - We want v2 uniqueness to be (deviceId, seq, ts).
 * - We also want legacy uniqueness to be (deviceId, timestampSeconds), BUT ONLY for legacy docs
 *   where seq/ts are missing.
 *
 * MongoDB will NOT automatically update an existing index definition just because the Mongoose
 * schema changed, so we drop/recreate the legacy index safely.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const COLLECTION = 'healthdata_new';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const col = mongoose.connection.collection(COLLECTION);

  const existing = await col.indexes();
  const byName = new Map(existing.map((i) => [i.name, i]));

  // 1) Drop the old legacy unique index if present
  // Historically this has existed as: unique + sparse (too broad; blocks v2)
  const legacyName = 'deviceId_1_timestampSeconds_1';
  if (byName.has(legacyName)) {
    console.log(`[IDX] Dropping ${legacyName} ...`);
    await col.dropIndex(legacyName);
  } else {
    console.log(`[IDX] ${legacyName} not found; skipping drop`);
  }

  // 2) Ensure v2 unique index exists (create if missing)
  const v2Name = 'deviceId_1_seq_1_ts_1';
  if (!byName.has(v2Name)) {
    console.log(`[IDX] Creating ${v2Name} (unique partial on numeric seq+ts) ...`);
    await col.createIndex(
      { deviceId: 1, seq: 1, ts: 1 },
      {
        name: v2Name,
        unique: true,
        partialFilterExpression: {
          seq: { $type: 'number' },
          ts: { $type: 'number' },
        },
        background: true,
      }
    );
  } else {
    console.log(`[IDX] ${v2Name} already exists; leaving as-is`);
  }

  // 3) Recreate corrected legacy unique index (only for legacy docs where seq/ts absent)
  // Some MongoDB versions do not support $exists/$not inside partial indexes.
  // To avoid blocking v2 docs that may legitimately share timestampSeconds, we include seq
  // in the unique key. Legacy docs typically have seq missing/null.
  console.log(`[IDX] Creating ${legacyName} (unique on deviceId+timestampSeconds+seq, timestampSeconds numeric only) ...`);
  await col.createIndex(
    { deviceId: 1, timestampSeconds: 1, seq: 1 },
    {
      name: legacyName,
      unique: true,
      partialFilterExpression: {
        timestampSeconds: { $type: 'number' },
      },
      background: true,
    }
  );

  const after = await col.indexes();
  console.log('[IDX] Final indexes (names):', after.map((i) => i.name));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
