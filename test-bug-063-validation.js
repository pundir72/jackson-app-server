/**
 * BUG-063 Test: Spin Wheel Probability Configuration
 * Test the exact scenarios described in the bug report
 */

const mongoose = require('mongoose');
const SpinWheelReward = require('./models/SpinWheelReward');
const { 
  validateProbabilityConfiguration, 
  getProbabilityAnalysis,
  suggestProbabilityFixes 
} = require('./utils/spinWheelProbabilityValidator');

async function testBug063Scenarios() {
  try {
    console.log('🧪 Testing BUG-063: Spin Wheel Probability Configuration\n');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-app');
    console.log('✅ Connected to database\n');
    
    // Clear existing test data
    await SpinWheelReward.deleteMany({ name: /^TEST_BUG_063/ });
    console.log('🧹 Cleared existing test data\n');
    
    // Test 1: Same probability across different tiers (SHOULD BE ALLOWED)
    console.log('📋 Test 1: Same probability across different tiers (SHOULD BE ALLOWED)');
    
    const bronzeReward = new SpinWheelReward({
      name: 'TEST_BUG_063_Bronze_10',
      type: 'coins',
      amount: 100,
      probability: 10,
      eligibleTiers: ['Bronze'],
      createdBy: new mongoose.Types.ObjectId()
    });
    await bronzeReward.save();
    console.log('✅ Created Bronze reward with 10% probability');
    
    // Try to create Silver reward with same 10% probability (should be allowed)
    const silverValidation = await validateProbabilityConfiguration({
      name: 'TEST_BUG_063_Silver_10',
      probability: 10,
      eligibleTiers: ['Silver']
    });
    
    console.log(`Result: ${silverValidation.isValid ? '✅ ALLOWED' : '❌ BLOCKED'}`);
    if (!silverValidation.isValid) {
      console.log('❌ ERROR: Same probability across different tiers should be allowed!');
      console.log('Errors:', silverValidation.errors);
    } else {
      console.log('✅ CORRECT: Same probability allowed across different tiers');
    }
    
    // Test 2: Duplicate probability within same tier (SHOULD BE BLOCKED)
    console.log('\n📋 Test 2: Duplicate probability within same tier (SHOULD BE BLOCKED)');
    
    // Try to create another Bronze reward with same 10% probability (should be blocked)
    const duplicateValidation = await validateProbabilityConfiguration({
      name: 'TEST_BUG_063_Bronze_10_Duplicate',
      probability: 10,
      eligibleTiers: ['Bronze']
    });
    
    console.log(`Result: ${duplicateValidation.isValid ? '❌ ALLOWED (BUG!)' : '✅ BLOCKED'}`);
    if (duplicateValidation.isValid) {
      console.log('❌ ERROR: Duplicate probability within same tier should be blocked!');
    } else {
      console.log('✅ CORRECT: Duplicate probability within same tier is blocked');
      console.log('Error details:', duplicateValidation.errors[0]?.message);
    }
    
    // Test 3: Multi-tier reward with duplicate in one tier
    console.log('\n📋 Test 3: Multi-tier reward with duplicate in one tier');
    
    // Try to create a reward that spans Bronze and Gold, where Bronze already has 10%
    const multiTierValidation = await validateProbabilityConfiguration({
      name: 'TEST_BUG_063_Multi_Tier',
      probability: 10,
      eligibleTiers: ['Bronze', 'Gold'] // Bronze already has 10%, Gold doesn't
    });
    
    console.log(`Result: ${multiTierValidation.isValid ? '❌ ALLOWED (BUG!)' : '✅ BLOCKED'}`);
    if (multiTierValidation.isValid) {
      console.log('❌ ERROR: Should be blocked due to Bronze tier conflict');
    } else {
      console.log('✅ CORRECT: Blocked due to Bronze tier having duplicate probability');
      console.log('Error details:', multiTierValidation.errors[0]?.message);
    }
    
    // Test 4: Tier probability limit (100%)
    console.log('\n📋 Test 4: Tier probability limit (100%)');
    
    // Create rewards that total 95% in Gold tier
    const goldReward1 = new SpinWheelReward({
      name: 'TEST_BUG_063_Gold_50',
      type: 'coins',
      amount: 500,
      probability: 50,
      eligibleTiers: ['Gold'],
      createdBy: new mongoose.Types.ObjectId()
    });
    await goldReward1.save();
    
    const goldReward2 = new SpinWheelReward({
      name: 'TEST_BUG_063_Gold_45',
      type: 'xp',
      amount: 1000,
      probability: 45,
      eligibleTiers: ['Gold'],
      createdBy: new mongoose.Types.ObjectId()
    });
    await goldReward2.save();
    
    console.log('✅ Created Gold rewards totaling 95%');
    
    // Try to add 10% more (should be blocked - would total 105%)
    const excessValidation = await validateProbabilityConfiguration({
      name: 'TEST_BUG_063_Gold_Excess',
      probability: 10,
      eligibleTiers: ['Gold']
    });
    
    console.log(`Result: ${excessValidation.isValid ? '❌ ALLOWED (BUG!)' : '✅ BLOCKED'}`);
    if (excessValidation.isValid) {
      console.log('❌ ERROR: Should be blocked - would exceed 100% for Gold tier');
    } else {
      console.log('✅ CORRECT: Blocked because Gold tier would exceed 100%');
      console.log('Error details:', excessValidation.errors[0]?.message);
    }
    
    // Test 5: Update existing reward (should exclude self from validation)
    console.log('\n📋 Test 5: Update existing reward (should exclude self from validation)');
    
    // Try to update Bronze reward to keep same probability (should be allowed)
    const updateValidation = await validateProbabilityConfiguration({
      name: 'TEST_BUG_063_Bronze_10_Updated',
      probability: 10,
      eligibleTiers: ['Bronze']
    }, bronzeReward._id); // Exclude self
    
    console.log(`Result: ${updateValidation.isValid ? '✅ ALLOWED' : '❌ BLOCKED'}`);
    if (!updateValidation.isValid) {
      console.log('❌ ERROR: Should allow updating reward to keep same probability');
      console.log('Errors:', updateValidation.errors);
    } else {
      console.log('✅ CORRECT: Allowed to update reward with same probability');
    }
    
    // Test 6: Get probability analysis
    console.log('\n📋 Test 6: Probability analysis');
    
    const analysis = await getProbabilityAnalysis();
    console.log('📊 Probability Analysis:');
    console.log(`- Total rewards: ${analysis.globalSummary.totalRewards}`);
    console.log(`- Global total probability: ${analysis.globalSummary.totalProbability}%`);
    console.log(`- Issues found: ${analysis.issues.length}`);
    
    if (analysis.issues.length > 0) {
      console.log('\n⚠️  Issues detected:');
      analysis.issues.forEach(issue => {
        console.log(`  - ${issue.message}`);
      });
    }
    
    // Test 7: API endpoint simulation
    console.log('\n📋 Test 7: API endpoint behavior simulation');
    
    // Simulate the probability check endpoint
    const probabilityCheck = await SpinWheelReward.validateTotalProbability();
    console.log('🔍 Model validation result:');
    console.log(`- Is valid: ${probabilityCheck.isValid}`);
    console.log(`- Global total: ${probabilityCheck.globalTotalProbability}%`);
    console.log(`- Issues: ${probabilityCheck.issues.join('; ')}`);
    
    // Clean up test data
    await SpinWheelReward.deleteMany({ name: /^TEST_BUG_063/ });
    console.log('\n🧹 Cleaned up test data');
    
    console.log('\n🎯 BUG-063 Test Summary:');
    console.log('✅ Same probability across different tiers: Should be allowed');
    console.log('❌ Duplicate probability within same tier: Should be blocked');
    console.log('✅ Tier probability limits: Should enforce 100% per tier');
    console.log('✅ Update validation: Should exclude self from checks');
    console.log('✅ Analysis endpoint: Should provide detailed breakdown');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from database');
  }
}

// Run the test
if (require.main === module) {
  testBug063Scenarios();
}

module.exports = { testBug063Scenarios };