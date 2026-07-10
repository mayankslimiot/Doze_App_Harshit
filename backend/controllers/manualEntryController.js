const ManualEntry = require('../models/ManualEntry');
const HealthData = require('../models/HealthData');

exports.createManualEntry = async (req, res) => {
  try {
    const { deviceId, room, bed, heartRate, respiration, date, time } = req.body;

    if (!deviceId || !room || !bed || heartRate === undefined || respiration === undefined || !date || !time) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Calculate the target time window (+/- 30 seconds)
    // The device sends 'ts' in RTC which corresponds to epoch seconds.
    // If date and time from frontend represent local time, we convert them to Date object
    const targetDate = new Date(`${date}T${time}:00`);
    const targetEpoch = Math.floor(targetDate.getTime() / 1000);
    const minTs = targetEpoch - 30;
    const maxTs = targetEpoch + 30;

    const healthDataList = await HealthData.find({
      deviceId,
      $or: [
        { timestampSeconds: { $gte: minTs, $lte: maxTs } },
        { ts: { $gte: minTs, $lte: maxTs } }
      ]
    }).lean();

    let hrSum = 0, hrCount = 0;
    let respSum = 0, respCount = 0;

    for (const data of healthDataList) {
      if (data.heartRate && data.heartRate > 0) {
        hrSum += data.heartRate;
        hrCount++;
      }
      if (data.respiration && data.respiration > 0) {
        respSum += data.respiration;
        respCount++;
      }
    }

    const deviceAvgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null;
    const deviceAvgResp = respCount > 0 ? Math.round(respSum / respCount) : null;

    const entry = new ManualEntry({
      deviceId,
      room,
      bed,
      heartRate: Number(heartRate),
      respiration: Number(respiration),
      date: new Date(date),
      time,
      deviceAvgHr,
      deviceAvgResp
    });

    await entry.save();

    res.status(201).json({ success: true, data: entry, message: 'Manual entry saved successfully' });
  } catch (error) {
    console.error('Error creating manual entry:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getManualEntries = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const entries = await ManualEntry.find({ deviceId }).sort({ date: -1, time: -1 }).lean();
    res.status(200).json({ success: true, data: entries });
  } catch (error) {
    console.error('Error fetching manual entries:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
