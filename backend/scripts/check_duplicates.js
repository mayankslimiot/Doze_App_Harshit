const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/.env' });
const HealthData = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/HealthData');
const SleepSession = require('/Users/mayankpratapsingh/Apps/Doze_App_Harshit/backend/models/SleepSession');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dozemate');
  const deviceId = '9E56886323DA29C6';

  const session = await SleepSession.findOne({ deviceId, sessionDate: '2026-07-05' }).lean();
  if (!session) return;
  const startMs = new Date(session.sleepOnsetTime).getTime();
  const endMs   = new Date(session.sleepEndTime).getTime();

  const healthData = await HealthData.find({
    deviceId,
    timestamp: { $gte: startMs, $lte: startMs + 10 * 60 * 1000 }, // first 10 mins
  }).sort({ timestamp: 1 }).lean();

  console.log(`\nChecking for repeated values in the first 10 minutes of July 4-5 session...`);
  console.log(`Found ${healthData.length} records.\n`);

  for (let i = 0; i < Math.min(30, healthData.length); i++) {
    const p = healthData[i];
    const ts = p.timestampSeconds ? p.timestampSeconds * 1000 : new Date(p.timestamp).getTime();
    const time = new Date(ts).toISOString().substr(11, 8); // HH:mm:ss
    const hr = p.raw?.HR_M || p.metrics?.hr_median || p.heartRate;
    const rr = p.raw?.Res_M || p.metrics?.respirationMedian || p.respiration;
    const msb = p.raw?.MS_B !== undefined ? p.raw.MS_B : 'missing';
    
    console.log(`[${time}] HR: ${hr}, RR: ${rr}, MS_B: ${msb}`);
  }

  process.exit(0);
}
run().catch(console.error);
