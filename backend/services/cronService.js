const cron = require('node-cron');
const Organization = require('../models/Organization');
const Account = require('../models/Account');
const User = require('../models/User');
const Device = require('../models/Device');
const { logger } = require('../utils/logger');

// Run everyday at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('Running scheduled task: Cleanup Trashed Organizations (Bypassed - manual deletion required)');
  return;
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find organizations that are suspended and suspendedAt is older than 7 days
    const expiredOrganizations = await Organization.find({
      isActive: false,
      suspendedAt: { $lt: sevenDaysAgo }
    });

    if (expiredOrganizations.length === 0) {
      logger.info('No expired trashed organizations found.');
      return;
    }

    for (const org of expiredOrganizations) {
      logger.info(`Permanently deleting organization: ${org.name} (${org.organizationId})`);
      
      const account = await Account.findOne({ organizationId: org._id });
      
      if (account) {
        const accountIdStr = account.accountId || String(account._id);
        
        // 1. Unassign devices
        await Device.updateMany(
          { $or: [{ organizationId: org._id }, { accountId: accountIdStr }] },
          { $set: { organizationId: null, accountId: null, userId: null, status: 'inactive', profileId: null } }
        );

        // 2. Delete users associated with this account
        await User.deleteMany({ account: account._id });

        // 3. Delete the account
        await Account.deleteOne({ _id: account._id });
      } else {
        // Fallback: unassign devices by org ID only and users by org ID
        await Device.updateMany(
          { organizationId: org._id },
          { $set: { organizationId: null, accountId: null, userId: null, status: 'inactive', profileId: null } }
        );
        await User.deleteMany({ organizationId: org._id });
      }

      // 4. Delete the organization
      await Organization.deleteOne({ _id: org._id });
    }

    logger.info(`Successfully deleted ${expiredOrganizations.length} trashed organizations.`);
  } catch (error) {
    logger.error('Error during cleanup of trashed organizations:', error);
  }
});

module.exports = cron;
