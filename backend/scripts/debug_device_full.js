const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '9E56886323DA29C6';

  // Get recent sessions
  const sessions = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(3).lean();
  console.log(`Found ${sessions.length} recent sessions for device ${deviceId}\n`);

  for (const session of sessions) {
    console.log(`====== Session Date: ${session.sessionDate} ======`);
    console.log(`TIB Start:        ${session.tibStart}`);
    console.log(`Sleep Onset:      ${session.sleepOnsetTime}`);
    console.log(`Sleep End:        ${session.sleepEndTime}`);
    console.log(`TIB End:          ${session.tibEnd}`);
    console.log(`Total Sleep Time: ${session.totalSleepTime} mins`);
    console.log(`Time In Bed:      ${session.timeInBed} mins`);
    console.log(`Sleep Efficiency: ${session.sleepEfficiency}%`);
    console.log(`Awakenings:       ${session.awakenings}`);
    console.log(`Sleep Score:      ${session.sleepScore}`);
    console.log(`Sleep Quality:    ${session.sleepQuality}`);
    console.log(`Deep mins:        ${session.deepSleepMinutes}`);
    console.log(`REM mins:         ${session.remMinutes}`);
    console.log(`Light mins:       ${session.lightSleepMinutes}`);
    console.log(`Awake mins:       ${session.awakeMinutes}`);
    console.log(`Stage Efficiency: ${session.stageEfficiency}%`);
    console.log(`Stage Awakenings: ${session.stageAwakenings}`);
    console.log(`WASO:             ${session.WASOmin} mins`);
    console.log(`Deep%:            ${session.deepPct}%`);
    console.log(`REM%:             ${session.remPct}%`);
    console.log(`Recovery%:        ${session.recoveryPercent}%`);
    console.log(`Data Quality:     ${session.dataQuality}%`);
    console.log(`Valid Points:     ${session.validDataPoints}`);
    console.log(`Expected Points:  ${session.expectedDataPoints}`);
    console.log(`Timeline epochs:  ${session.stageTimeline?.length || 0}`);

    // Re-run classification to see fresh output
    const startMs = new Date(session.sleepOnsetTime).getTime();
    const endMs = new Date(session.sleepEndTime).getTime();

    const healthData = await HealthData.find({
      deviceId,
      timestamp: { $gte: startMs - 2*3600*1000, $lte: endMs + 3600*1000 },
      $or: [
        { 'raw.HR_M': { $ne: null } },
        { 'metrics.hr_median': { $ne: null } },
      ],
    }).sort({ timestamp: 1 }).lean();

    console.log(`\nRe-running classification with ${healthData.length} HealthData points...`);
    if (healthData.length > 0) {
      const { timeline, summary } = classifySleepStages(healthData, startMs, endMs);
      console.log(`Epochs classified: ${timeline.length}`);
      console.log(`Summary: efficiency=${summary.efficiency}%, score=${summary.sleepScore}, quality=${summary.sleepQuality}`);
      console.log(`         deep=${summary.deepSleepMinutes}m, rem=${summary.remMinutes}m, light=${summary.lightSleepMinutes}m, awake=${summary.awakeMinutes}m`);
      console.log(`         awakenings=${summary.awakenings}, WASO=${summary.WASOmin}m`);

      // Stage distribution
      const stageCounts = {};
      for (const e of timeline) {
        stageCounts[e.stage] = (stageCounts[e.stage] || 0) + 1;
      }
      console.log(`Stage distribution:`, stageCounts);

      // Check what's happening with first/last 10 epochs
      if (timeline.length > 0) {
        console.log(`\nFirst 10 epochs:`);
        for (const e of timeline.slice(0, 10)) {
          console.log(`  ts=${e.ts} stage=${e.stage} rawStage=${e.rawStage} hr=${e.hr} rr=${e.rr} hrSD=${e.hr_sd_5m} rrSD=${e.rr_sd_5m} tLT=${e.tLastTurn}`);
        }
        console.log(`\nLast 10 epochs:`);
        for (const e of timeline.slice(-10)) {
          console.log(`  ts=${e.ts} stage=${e.stage} rawStage=${e.rawStage} hr=${e.hr} rr=${e.rr} hrSD=${e.hr_sd_5m} rrSD=${e.rr_sd_5m} tLT=${e.tLastTurn}`);
        }

        // Check Awake runs (count consecutive Awake runs and their lengths)
        let runs = [];
        let i = 0;
        while (i < timeline.length) {
          if (timeline[i].stage === 'AWAKE') {
            let j = i;
            while (j < timeline.length && timeline[j].stage === 'AWAKE') j++;
            runs.push({ start: i, len: j - i, mins: (j - i) * 0.5 });
            i = j;
          } else {
            i++;
          }
        }
        console.log(`\nAwake runs (${runs.length} total):`);
        for (const r of runs) {
          console.log(`  start_epoch=${r.start} length=${r.len} epochs (${r.mins} mins)`);
        }
      }
    }
    console.log('\n');
  }

  process.exit(0);
}
run().catch(console.error);
