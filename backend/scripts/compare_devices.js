const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function analyzeDevice(deviceId) {
  // Get latest session (should be July 4 = night of July 3→4)
  const sessions = await SleepSession.find({ deviceId, sessionDate: '2026-07-04' }).lean();
  if (!sessions.length) {
    // Try finding latest
    const latest = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(2).lean();
    if (!latest.length) { console.log(`  No sessions found for ${deviceId}`); return null; }
    console.log(`  No July 4 session. Latest sessions: ${latest.map(s => s.sessionDate).join(', ')}`);
    return latest[0];
  }
  return sessions[0];
}

async function fullAnalysis(deviceId, session) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`DEVICE: ${deviceId}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Session Date:     ${session.sessionDate}`);
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
  console.log(`Timeline epochs:  ${session.stageTimeline?.length || 0}`);

  const startMs = new Date(session.sleepOnsetTime).getTime();
  const endMs = new Date(session.sleepEndTime).getTime();

  // Raw data analysis
  const healthData = await HealthData.find({
    deviceId,
    timestamp: { $gte: startMs, $lte: endMs },
  }).sort({ timestamp: 1 }).lean();

  console.log(`\nRaw HealthData points: ${healthData.length}`);

  // RESSD distribution
  let ressdNull = 0, ressdNonZero = 0, ressdGte3 = 0;
  let ressdValues = [];
  let hrsdNull = 0, hrsdNonZero = 0;
  let hrsdValues = [];

  for (const p of healthData) {
    const raw = p.raw || {};
    const ressd = raw.RESSD;
    const hrsd = raw.HR_SD;

    if (ressd === undefined || ressd === null || ressd === '') ressdNull++;
    else { const v = Number(ressd); if (v > 0) { ressdNonZero++; ressdValues.push(v); } if (v >= 3) ressdGte3++; }

    if (hrsd === undefined || hrsd === null || hrsd === '') hrsdNull++;
    else { const v = Number(hrsd); if (v > 0) { hrsdNonZero++; hrsdValues.push(v); } }
  }

  console.log(`RESSD: null=${ressdNull}, nonzero=${ressdNonZero}, >=3=${ressdGte3}`);
  if (ressdValues.length) {
    ressdValues.sort((a,b)=>a-b);
    console.log(`  min=${ressdValues[0]}, max=${ressdValues[ressdValues.length-1]}, median=${ressdValues[Math.floor(ressdValues.length/2)]}`);
  }
  console.log(`HR_SD: null=${hrsdNull}, nonzero=${hrsdNonZero}`);
  if (hrsdValues.length) {
    hrsdValues.sort((a,b)=>a-b);
    console.log(`  min=${hrsdValues[0]}, max=${hrsdValues[hrsdValues.length-1]}, median=${hrsdValues[Math.floor(hrsdValues.length/2)]}`);
  }

  // Re-run classification
  const allHealth = await HealthData.find({
    deviceId,
    timestamp: { $gte: startMs - 2*3600*1000, $lte: endMs + 3600*1000 },
    $or: [
      { 'raw.HR_M': { $ne: null } },
      { 'metrics.hr_median': { $ne: null } },
    ],
  }).sort({ timestamp: 1 }).lean();

  const { timeline, summary } = classifySleepStages(allHealth, startMs, endMs);

  // Stage distribution
  const stageCounts = {};
  for (const e of timeline) stageCounts[e.stage] = (stageCounts[e.stage] || 0) + 1;
  console.log(`\nRe-run stage distribution:`, stageCounts);
  console.log(`Re-run summary: eff=${summary.efficiency}%, score=${summary.sleepScore}, quality=${summary.sleepQuality}`);
  console.log(`  deep=${summary.deepSleepMinutes}m, rem=${summary.remMinutes}m, light=${summary.lightSleepMinutes}m, awake=${summary.awakeMinutes}m`);
  console.log(`  awakenings=${summary.awakenings}, WASO=${summary.WASOmin}m`);

  // Awake reason breakdown
  const hrVals = timeline.map(e=>e.hr).filter(v=>typeof v==='number');
  const rrVals = timeline.map(e=>e.rr).filter(v=>typeof v==='number');
  const HR_BASE = hrVals.reduce((a,b)=>a+b,0)/hrVals.length;
  const RR_BASE = rrVals.reduce((a,b)=>a+b,0)/rrVals.length;

  let reasons = { tlt10: 0, tlt120_hr: 0, hrHigh: 0, rrHigh: 0, hsdHigh: 0, rsdHigh: 0, snore: 0 };
  for (const e of timeline) {
    if (e.rawStage !== 'AWAKE') continue;
    if (e.tLastTurn <= 10) { reasons.tlt10++; continue; }
    const hsd = e.hr_sd_5m, rsd = e.rr_sd_5m;
    const hrStab = (typeof hsd==='number'&&hsd<2)?1:(typeof hsd==='number'&&hsd<4)?2:3;
    if (e.tLastTurn <= 120 && typeof e.hr==='number' && e.hr > HR_BASE+8) { reasons.tlt120_hr++; continue; }
    if (typeof e.hr==='number' && e.hr > HR_BASE+12) { reasons.hrHigh++; continue; }
    if (typeof e.rr==='number' && e.rr > RR_BASE+5) { reasons.rrHigh++; continue; }
    if (typeof hsd==='number' && hsd >= 6) { reasons.hsdHigh++; continue; }
    if (typeof rsd==='number' && rsd >= 3) { reasons.rsdHigh++; continue; }
    reasons.snore++;
  }
  const totalAwake = timeline.filter(e=>e.rawStage==='AWAKE').length;
  console.log(`\nAwake triggers (${totalAwake} raw Awake epochs):`);
  console.log(`  T_LAST_TURN<=10:   ${reasons.tlt10} (${totalAwake?(reasons.tlt10/totalAwake*100).toFixed(1):0}%)`);
  console.log(`  TLT<=120+HR high:  ${reasons.tlt120_hr} (${totalAwake?(reasons.tlt120_hr/totalAwake*100).toFixed(1):0}%)`);
  console.log(`  HR>HR_BASE+12:     ${reasons.hrHigh} (${totalAwake?(reasons.hrHigh/totalAwake*100).toFixed(1):0}%)`);
  console.log(`  RR>RR_BASE+5:      ${reasons.rrHigh} (${totalAwake?(reasons.rrHigh/totalAwake*100).toFixed(1):0}%)`);
  console.log(`  HR_SD>=6:          ${reasons.hsdHigh} (${totalAwake?(reasons.hsdHigh/totalAwake*100).toFixed(1):0}%)`);
  console.log(`  RR_SD>=3:          ${reasons.rsdHigh} (${totalAwake?(reasons.rsdHigh/totalAwake*100).toFixed(1):0}%)`);
  console.log(`  Snore+unstable:    ${reasons.snore} (${totalAwake?(reasons.snore/totalAwake*100).toFixed(1):0}%)`);

  // HR range for this device
  const sortedHr = [...hrVals].sort((a,b)=>a-b);
  console.log(`\nHR range: min=${sortedHr[0]}, p25=${sortedHr[Math.floor(sortedHr.length*0.25)]}, median=${sortedHr[Math.floor(sortedHr.length*0.5)]}, p75=${sortedHr[Math.floor(sortedHr.length*0.75)]}, max=${sortedHr[sortedHr.length-1]}`);
  console.log(`HR_BASE=${HR_BASE.toFixed(1)}, RR_BASE=${RR_BASE.toFixed(1)}`);

  return { timeline, summary, reasons, totalAwake, HR_BASE, RR_BASE };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');

  const dev1 = '9E56886323DA29C6';
  const dev2 = '6FD5807F8EBAE70F';

  const session1 = await analyzeDevice(dev1);
  const session2 = await analyzeDevice(dev2);

  if (session1) await fullAnalysis(dev1, session1);
  if (session2) await fullAnalysis(dev2, session2);

  // Side by side comparison
  if (session1 && session2) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`SIDE-BY-SIDE COMPARISON`);
    console.log(`${'='.repeat(70)}`);
    console.log(`                          ${dev1}    ${dev2}`);
    console.log(`Session Date:             ${session1.sessionDate}              ${session2.sessionDate}`);
    console.log(`Efficiency:               ${session1.sleepEfficiency}%              ${session2.sleepEfficiency}%`);
    console.log(`Score:                    ${session1.sleepScore}                ${session2.sleepScore}`);
    console.log(`Awakenings:               ${session1.awakenings}                ${session2.awakenings}`);
    console.log(`Deep mins:                ${session1.deepSleepMinutes}              ${session2.deepSleepMinutes}`);
    console.log(`REM mins:                 ${session1.remMinutes}              ${session2.remMinutes}`);
    console.log(`Light mins:               ${session1.lightSleepMinutes}              ${session2.lightSleepMinutes}`);
    console.log(`Awake mins:               ${session1.awakeMinutes}              ${session2.awakeMinutes}`);
    console.log(`WASO:                     ${session1.WASOmin}              ${session2.WASOmin}`);
  }

  process.exit(0);
}
run().catch(console.error);
