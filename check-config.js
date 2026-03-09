require('dotenv').config();
const mongoose = require('mongoose');
const DailyRewardConfigV2 = require('./models/DailyRewardConfigV2');

async function check() {
  await mongoose.connect('mongodb://jacksonuat:HJKHYUHBE67HDNB@82.25.105.119:27017/jackson-uat?authSource=admin');
  const cfg = await DailyRewardConfigV2.findOne({ isActive: true }).sort({ version: -1 });
  if (!cfg) {
    console.log('NO ACTIVE CONFIG FOUND');
    await mongoose.connection.close();
    return;
  }
  console.log('Config version:', cfg.version, '| isActive:', cfg.isActive);
  console.log('\nDays:');
  cfg.days.forEach(function(d) {
    console.log('  Day ' + d.dayNumber + ' -> active: ' + d.active + ' | coins: ' + d.coinValue + ' | xp: ' + d.xpValue);
  });
  console.log('\nbigReward:', JSON.stringify(cfg.bigReward, null, 2));
  await mongoose.connection.close();
}

check().catch(function(e) {
  console.error(e.message);
  process.exit(1);
});
