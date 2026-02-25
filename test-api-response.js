/**
 * Test API Response
 * Call the actual API and see what it returns
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:4001';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTk5ZTE0ZjYxZjUyZTM5NWUxNTMxYTQiLCJpYXQiOjE3NzIwMzM4MzcsImV4cCI6MTc3NzIxNzgzN30.OI-4QitiEQV1ljYpvv67yv5wLEw91sQJFAl_gpXEvxg';

async function testAPI() {
  try {
    console.log('\n🔍 Testing API Response');
    console.log('='.repeat(70));
    console.log('API URL:', API_URL);

    const response = await axios.get(`${API_URL}/api/v3/daily-rewards/week`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = response.data.data;

    console.log('\n📊 API RESPONSE:');
    console.log('   Success:', response.data.success);
    console.log('   Week Key:', data.weekKey);
    console.log('   Week Start:', data.weekStart);
    console.log('   Week End:', data.weekEnd);
    console.log('   Today Day Number:', data.todayDayNumber);
    console.log('   Week Number:', data.weekNumber);
    console.log('   Is User Week:', data.isUserWeek);
    console.log('   Display Mode:', data.displayMode);

    console.log('\n📅 DAYS:');
    data.days.forEach(day => {
      console.log(`   Day ${day.dayNumber}: ${day.status} - ${day.rewardCoins} coins, ${day.rewardXp} XP`);
    });

    console.log('\n🔍 USER WEEK METADATA:');
    if (data.userWeek) {
      console.log('   Join Date:', data.userWeek.joinDate);
      console.log('   Week Number:', data.userWeek.weekNumber);
      console.log('   Days Since Join:', data.userWeek.daysSinceJoin);
      console.log('   Today Day Number:', data.userWeek.todayDayNumber);
    }

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testAPI();
