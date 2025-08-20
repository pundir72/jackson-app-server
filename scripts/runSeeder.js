#!/usr/bin/env node

const { seedHomeData, connectDB } = require('./seedHomeData');

console.log('🚀 Starting Jackson App Home Data Seeder...\n');

connectDB()
    .then(() => {
        return seedHomeData();
    })
    .then(() => {
        console.log('\n🎉 Seeding completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    }); 