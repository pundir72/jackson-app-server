/**
 * Spin Wheel Probability Validator for BUG-063
 * 
 * PROBABILITY RULES (CLARIFIED):
 * 1. Same probability CAN be used across different tiers
 * 2. Same probability CANNOT be duplicated within the same tier
 * 3. Total probability per tier should not exceed 100%
 * 4. Global total probability should not exceed 100%
 * 
 * EXAMPLES:
 * ✅ ALLOWED:
 *   - Tier Bronze: Reward A (10%), Reward B (20%)
 *   - Tier Silver: Reward C (10%), Reward D (30%) // Same 10% as Bronze is OK
 * 
 * ❌ NOT ALLOWED:
 *   - Tier Bronze: Reward A (10%), Reward B (10%) // Duplicate 10% in same tier
 *   - Tier Silver: Reward C (60%), Reward D (50%) // Total 110% exceeds 100%
 */

const SpinWheelReward = require('../models/SpinWheelReward');

/**
 * Validate probability configuration for spin wheel rewards
 * @param {Object} rewardData - The reward data to validate
 * @param {string} excludeRewardId - ID of reward to exclude from validation (for updates)
 * @returns {Promise<Object>} Validation result
 */
async function validateProbabilityConfiguration(rewardData, excludeRewardId = null) {
  try {
    console.log('🔍 Validating probability configuration:', {
      rewardData: {
        name: rewardData.name,
        probability: rewardData.probability,
        eligibleTiers: rewardData.eligibleTiers
      },
      excludeRewardId
    });

    const { probability, eligibleTiers } = rewardData;
    
    // Get all active rewards except the one being updated
    const query = { isActive: true };
    if (excludeRewardId) {
      query._id = { $ne: excludeRewardId };
    }
    
    const existingRewards = await SpinWheelReward.find(query).lean();
    
    console.log(`📊 Found ${existingRewards.length} existing active rewards`);
    
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      tierAnalysis: {},
      globalAnalysis: {
        totalProbability: 0,
        rewardCount: existingRewards.length + 1
      }
    };

    // Analyze each tier that this reward will affect
    for (const tier of eligibleTiers) {
      console.log(`🎯 Analyzing tier: ${tier}`);
      
      // Get rewards that affect this tier
      const tierRewards = existingRewards.filter(reward => 
        reward.eligibleTiers.includes(tier)
      );
      
      console.log(`   Found ${tierRewards.length} existing rewards for tier ${tier}`);
      
      // Check for duplicate probabilities within the same tier
      const duplicateProbabilities = tierRewards.filter(reward => 
        reward.probability === probability
      );
      
      if (duplicateProbabilities.length > 0) {
        validationResult.isValid = false;
        validationResult.errors.push({
          type: 'DUPLICATE_PROBABILITY_IN_TIER',
          tier: tier,
          probability: probability,
          message: `Probability ${probability}% is already used by another reward in tier ${tier}`,
          userFriendlyMessage: `The probability ${probability}% is already assigned to another reward in the ${tier} tier. Please choose a different percentage for this tier.`,
          suggestion: `Try using ${probability + 1}%, ${probability + 2}%, or ${probability + 5}% instead.`,
          clarification: "Note: You CAN use the same probability in different tiers (e.g., 10% in Bronze AND 10% in Silver), but NOT within the same tier.",
          conflictingRewards: duplicateProbabilities.map(r => ({
            id: r._id,
            name: r.name,
            probability: r.probability
          }))
        });
        
        console.log(`❌ Duplicate probability ${probability}% found in tier ${tier}`);
      }
      
      // Calculate total probability for this tier
      const tierTotalProbability = tierRewards.reduce((sum, reward) => 
        sum + reward.probability, 0
      ) + probability;
      
      validationResult.tierAnalysis[tier] = {
        existingRewards: tierRewards.length,
        totalProbability: tierTotalProbability,
        newRewardProbability: probability,
        isValid: tierTotalProbability <= 100 && duplicateProbabilities.length === 0
      };
      
      console.log(`   Tier ${tier} total probability: ${tierTotalProbability}%`);
      
      // Check if tier total exceeds 100%
      if (tierTotalProbability > 100) {
        validationResult.isValid = false;
        validationResult.errors.push({
          type: 'TIER_PROBABILITY_EXCEEDED',
          tier: tier,
          totalProbability: tierTotalProbability,
          message: `Total probability for tier ${tier} would be ${tierTotalProbability}%, which exceeds 100%`,
          userFriendlyMessage: `Adding this ${probability}% reward would make the ${tier} tier total ${tierTotalProbability}%, which exceeds the 100% limit.`,
          suggestion: `Maximum probability you can use for ${tier} tier is ${100 - (tierTotalProbability - probability)}%.`,
          clarification: "Each tier has its own 100% limit. You can have multiple tiers each reaching 100% independently."
        });
        
        console.log(`❌ Tier ${tier} probability exceeds 100%: ${tierTotalProbability}%`);
      } else if (tierTotalProbability > 90) {
        validationResult.warnings.push({
          type: 'TIER_PROBABILITY_HIGH',
          tier: tier,
          totalProbability: tierTotalProbability,
          message: `Total probability for tier ${tier} is high (${tierTotalProbability}%). Consider leaving some room for future rewards.`
        });
        
        console.log(`⚠️  Tier ${tier} probability is high: ${tierTotalProbability}%`);
      }
    }
    
    // Calculate global probability (all active rewards) - for informational purposes only
    const globalTotalProbability = existingRewards.reduce((sum, reward) => 
      sum + reward.probability, 0
    ) + probability;
    
    validationResult.globalAnalysis.totalProbability = globalTotalProbability;
    
    console.log(`🌍 Global total probability: ${globalTotalProbability}%`);
    
    // NOTE: BUG-063 FIX - Removed global probability limit check
    // Each tier can independently reach 100%, so global total can exceed 100%
    // This is the correct behavior for multi-tier spin wheel systems
    
    console.log(`✅ Validation complete. Valid: ${validationResult.isValid}`);
    
    return validationResult;
    
  } catch (error) {
    console.error('❌ Error validating probability configuration:', error);
    return {
      isValid: false,
      errors: [{
        type: 'VALIDATION_ERROR',
        message: 'Failed to validate probability configuration',
        details: error.message
      }],
      warnings: [],
      tierAnalysis: {},
      globalAnalysis: {}
    };
  }
}

/**
 * Get probability analysis for all tiers
 * @returns {Promise<Object>} Complete probability analysis
 */
async function getProbabilityAnalysis() {
  try {
    console.log('📊 Generating complete probability analysis...');
    
    const activeRewards = await SpinWheelReward.find({ isActive: true }).lean();
    
    // Get all unique tiers
    const allTiers = [...new Set(
      activeRewards.flatMap(reward => reward.eligibleTiers)
    )].sort();
    
    console.log(`Found ${allTiers.length} unique tiers: ${allTiers.join(', ')}`);
    
    const analysis = {
      globalSummary: {
        totalRewards: activeRewards.length,
        totalProbability: activeRewards.reduce((sum, r) => sum + r.probability, 0),
        averageProbability: activeRewards.length > 0 
          ? (activeRewards.reduce((sum, r) => sum + r.probability, 0) / activeRewards.length).toFixed(2)
          : 0
      },
      tierAnalysis: {},
      probabilityDistribution: {},
      issues: []
    };
    
    // Analyze each tier
    for (const tier of allTiers) {
      const tierRewards = activeRewards.filter(reward => 
        reward.eligibleTiers.includes(tier)
      );
      
      const tierProbabilities = tierRewards.map(r => r.probability);
      const tierTotal = tierProbabilities.reduce((sum, p) => sum + p, 0);
      
      // Check for duplicates in this tier
      const duplicates = tierProbabilities.filter((prob, index, arr) => 
        arr.indexOf(prob) !== index
      );
      
      analysis.tierAnalysis[tier] = {
        rewardCount: tierRewards.length,
        totalProbability: tierTotal,
        averageProbability: tierRewards.length > 0 
          ? (tierTotal / tierRewards.length).toFixed(2) 
          : 0,
        probabilities: tierProbabilities.sort((a, b) => b - a),
        duplicateProbabilities: [...new Set(duplicates)],
        rewards: tierRewards.map(r => ({
          id: r._id,
          name: r.name,
          probability: r.probability,
          type: r.type
        }))
      };
      
      // Check for issues
      if (duplicates.length > 0) {
        analysis.issues.push({
          type: 'DUPLICATE_PROBABILITIES',
          tier: tier,
          duplicates: [...new Set(duplicates)],
          message: `Tier ${tier} has duplicate probabilities: ${[...new Set(duplicates)].join(', ')}%`
        });
      }
      
      if (tierTotal > 100) {
        analysis.issues.push({
          type: 'TIER_EXCEEDS_100',
          tier: tier,
          totalProbability: tierTotal,
          message: `Tier ${tier} total probability (${tierTotal}%) exceeds 100%`
        });
      }
    }
    
    // Analyze probability distribution
    const allProbabilities = activeRewards.map(r => r.probability);
    const probabilityGroups = {};
    
    allProbabilities.forEach(prob => {
      if (!probabilityGroups[prob]) {
        probabilityGroups[prob] = 0;
      }
      probabilityGroups[prob]++;
    });
    
    analysis.probabilityDistribution = Object.entries(probabilityGroups)
      .map(([prob, count]) => ({ probability: parseFloat(prob), count }))
      .sort((a, b) => b.probability - a.probability);
    
    console.log(`📈 Analysis complete. Found ${analysis.issues.length} issues`);
    
    return analysis;
    
  } catch (error) {
    console.error('❌ Error generating probability analysis:', error);
    throw error;
  }
}

/**
 * Fix probability conflicts by suggesting solutions
 * @param {Object} validationResult - Result from validateProbabilityConfiguration
 * @returns {Object} Suggested fixes
 */
function suggestProbabilityFixes(validationResult) {
  const suggestions = [];
  
  validationResult.errors.forEach(error => {
    switch (error.type) {
      case 'DUPLICATE_PROBABILITY_IN_TIER':
        suggestions.push({
          type: 'CHANGE_PROBABILITY',
          tier: error.tier,
          currentProbability: error.probability,
          suggestedProbabilities: generateAlternativeProbabilities(error.probability),
          message: `Change probability from ${error.probability}% to avoid conflict in tier ${error.tier}`
        });
        break;
        
      case 'TIER_PROBABILITY_EXCEEDED':
        suggestions.push({
          type: 'REDUCE_PROBABILITIES',
          tier: error.tier,
          currentTotal: error.totalProbability,
          excessAmount: error.totalProbability - 100,
          message: `Reduce probabilities in tier ${error.tier} by ${error.totalProbability - 100}% total`
        });
        break;
        
      // NOTE: BUG-063 FIX - Removed GLOBAL_PROBABILITY_EXCEEDED case
      // Global probability can exceed 100% since each tier is independent
    }
  });
  
  return {
    hasSuggestions: suggestions.length > 0,
    suggestions: suggestions
  };
}

/**
 * Generate alternative probability values
 * @param {number} originalProbability - The conflicting probability
 * @returns {Array} Array of suggested alternative probabilities
 */
function generateAlternativeProbabilities(originalProbability) {
  const alternatives = [];
  
  // Suggest nearby values
  const variations = [-5, -2, -1, 1, 2, 5];
  
  variations.forEach(variation => {
    const newProb = originalProbability + variation;
    if (newProb > 0 && newProb <= 100) {
      alternatives.push(newProb);
    }
  });
  
  // Add some common probability values
  const commonValues = [1, 2, 5, 10, 15, 20, 25, 30];
  commonValues.forEach(val => {
    if (val !== originalProbability && !alternatives.includes(val)) {
      alternatives.push(val);
    }
  });
  
  return alternatives.slice(0, 5); // Return top 5 suggestions
}

module.exports = {
  validateProbabilityConfiguration,
  getProbabilityAnalysis,
  suggestProbabilityFixes,
  generateAlternativeProbabilities
};