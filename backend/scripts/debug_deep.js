const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '23A71FB68A8A635E';
  const sessions = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(1).lean();
  
  if (!sessions.length) return console.log('No sessions found for this device');
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
  
  console.log(`--- Diagnostics for ${deviceId} on ${session.sessionDate} ---`);
  
  // Re-calculate baselines to check values
  const hrVals = timeline.map(e => e.hr).filter(v => typeof v === 'number');
  const rrVals = timeline.map(e => e.rr).filter(v => typeof v === 'number');
  const hrBase = hrVals.reduce((a,b)=>a+b, 0) / hrVals.length;
  const rrBase = rrVals.reduce((a,b)=>a+b, 0) / rrVals.length;
  const sortedHr = [...hrVals].sort((a,b)=>a-b);
  const hrLow = sortedHr[Math.floor(sortedHr.length * 0.25)];
  
  console.log(`HR_BASE: ${hrBase.toFixed(1)}, HR_LOW: ${hrLow.toFixed(1)}, RR_BASE: ${rrBase.toFixed(1)}`);
  
  let rawDeepCount = 0;
  let finalDeepCount = 0;
  
  let deepFailTurn = 0;
  let deepFailHr = 0;
  let deepFailHsd = 0;
  let deepFailRr = 0;
  let deepFailRsd = 0;
  
  for (const e of timeline) {
    if (e.rawStage === 'DEEP') rawDeepCount++;
    if (e.stage === 'DEEP') finalDeepCount++;
    
    // Check DEEP conditions if not Awake
    if (e.rawStage !== 'AWAKE') {
      let isDeep = true;
      if (e.tLastTurn <= 600) { deepFailTurn++; isDeep = false; }
      else if (e.hr > hrLow + 6) { deepFailHr++; isDeep = false; }
      else if (e.hr_sd_5m === null || e.hr_sd_5m >= 3) { deepFailHsd++; isDeep = false; }
      else if (e.rr > rrBase + 1) { deepFailRr++; isDeep = false; }
      else if (e.rr_sd_5m === null || e.rr_sd_5m >= 1.2) { deepFailRsd++; isDeep = false; }
    }
  }
  
  console.log(`Raw DEEP epochs (before smoothing): ${rawDeepCount} (${(rawDeepCount * 0.5)} mins)`);
  console.log(`Final DEEP epochs (after smoothing): ${finalDeepCount} (${(finalDeepCount * 0.5)} mins)`);
  
  console.log(`\nWhy did non-Awake epochs fail DEEP (checked sequentially)?`);
  console.log(`- Movement too recent (tLastTurn <= 600s / 10m): ${deepFailTurn} epochs`);
  console.log(`- HR too high (> ${hrLow + 6}): ${deepFailHr} epochs`);
  console.log(`- HR variability too high (HR_SD >= 3): ${deepFailHsd} epochs`);
  console.log(`- Respiration too high (> ${rrBase + 1}): ${deepFailRr} epochs`);
  console.log(`- Resp variability too high (RR_SD >= 1.2): ${deepFailRsd} epochs`);
  
  process.exit(0);
}
run().catch(console.error);
