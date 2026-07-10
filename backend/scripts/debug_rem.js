const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '9E56886323DA29C6';
  const sessions = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(1).lean();
  
  if (!sessions.length) return console.log('No sessions found');
  const session = sessions[0];
  
  const startMs = new Date(session.sleepOnsetTime).getTime();
  const endMs = new Date(session.sleepEndTime).getTime();
  
  const healthData = await HealthData.find({
    deviceId: deviceId,
    timestamp: { $gte: startMs - 2*3600*1000, $lte: endMs + 3600*1000 },
    $or: [
      { 'raw.HR_M': { $ne: null } },
      { 'metrics.hr_median': { $ne: null } },
    ],
  }).sort({ timestamp: 1 }).lean();
  
  const { timeline, summary } = classifySleepStages(healthData, startMs, endMs);
  
  console.log(`--- REM Diagnostic for ${deviceId} on ${session.sessionDate} ---`);
  
  let rawRemCount = 0;
  let finalRemCount = 0;
  let missingHsdCount = 0;
  let sdTooLowCount = 0;
  let hrTooLowCount = 0;
  let hrTooHighCount = 0;
  let tLastTurnFailedCount = 0;
  
  // Re-calculate baselines to check values
  const hrVals = timeline.map(e => e.hr).filter(v => typeof v === 'number');
  const hrBase = hrVals.reduce((a,b)=>a+b, 0) / hrVals.length;
  const sortedHr = [...hrVals].sort((a,b)=>a-b);
  const p25 = sortedHr[Math.floor(sortedHr.length * 0.25)];
  
  console.log(`HR_BASE: ${hrBase.toFixed(1)}, HR_LOW: ${p25.toFixed(1)}`);
  
  for (const e of timeline) {
    if (e.rawStage === 'REM') rawRemCount++;
    if (e.stage === 'REM') finalRemCount++;
    
    // Check REM conditions if not Awake/Deep
    if (e.rawStage !== 'AWAKE' && e.rawStage !== 'DEEP') {
      const hrCond = e.hr > p25 + 4 && e.hr <= hrBase + 12;
      const hsdCond = (e.hr_sd_5m !== null && e.hr_sd_5m >= 2);
      const rsdCond = (e.rr_sd_5m !== null && e.rr_sd_5m >= 1);
      const varCond = hsdCond || rsdCond;
      
      if (!hrCond) {
        if (e.hr <= p25 + 4) hrTooLowCount++;
        else if (e.hr > hrBase + 12) hrTooHighCount++;
      }
      
      if (!varCond) {
        if (e.hr_sd_5m === null && e.rr_sd_5m === null) {
          missingHsdCount++;
        } else {
          sdTooLowCount++;
        }
      }
      
      if (e.tLastTurn <= 300) tLastTurnFailedCount++;
    }
  }
  
  console.log(`Raw REM epochs (before smoothing): ${rawRemCount} (${(rawRemCount * 0.5)} mins)`);
  console.log(`Final REM epochs (after smoothing): ${finalRemCount} (${(finalRemCount * 0.5)} mins)`);
  
  console.log(`\nWhy did Light/unclassified epochs fail REM?`);
  console.log(`- HR too low (<= ${p25 + 4}): ${hrTooLowCount} epochs`);
  console.log(`- HR too high (> ${hrBase + 12}): ${hrTooHighCount} epochs`);
  console.log(`- Missing both HR_SD and RR_SD (null): ${missingHsdCount} epochs`);
  console.log(`- SD too low (HR_SD < 2 AND RR_SD < 1): ${sdTooLowCount} epochs`);
  console.log(`- Movement too recent (tLastTurn <= 300): ${tLastTurnFailedCount} epochs`);
  
  // Sample 5 Light epochs to see actual SD values
  console.log(`\nSample of 5 LIGHT epochs:`);
  const samples = timeline.filter(e => e.stage === 'LIGHT').slice(50, 55);
  for (const s of samples) {
    console.log(`HR: ${s.hr}, HR_SD: ${s.hr_sd_5m}, RR_SD: ${s.rr_sd_5m}, tLastTurn: ${s.tLastTurn}`);
  }
  
  process.exit(0);
}
run().catch(console.error);
