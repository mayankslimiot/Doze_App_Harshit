require('dotenv').config();
const mongoose = require('mongoose');
const Organization = require('./models/Organization');
const Device = require('./models/Device');

async function assignDevice() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const org = await Organization.findOne({ name: 'Dr. SSM Hospital' });
    if (!org) {
      console.log('Organization not found');
      return;
    }
    console.log('Found org:', org._id);

    const device = await Device.findOne({ deviceId: '7CFB3818804F47C4' });
    if (!device) {
      console.log('Device not found');
      return;
    }
    console.log('Found device:', device._id);

    device.organizationId = org._id;
    device.room = '111';
    device.bed = '1';
    
    await device.save();
    console.log('Device updated successfully!');

  } catch (err) {
    console.error(err);
  } finally {
    mongoose.disconnect();
  }
}

assignDevice();
