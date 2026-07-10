const SystemConfig = require('../models/SystemConfig');

exports.getConfig = async (req, res) => {
  try {
    let config = await SystemConfig.findOne({ userId: req.user.userId });
    if (!config) {
      // Create a default config
      config = new SystemConfig({ userId: req.user.userId });
      await config.save();
    }
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching system configuration:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const userId = req.user.userId;
    let config = await SystemConfig.findOne({ userId });
    
    if (!config) {
      config = new SystemConfig({ userId });
    }

    const {
      hrMin,
      hrMax,
      respMin,
      respMax,
      globalTrigger,
      smsEnabled,
      popupEnabled,
      emailEnabled,
      pushEnabled
    } = req.body;

    if (hrMin !== undefined) config.hrMin = hrMin;
    if (hrMax !== undefined) config.hrMax = hrMax;
    if (respMin !== undefined) config.respMin = respMin;
    if (respMax !== undefined) config.respMax = respMax;
    if (globalTrigger !== undefined) config.globalTrigger = globalTrigger;
    if (smsEnabled !== undefined) config.smsEnabled = smsEnabled;
    if (popupEnabled !== undefined) config.popupEnabled = popupEnabled;
    if (emailEnabled !== undefined) config.emailEnabled = emailEnabled;
    if (pushEnabled !== undefined) config.pushEnabled = pushEnabled;

    config.updatedAt = new Date();
    await config.save();

    res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('Error updating system configuration:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
