const { calculateSubscriptionCost, validatePricing } = require('./utils/pricing');

async function debugPricing() {
  console.log('🔍 Debugging VIP Pricing Validation...\n');
  
  const testCases = [
    { tierId: 'bronze', plan: 'weekly', region: 'US', userId: null, excludePending: false },
    { tierId: 'bronze', plan: 'monthly', region: 'US', userId: null, excludePending: false },
    { tierId: 'bronze', plan: 'yearly', region: 'US', userId: null, excludePending: false },
    { tierId: 'gold', plan: 'weekly', region: 'US', userId: null, excludePending: false },
    { tierId: 'gold', plan: 'monthly', region: 'US', userId: null, excludePending: false },
    { tierId: 'gold', plan: 'yearly', region: 'US', userId: null, excludePending: false },
    { tierId: 'platinum', plan: 'weekly', region: 'US', userId: null, excludePending: false },
    { tierId: 'platinum', plan: 'monthly', region: 'US', userId: null, excludePending: false },
    { tierId: 'platinum', plan: 'yearly', region: 'US', userId: null, excludePending: false }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n📊 Testing: ${testCase.tierId} ${testCase.plan} (${testCase.region})`);
      
      const cost = await calculateSubscriptionCost(
        testCase.tierId, 
        testCase.plan, 
        testCase.region, 
        testCase.userId,
        testCase.excludePending
      );
      
      console.log(`   💰 Cost: ${cost.formatted} (${cost.amount})`);
      console.log(`   🎯 Original: ${cost.originalAmount}`);
      console.log(`   💸 Discounted: ${cost.discountedAmount || cost.amount}`);
      console.log(`   🔥 Is Discounted: ${cost.isDiscounted}`);
      
      // Test validation with the calculated amount
      const isValid = await validatePricing(
        testCase.tierId,
        testCase.plan,
        cost.amount,
        testCase.region,
        testCase.userId,
        testCase.excludePending
      );
      
      console.log(`   ✅ Validation: ${isValid ? 'PASS' : 'FAIL'}`);
      
      // Test validation with a slightly different amount (should fail)
      const invalidAmount = cost.amount + 0.01;
      const isInvalid = await validatePricing(
        testCase.tierId,
        testCase.plan,
        invalidAmount,
        testCase.region,
        testCase.userId,
        testCase.excludePending
      );
      
      console.log(`   ❌ Invalid Test: ${isInvalid ? 'PASS (unexpected)' : 'FAIL (expected)'}`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n🎉 Pricing debug completed!');
}

// Run the debug function
debugPricing().catch(console.error);
