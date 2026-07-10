const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '9E56886323DA29C6';

  const sessions = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(3).lean();

  for (const session of sessions) {
    const startMs = new Date(session.sleepOnsetTime).getTime();
    const endMs = new Date(session.sleepEndTime).getTime();

    console.log(`\n====== Session: ${session.sessionDate} ======`);
    console.log(`Sleep: ${session.sleepOnsetTime} → ${session.sleepEndTime}`);

    const healthData = await HealthData.find({
      deviceId,
      timestamp: { $gte: startMs, $lte: endMs },
    }).sort({ timestamp: 1 }).lean();

    console.log(`Total HealthData points in session: ${healthData.length}`);

    // Check raw RESSD values
    let ressdNull = 0, ressdZero = 0, ressdNonZero = 0, ressdGte3 = 0;
    let hrsdNull = 0, hrsdZero = 0, hrsdNonZero = 0;
    let ressdValues = [];
    let hrsdValues = [];

    for (const p of healthData) {
      const raw = p.raw || {};
      const ressd = raw.RESSD;
      const hrsd = raw.HR_SD;

      // RESSD
      if (ressd === undefined || ressd === null || ressd === '') {
        ressdNull++;
      } else {
        const val = Number(ressd);
        if (val === 0) ressdZero++;
        else { ressdNonZero++; ressdValues.push(val); }
        if (val >= 3) ressdGte3++;
      }

      // HR_SD
      if (hrsd === undefined || hrsd === null || hrsd === '') {
        hrsdNull++;
      } else {
        const val = Number(hrsd);
        if (val === 0) hrsdZero++;
        else { hrsdNonZero++; hrsdValues.push(val); }
      }
    }

    console.log(`\nraw.RESSD distribution:`);
    console.log(`  null/empty: ${ressdNull} (${(ressdNull/healthData.length*100).toFixed(1)}%)`);
    console.log(`  zero:       ${ressdZero} (${(ressdZero/healthData.length*100).toFixed(1)}%)`);
    console.log(`  non-zero:   ${ressdNonZero} (${(ressdNonZero/healthData.length*100).toFixed(1)}%)`);
    console.log(`  >= 3:       ${ressdGte3} (${(ressdGte3/healthData.length*100).toFixed(1)}%)`);
    if (ressdValues.length > 0) {
      ressdValues.sort((a,b) => a-b);
      console.log(`  min: ${ressdValues[0]}, max: ${ressdValues[ressdValues.length-1]}, median: ${ressdValues[Math.floor(ressdValues.length/2)]}`);
      console.log(`  sample non-zero values (first 20): ${ressdValues.slice(0,20).join(', ')}`);
    }

    console.log(`\nraw.HR_SD distribution:`);
    console.log(`  null/empty: ${hrsdNull} (${(hrsdNull/healthData.length*100).toFixed(1)}%)`);
    console.log(`  zero:       ${hrsdZero} (${(hrsdZero/healthData.length*100).toFixed(1)}%)`);
    console.log(`  non-zero:   ${hrsdNonZero} (${(hrsdNonZero/healthData.length*100).toFixed(1)}%)`);
    if (hrsdValues.length > 0) {
      hrsdValues.sort((a,b) => a-b);
      console.log(`  min: ${hrsdValues[0]}, max: ${hrsdValues[hrsdValues.length-1]}, median: ${hrsdValues[Math.floor(hrsdValues.length/2)]}`);
    }

    // Check what readEpochFields produces vs raw data  
    // Sample 5 points from middle of the night where RESSD is non-zero
    const middlePoints = healthData.filter(p => {
      const raw = p.raw || {};
      const ressd = raw.RESSD;
      return ressd !== undefined && ressd !== null && ressd !== '' && Number(ressd) > 0;
    }).slice(Math.floor(healthData.length * 0.3), Math.floor(healthData.length * 0.3) + 10);

    if (middlePoints.length > 0) {
      console.log(`\nSample raw data from mid-night (non-zero RESSD):`);
      for (const p of middlePoints) {
        const raw = p.raw || {};
        console.log(`  TS=${raw.TS || p.timestampSeconds} HR_M=${raw.HR_M} Res_M=${raw.Res_M} HR_SD=${raw.HR_SD} RESSD=${raw.RESSD} MS_B=${raw.MS_B} MST=${raw.MST} AS=${raw.AS}`);
      }
    }

    // Also check: how many epochs have rr > RR_BASE+5 (Awake trigger)?
    const rrVals = healthData.map(p => {
      const raw = p.raw || {};
      return Number(raw.Res_M) || null;
    }).filter(v => v !== null && v > 0);
    if (rrVals.length > 0) {
      const rrBase = rrVals.reduce((a,b)=>a+b,0) / rrVals.length;
      const rrAboveThresh = rrVals.filter(v => v > rrBase + 5).length;
      console.log(`\nRR_BASE: ${rrBase.toFixed(1)}, Awake threshold (RR_BASE+5): ${(rrBase+5).toFixed(1)}`);
      console.log(`RR values > threshold: ${rrAboveThresh} (${(rrAboveThresh/rrVals.length*100).toFixed(1)}%)`);
    }

    // Check: what % of Awake epochs were triggered by which rule?
    // We need to re-check the classify logic
    const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');
    const allHealth = await HealthData.find({
      deviceId,
      timestamp: { $gte: startMs - 2*3600*1000, $lte: endMs + 3600*1000 },
      $or: [
        { 'raw.HR_M': { $ne: null } },
        { 'metrics.hr_median': { $ne: null } },
      ],
    }).sort({ timestamp: 1 }).lean();

    const { timeline } = classifySleepStages(allHealth, startMs, endMs);
    
    // For Awake epochs, check which condition would have triggered
    const baselines = {
      HR_BASE: timeline.map(e=>e.hr).filter(v=>typeof v==='number').reduce((a,b)=>a+b,0) / timeline.filter(e=>typeof e.hr==='number').length,
      RR_BASE: timeline.map(e=>e.rr).filter(v=>typeof v==='number').reduce((a,b)=>a+b,0) / timeline.filter(e=>typeof e.rr==='number').length,
    };
    
    let awakeReasons = { tlt10: 0, tlt120_hrHigh: 0, hrVeryHigh: 0, rrHigh: 0, hsdHigh: 0, rsdHigh: 0, snore: 0 };
    for (const e of timeline) {
      if (e.rawStage !== 'AWAKE') continue;
      // Check each condition in priority order (first match)
      if (e.tLastTurn <= 10) { awakeReasons.tlt10++; continue; }
      const hsd = e.hr_sd_5m;
      const rsd = e.rr_sd_5m;
      const hrStab = (typeof hsd === 'number' && hsd < 2) ? 1 : (typeof hsd === 'number' && hsd < 4) ? 2 : 3;
      if (e.tLastTurn <= 120 && typeof e.hr === 'number' && e.hr > baselines.HR_BASE + 8) { awakeReasons.tlt120_hrHigh++; continue; }
      if (typeof e.hr === 'number' && e.hr > baselines.HR_BASE + 12) { awakeReasons.hrVeryHigh++; continue; }
      if (typeof e.rr === 'number' && e.rr > baselines.RR_BASE + 5) { awakeReasons.rrHigh++; continue; }
      if (typeof hsd === 'number' && hsd >= 6) { awakeReasons.hsdHigh++; continue; }
      if (typeof rsd === 'number' && rsd >= 3) { awakeReasons.rsdHigh++; continue; }
      awakeReasons.snore++;
    }
    
    const totalAwake = timeline.filter(e => e.rawStage === 'AWAKE').length;
    console.log(`\nAwake epoch breakdown (${totalAwake} total raw Awake):`);
    console.log(`  T_LAST_TURN <= 10s (movement):     ${awakeReasons.tlt10} (${(awakeReasons.tlt10/totalAwake*100).toFixed(1)}%)`);
    console.log(`  T_LAST_TURN <= 120 + HR high:      ${awakeReasons.tlt120_hrHigh} (${(awakeReasons.tlt120_hrHigh/totalAwake*100).toFixed(1)}%)`);
    console.log(`  HR > HR_BASE+12 (very high HR):    ${awakeReasons.hrVeryHigh} (${(awakeReasons.hrVeryHigh/totalAwake*100).toFixed(1)}%)`);
    console.log(`  RR > RR_BASE+5 (high respiration): ${awakeReasons.rrHigh} (${(awakeReasons.rrHigh/totalAwake*100).toFixed(1)}%)`);
    console.log(`  HR_SD >= 6:                        ${awakeReasons.hsdHigh} (${(awakeReasons.hsdHigh/totalAwake*100).toFixed(1)}%)`);
    console.log(`  RR_SD >= 3:                        ${awakeReasons.rsdHigh} (${(awakeReasons.rsdHigh/totalAwake*100).toFixed(1)}%)`);
    console.log(`  Snore + unstable:                  ${awakeReasons.snore} (${(awakeReasons.snore/totalAwake*100).toFixed(1)}%)`);
  }

  process.exit(0);
}
run().catch(console.error);
