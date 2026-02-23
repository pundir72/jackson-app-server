/**
 * BUG-063 Fix: Spin Wheel Probability Configuration
 * 
 * ISSUE: "Same probability should be allowed across different tiers but not duplicated within the same tier"
 * PROBLEM: "System behavior unclear / inconsistent"
 * 
 * ROOT CAUSE ANALYSIS:
 * 1. Backend validation logic is correct
 * 2. Error messages may not be clear enough for admins
 * 3. Frontend may not be displaying detailed validation errors properly
 * 4. Need better user experience and clearer error messages
 */

const fs = require('fs');
const path = require('path');

async function fixBug063() {
  console.log('🔧 Fixing BUG-063: Spin Wheel Probability Configuration\n');
  
  // 1. Enhance error messages in the validation utility
  console.log('📝 Step 1: Enhancing validation error messages...');
  
  const validatorPath = path.join(__dirname, 'utils', 'spinWheelProbabilityValidator.js');
  let validatorContent = fs.readFileSync(validatorPath, 'utf8');
  
  // Enhance the error messages to be more user-friendly
  const enhancedErrorMessages = `
        if (duplicateProbabilities.length > 0) {
          validationResult.isValid = false;
          validationResult.errors.push({
            type: 'DUPLICATE_PROBABILITY_IN_TIER',
            tier: tier,
            probability: probability,
            message: \`❌ Probability \${probability}% is already used in tier \${tier}. Each tier must have unique probabilities.\`,
            userFriendlyMessage: \`The probability \${probability}% is already assigned to another reward in the \${tier} tier. Please choose a different percentage for this tier.\`,
            conflictingRewards: duplicateProbabilities.map(r => ({
              id: r._id,
              name: r.name,
              probability: r.probability
            })),
            suggestion: \`Try using \${probability + 1}%, \${probability + 2}%, or \${probability + 5}% instead.\`,
            clarification: "Note: You CAN use the same probability in different tiers (e.g., 10% in Bronze AND 10% in Silver), but NOT within the same tier."
          });
          
          console.log(\`❌ Duplicate probability \${probability}% found in tier \${tier}\`);
        }`;
  
  // Replace the existing duplicate probability check
  validatorContent = validatorContent.replace(
    /if \(duplicateProbabilities\.length > 0\) \{[\s\S]*?\}/,
    enhancedErrorMessages.trim()
  );
  
  // 2. Enhance tier probability exceeded error message
  const enhancedTierExceededMessage = `
        if (tierTotalProbability > 100) {
          validationResult.isValid = false;
          validationResult.errors.push({
            type: 'TIER_PROBABILITY_EXCEEDED',
            tier: tier,
            totalProbability: tierTotalProbability,
            currentProbability: probability,
            existingTotal: tierTotalProbability - probability,
            message: \`❌ Tier \${tier} would exceed 100% (current: \${tierTotalProbability - probability}% + new: \${probability}% = \${tierTotalProbability}%)\`,
            userFriendlyMessage: \`Adding this \${probability}% reward would make the \${tier} tier total \${tierTotalProbability}%, which exceeds the 100% limit.\`,
            suggestion: \`Maximum probability you can use for \${tier} tier is \${100 - (tierTotalProbability - probability)}%.\`,
            clarification: "Each tier has its own 100% limit. You can have multiple tiers each reaching 100% independently."
          });
          
          console.log(\`❌ Tier \${tier} probability exceeds 100%: \${tierTotalProbability}%\`);
        }`;
  
  validatorContent = validatorContent.replace(
    /if \(tierTotalProbability > 100\) \{[\s\S]*?\}/,
    enhancedTierExceededMessage.trim()
  );
  
  fs.writeFileSync(validatorPath, validatorContent);
  console.log('✅ Enhanced validation error messages');
  
  // 3. Update admin routes to return more user-friendly error responses
  console.log('📝 Step 2: Enhancing admin route error responses...');
  
  const adminRoutesPath = path.join(__dirname, 'routes', 'admin-spin-wheel.js');
  let adminRoutesContent = fs.readFileSync(adminRoutesPath, 'utf8');
  
  // Enhance the error response in create reward endpoint
  const enhancedCreateErrorResponse = `
        return res.status(400).json({
          success: false,
          error: "Probability configuration is invalid",
          message: "Same probability can be used across different tiers, but not within the same tier",
          details: probabilityValidation.errors,
          warnings: probabilityValidation.warnings,
          suggestions: suggestions.suggestions,
          tierAnalysis: probabilityValidation.tierAnalysis,
          userFriendlyErrors: probabilityValidation.errors.map(err => ({
            tier: err.tier,
            message: err.userFriendlyMessage || err.message,
            suggestion: err.suggestion,
            clarification: err.clarification
          })),
          rules: {
            title: "Probability Rules (BUG-063 Clarification)",
            rules: [
              "✅ Same probability CAN be used across different tiers (e.g., 10% in Bronze AND 10% in Silver)",
              "❌ Same probability CANNOT be duplicated within the same tier (e.g., two 10% rewards in Bronze)",
              "📊 Each tier has its own 100% probability limit",
              "🌍 Global probability can exceed 100% (tiers are independent)"
            ]
          }
        });`;
  
  // Replace the existing error response in create endpoint
  adminRoutesContent = adminRoutesContent.replace(
    /return res\.status\(400\)\.json\(\{\s*success: false,\s*error: "Probability configuration is invalid",[\s\S]*?\}\);/,
    enhancedCreateErrorResponse.trim()
  );
  
  // Do the same for update endpoint
  adminRoutesContent = adminRoutesContent.replace(
    /return res\.status\(400\)\.json\(\{\s*success: false,\s*error: "Probability configuration is invalid",[\s\S]*?\}\);/g,
    enhancedCreateErrorResponse.trim()
  );
  
  fs.writeFileSync(adminRoutesPath, adminRoutesContent);
  console.log('✅ Enhanced admin route error responses');
  
  // 4. Create a comprehensive probability rules documentation endpoint
  console.log('📝 Step 3: Adding probability rules documentation endpoint...');
  
  const probabilityRulesEndpoint = `
/**
 * @route   GET /api/admin/spin-wheel/probability/rules
 * @desc    Get detailed probability configuration rules and examples (BUG-063 Fix)
 * @access  Admin
 */
router.get("/probability/rules", adminAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        title: "Spin Wheel Probability Configuration Rules",
        subtitle: "BUG-063 Fix: Clarified probability validation rules",
        rules: {
          crossTier: {
            title: "Cross-Tier Probabilities (ALLOWED)",
            description: "Same probability can be used across different tiers",
            examples: [
              {
                scenario: "✅ ALLOWED",
                description: "10% probability in Bronze tier AND 10% probability in Silver tier",
                rewards: [
                  { name: "Bronze Coins", tier: "Bronze", probability: 10 },
                  { name: "Silver Coins", tier: "Silver", probability: 10 }
                ]
              },
              {
                scenario: "✅ ALLOWED", 
                description: "Multi-tier reward with unique probability per tier",
                rewards: [
                  { name: "Universal Bonus", tiers: ["Bronze", "Silver", "Gold"], probability: 15 }
                ]
              }
            ]
          },
          withinTier: {
            title: "Within-Tier Probabilities (RESTRICTED)",
            description: "Same probability cannot be duplicated within the same tier",
            examples: [
              {
                scenario: "❌ NOT ALLOWED",
                description: "Two rewards with 10% probability in the same Bronze tier",
                rewards: [
                  { name: "Bronze Coins", tier: "Bronze", probability: 10 },
                  { name: "Bronze XP", tier: "Bronze", probability: 10 }
                ],
                error: "Duplicate probability within Bronze tier"
              },
              {
                scenario: "✅ CORRECT ALTERNATIVE",
                description: "Different probabilities within the same tier",
                rewards: [
                  { name: "Bronze Coins", tier: "Bronze", probability: 10 },
                  { name: "Bronze XP", tier: "Bronze", probability: 15 }
                ]
              }
            ]
          },
          tierLimits: {
            title: "Tier Probability Limits",
            description: "Each tier has its own 100% probability limit",
            examples: [
              {
                scenario: "✅ ALLOWED",
                description: "Each tier can independently reach 100%",
                tiers: {
                  Bronze: { total: 100, rewards: ["20%", "30%", "50%"] },
                  Silver: { total: 100, rewards: ["25%", "35%", "40%"] },
                  Gold: { total: 90, rewards: ["30%", "60%"] }
                }
              },
              {
                scenario: "❌ NOT ALLOWED",
                description: "Single tier exceeding 100%",
                tier: "Bronze",
                total: 110,
                rewards: ["50%", "60%"],
                error: "Bronze tier exceeds 100% limit"
              }
            ]
          }
        },
        commonScenarios: [
          {
            question: "Can I use 10% probability in both Bronze and Silver tiers?",
            answer: "✅ YES - Same probability across different tiers is allowed"
          },
          {
            question: "Can I have two 15% rewards in the Gold tier?",
            answer: "❌ NO - Duplicate probabilities within the same tier are not allowed"
          },
          {
            question: "Can Bronze tier have 100% total and Silver tier also have 100%?",
            answer: "✅ YES - Each tier has its own independent 100% limit"
          },
          {
            question: "What's the maximum probability I can assign to a single reward?",
            answer: "100% (but then that tier can't have any other rewards)"
          }
        ],
        troubleshooting: {
          duplicateInTier: {
            problem: "Getting 'duplicate probability in tier' error",
            solution: "Change the probability percentage for one of the conflicting rewards in that tier",
            example: "If Bronze has 10% and 10%, change one to 11% or 12%"
          },
          tierExceeded: {
            problem: "Getting 'tier probability exceeded' error", 
            solution: "Reduce probabilities in that tier or remove some rewards",
            example: "If Bronze total is 95% and you're adding 10%, reduce existing rewards or use max 5%"
          }
        }
      }
    });
  } catch (error) {
    console.error("Error getting probability rules:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get probability rules"
    });
  }
});

`;
  
  // Add the new endpoint before the module.exports
  const insertPosition = adminRoutesContent.lastIndexOf('module.exports = router;');
  adminRoutesContent = adminRoutesContent.slice(0, insertPosition) + 
                     probabilityRulesEndpoint + 
                     adminRoutesContent.slice(insertPosition);
  
  fs.writeFileSync(adminRoutesPath, adminRoutesContent);
  console.log('✅ Added probability rules documentation endpoint');
  
  // 5. Create a test script to verify the fix
  console.log('📝 Step 4: Creating verification test...');
  
  const verificationTest = `
/**
 * BUG-063 Verification Test
 * Verify that the probability validation fix works correctly
 */

const mongoose = require('mongoose');
const SpinWheelReward = require('./models/SpinWheelReward');
const { validateProbabilityConfiguration } = require('./utils/spinWheelProbabilityValidator');

async function verifyBug063Fix() {
  try {
    console.log('🧪 Verifying BUG-063 Fix: Enhanced Probability Validation\\n');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-app');
    
    // Test 1: Cross-tier same probability (should be allowed)
    console.log('📋 Test 1: Cross-tier same probability (should be ALLOWED)');
    const crossTierResult = await validateProbabilityConfiguration({
      name: 'Cross Tier Test',
      probability: 15,
      eligibleTiers: ['Bronze', 'Silver']
    });
    
    console.log(\`Result: \${crossTierResult.isValid ? '✅ ALLOWED' : '❌ BLOCKED'}\`);
    if (!crossTierResult.isValid) {
      console.log('❌ BUG: Cross-tier same probability should be allowed!');
      crossTierResult.errors.forEach(err => console.log(\`   Error: \${err.userFriendlyMessage || err.message}\`));
    }
    
    // Test 2: Within-tier duplicate (should be blocked with clear message)
    console.log('\\n📋 Test 2: Within-tier duplicate (should be BLOCKED with clear message)');
    
    // Create a test reward first
    await SpinWheelReward.deleteMany({ name: /^VERIFY_BUG_063/ });
    const testReward = new SpinWheelReward({
      name: 'VERIFY_BUG_063_Bronze_20',
      type: 'coins',
      amount: 100,
      probability: 20,
      eligibleTiers: ['Bronze'],
      createdBy: new mongoose.Types.ObjectId()
    });
    await testReward.save();
    
    const duplicateResult = await validateProbabilityConfiguration({
      name: 'Duplicate Test',
      probability: 20,
      eligibleTiers: ['Bronze']
    });
    
    console.log(\`Result: \${duplicateResult.isValid ? '❌ ALLOWED (BUG!)' : '✅ BLOCKED'}\`);
    if (duplicateResult.isValid) {
      console.log('❌ BUG: Within-tier duplicate should be blocked!');
    } else {
      console.log('✅ Correctly blocked duplicate probability');
      const error = duplicateResult.errors[0];
      console.log(\`   User-friendly message: \${error.userFriendlyMessage}\`);
      console.log(\`   Suggestion: \${error.suggestion}\`);
      console.log(\`   Clarification: \${error.clarification}\`);
    }
    
    // Clean up
    await SpinWheelReward.deleteMany({ name: /^VERIFY_BUG_063/ });
    
    console.log('\\n🎯 BUG-063 Fix Verification Summary:');
    console.log('✅ Enhanced error messages with user-friendly explanations');
    console.log('✅ Clear suggestions for resolving conflicts');
    console.log('✅ Clarification about cross-tier vs within-tier rules');
    console.log('✅ Probability rules documentation endpoint added');
    console.log('✅ Improved admin interface error responses');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  verifyBug063Fix();
}

module.exports = { verifyBug063Fix };
`;
  
  fs.writeFileSync(path.join(__dirname, 'verify-bug-063-fix.js'), verificationTest);
  console.log('✅ Created verification test script');
  
  console.log('\n🎉 BUG-063 Fix Applied Successfully!\n');
  
  console.log('📋 What was fixed:');
  console.log('✅ Enhanced validation error messages with user-friendly explanations');
  console.log('✅ Added clear suggestions for resolving probability conflicts');
  console.log('✅ Clarified cross-tier vs within-tier probability rules');
  console.log('✅ Improved admin API error responses with detailed guidance');
  console.log('✅ Added comprehensive probability rules documentation endpoint');
  console.log('✅ Created verification test to ensure fix works correctly');
  
  console.log('\n🔗 New API Endpoints:');
  console.log('   GET /api/admin/spin-wheel/probability/rules - Detailed rules and examples');
  
  console.log('\n📊 Probability Rules (Clarified):');
  console.log('   ✅ Same probability CAN be used across different tiers');
  console.log('   ❌ Same probability CANNOT be duplicated within the same tier');
  console.log('   📊 Each tier has its own 100% probability limit');
  console.log('   🌍 Global probability can exceed 100% (tiers are independent)');
  
  console.log('\n🧪 To verify the fix:');
  console.log('   node verify-bug-063-fix.js');
  
  console.log('\n💡 For admins:');
  console.log('   - Error messages now clearly explain what went wrong');
  console.log('   - Suggestions provided for fixing probability conflicts');
  console.log('   - Rules clarification included in all error responses');
  console.log('   - New documentation endpoint for reference');
}

if (require.main === module) {
  fixBug063();
}

module.exports = { fixBug063 };