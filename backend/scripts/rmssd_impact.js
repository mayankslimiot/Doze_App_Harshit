const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '9E56886323DA29C6';

  const sessions = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(3).lean();

  for (const session of sessions) {
    const startMs = new Date(session.sleepOnsetTime).getTime();
    const endMs   = new Date(session.sleepEndTime).getTime();

    console.log(`\n${'='.repeat(65)}`);
    console.log(`SESSION: ${session.sessionDate}  (${new Date(session.sleepOnsetTime).toLocaleTimeString()} → ${new Date(session.sleepEndTime).toLocaleTimeString()})`);
    console.log(`${'='.repeat(65)}`);

    // BEFORE: from stored session in DB (computed before RMSSD)
    console.log('\n--- BEFORE (stored in DB, pre-RMSSD) ---');
    console.log(`  Score:      ${session.sleepScore}    Quality: ${session.sleepQuality}`);
    console.log(`  Efficiency: ${session.sleepEfficiency}%`);
    console.log(`  Deep:       ${session.deepSleepMinutes} min   REM: ${session.remMinutes} min   Light: ${session.lightSleepMinutes} min   Awake: ${session.awakeMinutes} min`);
    console.log(`  Awakenings: ${session.awakenings}    WASO: ${session.WASOmin} min`);
    console.log(`  Deep%:      ${session.deepPct}%    REM%: ${session.remPct}%    Recovery: ${session.recoveryPercent}%`);

    // AFTER: re-run classification NOW (with RMSSD code active)
    const allHealth = await HealthData.find({
      deviceId,
      timestamp: { $gte: startMs - 2*3600*1000, $lte: endMs + 3600*1000 },
      $or: [
        { 'raw.HR_M': { $ne: null } },
        { 'metrics.hr_median': { $ne: null } },
      ],
    }).sort({ timestamp: 1 }).lean();

    const { timeline, summary } = classifySleepStages(allHealth, startMs, endMs);

    // Check how many epochs have actual RMSSD data
    const rmssdEpochs = timeline.filter(e => typeof e.rmssd === 'number' && isFinite(e.rmssd)).length;
    const rmssdValues = timeline.map(e => e.rmssd).filter(v => typeof v === 'number' && isFinite(v));
    rmssdValues.sort((a,b)=>a-b);
    const rmssdMedian = rmssdValues.length ? rmssdValues[Math.floor(rmssdValues.length/2)] : null;

    console.log('\n--- AFTER (re-run with RMSSD integration) ---');
    console.log(`  Score:      ${summary.sleepScore}    Quality: ${summary.sleepQuality}`);
    console.log(`  Efficiency: ${summary.efficiency}%`);
    console.log(`  Deep:       ${summary.deepSleepMinutes} min   REM: ${summary.remMinutes} min   Light: ${summary.lightSleepMinutes} min   Awake: ${summary.awakeMinutes} min`);
    console.log(`  Awakenings: ${summary.awakenings}    WASO: ${summary.WASOmin} min`);
    console.log(`  Deep%:      ${summary.deepPct}%    REM%: ${summary.remPct}%    Recovery: ${summary.recoveryPercent}%`);
    console.log(`  rmssdMedian: ${summary.rmssdMedian} ms`);
    console.log(`  RMSSD data: ${rmssdEpochs} epochs out of ${timeline.length} have RMSSD (median=${rmssdMedian})`);

    console.log('\n--- DELTA (After - Before) ---');
    const scoreDelta = summary.sleepScore - session.sleepScore;
    const effDelta   = summary.efficiency - session.sleepEfficiency;
    const deepDelta  = summary.deepSleepMinutes - session.deepSleepMinutes;
    const remDelta   = summary.remMinutes - session.remMinutes;
    const lightDelta = summary.lightSleepMinutes - session.lightSleepMinutes;
    const awakeDelta = summary.awakeMinutes - session.awakeMinutes;
    console.log(`  Score:      ${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`);
    console.log(`  Efficiency: ${effDelta >= 0 ? '+' : ''}${effDelta.toFixed(1)}%`);
    console.log(`  Deep:       ${deepDelta >= 0 ? '+' : ''}${deepDelta} min`);
    console.log(`  REM:        ${remDelta >= 0 ? '+' : ''}${remDelta} min`);
    console.log(`  Light:      ${lightDelta >= 0 ? '+' : ''}${lightDelta} min`);
    console.log(`  Awake:      ${awakeDelta >= 0 ? '+' : ''}${awakeDelta} min`);
  }

  process.exit(0);
}
run().catch(console.error);
