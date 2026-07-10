const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '9E56886323DA29C6';

  // Get July 4 session date
  const session = await SleepSession.findOne({ deviceId, sessionDate: '2026-07-05' }).lean()
    || await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(1).lean().then(r => r[0]);

  if (!session) { console.log('No session found'); process.exit(1); }

  console.log(`\n====== SESSION ======`);
  console.log(`Date:         ${session.sessionDate}`);
  console.log(`TIB Start:    ${session.tibStart}`);
  console.log(`Sleep Onset:  ${session.sleepOnsetTime}`);
  console.log(`Sleep End:    ${session.sleepEndTime}`);
  console.log(`TIB End:      ${session.tibEnd}`);
  console.log(`Score:        ${session.sleepScore}   Quality: ${session.sleepQuality}`);
  console.log(`Efficiency:   ${session.sleepEfficiency}%`);
  console.log(`Deep:         ${session.deepSleepMinutes} min`);
  console.log(`REM:          ${session.remMinutes} min`);
  console.log(`Light:        ${session.lightSleepMinutes} min`);
  console.log(`Awake:        ${session.awakeMinutes} min`);
  console.log(`WASO:         ${session.WASOmin} min`);
  console.log(`Awakenings:   ${session.awakenings}`);
  console.log(`Timeline epochs stored: ${session.stageTimeline?.length || 0}`);

  const startMs = new Date(session.sleepOnsetTime).getTime();
  const endMs   = new Date(session.sleepEndTime).getTime();
  const sessionDurationMin = (endMs - startMs) / 60000;
  console.log(`\nSession duration:     ${sessionDurationMin.toFixed(1)} min`);
  console.log(`Expected 30s epochs:  ${Math.round(sessionDurationMin * 2)}`);
  console.log(`Stored timeline:      ${session.stageTimeline?.length || 0} epochs`);
  if (session.stageTimeline?.length) {
    const ratio = session.stageTimeline.length / (sessionDurationMin * 2);
    console.log(`Epoch ratio:          ${ratio.toFixed(2)}x  (1.0 = normal, 5.0 = 5x duplicates)`);
  }

  // Pull raw HealthData
  const healthData = await HealthData.find({
    deviceId,
    timestamp: { $gte: startMs - 2*3600*1000, $lte: endMs + 3600*1000 },
  }).sort({ timestamp: 1 }).lean();

  console.log(`\nTotal HealthData points in window: ${healthData.length}`);
  const inSession = healthData.filter(p => {
    const t = p.timestampSeconds ? p.timestampSeconds * 1000 : new Date(p.timestamp).getTime();
    return t >= startMs && t <= endMs;
  });
  console.log(`HealthData points within session:  ${inSession.length}`);
  console.log(`Expected for ~${sessionDurationMin.toFixed(0)} min at 6s intervals: ${Math.round(sessionDurationMin * 10)}`);
  const actualRatio = inSession.length / Math.round(sessionDurationMin * 10);
  console.log(`Points ratio:  ${actualRatio.toFixed(2)}x  (1.0 = normal 6s interval)`);

  // Check timestamp spacing — are points arriving every 6s or every ~1.2s?
  if (inSession.length > 20) {
    const timestamps = inSession.map(p => p.timestampSeconds ? p.timestampSeconds * 1000 : new Date(p.timestamp).getTime()).sort((a,b)=>a-b);
    const gaps = [];
    for (let i = 1; i < Math.min(timestamps.length, 200); i++) {
      gaps.push(timestamps[i] - timestamps[i-1]);
    }
    gaps.sort((a,b)=>a-b);
    const medianGap = gaps[Math.floor(gaps.length/2)];
    const avgGap = gaps.reduce((a,b)=>a+b,0) / gaps.length;
    console.log(`\nTimestamp gap analysis (first 200 points):`);
    console.log(`  Min gap:    ${gaps[0]}ms`);
    console.log(`  Median gap: ${medianGap}ms  (expect 6000ms normally)`);
    console.log(`  Avg gap:    ${avgGap.toFixed(0)}ms`);
    console.log(`  Max gap:    ${gaps[gaps.length-1]}ms`);

    // Distribution of gaps
    let lt1s=0, g1to3=0, g3to8=0, g8to15=0, g15plus=0;
    for (const g of gaps) {
      if (g < 1000) lt1s++;
      else if (g < 3000) g1to3++;
      else if (g < 8000) g3to8++;
      else if (g < 15000) g8to15++;
      else g15plus++;
    }
    console.log(`  Gap distribution:`);
    console.log(`    < 1s:      ${lt1s}`);
    console.log(`    1-3s:      ${g1to3}`);
    console.log(`    3-8s:      ${g3to8}  ← normal 6s here`);
    console.log(`    8-15s:     ${g8to15}`);
    console.log(`    >15s:      ${g15plus}`);
  }

  // Check epoch boundary records (MS_B present) — how many per 30s window?
  const epochBoundary = inSession.filter(p => {
    const raw = p.raw || {};
    return raw.MS_B !== undefined && raw.MS_B !== null && raw.MS_B !== '';
  });
  console.log(`\nEpoch-boundary records (MS_B present): ${epochBoundary.length}`);
  console.log(`Expected epoch boundaries for ${sessionDurationMin.toFixed(0)} min: ${Math.round(sessionDurationMin * 2)}`);
  if (epochBoundary.length > 0) {
    const ebRatio = epochBoundary.length / Math.round(sessionDurationMin * 2);
    console.log(`Epoch-boundary ratio: ${ebRatio.toFixed(2)}x  ← THIS is the key. >1 means duplicates.`);

    // Check spacing of epoch boundaries
    const ebTs = epochBoundary.map(p => p.timestampSeconds ? p.timestampSeconds * 1000 : new Date(p.timestamp).getTime()).sort((a,b)=>a-b);
    const ebGaps = [];
    for (let i = 1; i < Math.min(ebTs.length, 100); i++) {
      ebGaps.push(ebTs[i] - ebTs[i-1]);
    }
    ebGaps.sort((a,b)=>a-b);
    const ebMedian = ebGaps[Math.floor(ebGaps.length/2)];
    console.log(`Epoch-boundary median gap: ${ebMedian}ms  (expect 30000ms normally)`);
    console.log(`Sample epoch-boundary gaps (first 10): ${ebGaps.slice(0,10).map(g=>`${(g/1000).toFixed(1)}s`).join(', ')}`);
  }

  // Re-run classification and look at stage distribution
  const { timeline, summary } = classifySleepStages(healthData, startMs, endMs);
  console.log(`\n====== RE-RUN CLASSIFICATION ======`);
  console.log(`Epochs classified: ${timeline.length}`);
  const stageCounts = {};
  for (const e of timeline) stageCounts[e.stage] = (stageCounts[e.stage] || 0) + 1;
  console.log(`Stage distribution:`, stageCounts);
  console.log(`Summary: eff=${summary.efficiency}%, score=${summary.sleepScore}, quality=${summary.sleepQuality}`);
  console.log(`  deep=${summary.deepSleepMinutes}m, rem=${summary.remMinutes}m, light=${summary.lightSleepMinutes}m, awake=${summary.awakeMinutes}m`);
  console.log(`  WASO=${summary.WASOmin}m, awakenings=${summary.awakenings}`);

  // Awake reasons breakdown
  const isNum = v => typeof v === 'number' && isFinite(v);
  const hrVals = timeline.map(e=>e.hr).filter(isNum);
  const rrVals = timeline.map(e=>e.rr).filter(isNum);
  const HR_BASE = hrVals.reduce((a,b)=>a+b,0)/hrVals.length;
  const RR_BASE = rrVals.reduce((a,b)=>a+b,0)/rrVals.length;
  let reasons = { tlt10:0, tlt120_hr:0, hrHigh:0, rrHigh:0, hsdHigh:0, rsdHigh:0, snore:0 };
  for (const e of timeline) {
    if (e.rawStage !== 'AWAKE') continue;
    if (e.tLastTurn <= 10) { reasons.tlt10++; continue; }
    const hsd = e.hr_sd_5m, rsd = e.rr_sd_5m;
    if (e.tLastTurn <= 120 && isNum(e.hr) && e.hr > HR_BASE+8) { reasons.tlt120_hr++; continue; }
    if (isNum(e.hr) && e.hr > HR_BASE+12) { reasons.hrHigh++; continue; }
    if (isNum(e.rr) && e.rr > RR_BASE+5) { reasons.rrHigh++; continue; }
    if (isNum(hsd) && hsd >= 6) { reasons.hsdHigh++; continue; }
    if (isNum(rsd) && rsd >= 3) { reasons.rsdHigh++; continue; }
    reasons.snore++;
  }
  const totalRawAwake = timeline.filter(e=>e.rawStage==='AWAKE').length;
  console.log(`\nAwake triggers (${totalRawAwake} raw Awake epochs):`);
  console.log(`  T_LAST_TURN<=10:   ${reasons.tlt10} (${(reasons.tlt10/totalRawAwake*100||0).toFixed(1)}%)`);
  console.log(`  TLT<=120+HR high:  ${reasons.tlt120_hr} (${(reasons.tlt120_hr/totalRawAwake*100||0).toFixed(1)}%)`);
  console.log(`  HR>HR_BASE+12:     ${reasons.hrHigh} (${(reasons.hrHigh/totalRawAwake*100||0).toFixed(1)}%)`);
  console.log(`  RR>RR_BASE+5:      ${reasons.rrHigh} (${(reasons.rrHigh/totalRawAwake*100||0).toFixed(1)}%)`);
  console.log(`  HR_SD>=6:          ${reasons.hsdHigh} (${(reasons.hsdHigh/totalRawAwake*100||0).toFixed(1)}%)`);
  console.log(`  RR_SD>=3:          ${reasons.rsdHigh} (${(reasons.rsdHigh/totalRawAwake*100||0).toFixed(1)}%)`);

  // Sample first 15 epochs to spot duplicates
  console.log(`\nFirst 15 classified epochs:`);
  for (const e of timeline.slice(0,15)) {
    console.log(`  ts=${e.ts} stage=${e.stage} hr=${e.hr} rr=${e.rr} hrSD=${e.hr_sd_5m?.toFixed(2)} rrSD=${e.rr_sd_5m?.toFixed(2)} tLT=${e.tLastTurn}`);
  }

  process.exit(0);
}
run().catch(console.error);
