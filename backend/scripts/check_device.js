const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const { classifySleepStages } = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/services/sleepStageService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  
  const deviceId = '9E56886323DA29C6';
  
  // Find sessions for this device
  const sessions = await SleepSession.find({ deviceId }).sort({ sessionDate: -1 }).limit(2).lean();
  console.log(`Found ${sessions.length} sessions for device ${deviceId}`);
  
  for (const session of sessions) {
    console.log(`\n--- Session Date: ${session.sessionDate} ---`);
    console.log(`TIB Start: ${session.tibStart}`);
    console.log(`Sleep Onset: ${session.sleepOnsetTime}`);
    console.log(`Sleep End: ${session.sleepEndTime}`);
    console.log(`TIB End: ${session.tibEnd}`);
    console.log(`Old Sleep Efficiency: ${session.sleepEfficiency}%`);
    console.log(`New Stage Efficiency: ${session.stageEfficiency}%`);
    console.log(`Total Sleep Time: ${session.totalSleepTime} mins`);
    console.log(`Time In Bed: ${session.timeInBed} mins`);
    console.log(`Awakenings (Old): ${session.awakenings}`);
    console.log(`Awakenings (Stage): ${session.stageAwakenings}`);
    console.log(`Score: ${session.sleepScore}`);
    console.log(`Quality: ${session.sleepQuality}`);
    
    // Also let's re-run the calculation directly to see what it would produce
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
    
    console.log(`\nRe-running classification with ${healthData.length} data points...`);
    const { summary } = classifySleepStages(healthData, startMs, endMs);
    console.log(`Summary efficiency: ${summary.efficiency}%`);
    console.log(`Summary score: ${summary.sleepScore}`);
    console.log(`Summary awakenings: ${summary.awakenings}`);
    console.log(`Summary Deep min: ${summary.deepSleepMinutes}`);
    console.log(`Summary REM min: ${summary.remMinutes}`);
  }
  
  process.exit(0);
}

run().catch(console.error);
