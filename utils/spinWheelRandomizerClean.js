/**
 * Fixed Spin Wheel Randomizer for BUG-065 (Clean Version)
 * 
 * ISSUE IDENTIFIED:
 * 1. Edge case bug: When random equals totalProbability, always falls back to last reward
 * 2. Systematic bias: Higher probability rewards are favored due to cumulative distribution logic
 * 3. Inconsistent behavior: Safety fallback creates unpredictable results
 * 
 * SOLUTION:
 * - Proper weighted random selection with correct boundary handling
 * - Eliminate edge case fallbacks that create bias
 * - Add comprehensive validation
 */

/**
 * Select a reward using proper weighted random distribution
 * @param {Array} eligibleRewards - Array of rewards with probability field
 * @returns {Object} Selected reward
 */
function selectRewardByProbability(eligibleRewards) {
  if (!eligibleRewards || eligibleRewards.length === 0) {
    throw new Error('No eligible rewards provided');
  }

  // Single reward - no randomization needed
  if (eligibleRewards.length === 1) {
    return eligibleRewards[0];
  }

  // Calculate total probability
  const totalProbability = eligibleRewards.reduce(
    (sum, reward) => sum + (reward.probability || 0),
    0
  );

  // Handle zero or negative total probability - equal distribution
  if (totalProbability <= 0) {
    const randomIndex = Math.floor(Math.random() * eligibleRewards.length);
    return eligibleRewards[randomIndex];
  }

  // FIXED ALGORITHM: Proper weighted random selection
  // Generate random number in range [0, totalProbability)
  const random = Math.random() * totalProbability;

  let cumulative = 0;
  
  for (let i = 0; i < eligibleRewards.length; i++) {
    const reward = eligibleRewards[i];
    const probability = reward.probability || 0;
    
    // Add current reward's probability to cumulative sum
    cumulative += probability;
    
    // FIXED: Use <= to include the upper bound properly
    // This ensures that when random equals cumulative, the reward is selected
    if (random <= cumulative) {
      return reward;
    }
  }

  // This should NEVER happen with correct logic
  // If it does, it indicates a serious bug in the algorithm
  console.error('❌ CRITICAL ERROR: No reward selected in probability distribution');
  console.error(`   Random: ${random}, Total: ${totalProbability}, Cumulative: ${cumulative}`);
  console.error('   Rewards:', eligibleRewards.map(r => `${r.name}:${r.probability}%`));
  
  // Emergency fallback - select first reward and log the error
  const fallback = eligibleRewards[0];
  console.error(`🚨 Emergency fallback to: ${fallback.name}`);
  return fallback;
}

/**
 * Validate reward probabilities for consistency
 * @param {Array} rewards - Array of rewards to validate
 * @returns {Object} Validation result
 */
function validateRewardProbabilities(rewards) {
  const validation = {
    isValid: true,
    warnings: [],
    errors: [],
    totalProbability: 0,
    rewardCount: rewards.length
  };

  if (!rewards || rewards.length === 0) {
    validation.errors.push('No rewards provided');
    validation.isValid = false;
    return validation;
  }

  // Calculate total probability and check for issues
  let totalProbability = 0;
  const probabilityMap = new Map();

  rewards.forEach((reward, index) => {
    const prob = reward.probability || 0;
    totalProbability += prob;

    // Check for negative probabilities
    if (prob < 0) {
      validation.errors.push(`Reward "${reward.name}" has negative probability: ${prob}%`);
      validation.isValid = false;
    }

    // Check for duplicate probabilities (potential configuration issue)
    if (probabilityMap.has(prob) && prob > 0) {
      validation.warnings.push(`Duplicate probability ${prob}% found in rewards "${probabilityMap.get(prob)}" and "${reward.name}"`);
    } else if (prob > 0) {
      probabilityMap.set(prob, reward.name);
    }

    // Check for missing probability
    if (prob === 0) {
      validation.warnings.push(`Reward "${reward.name}" has 0% probability`);
    }
  });

  validation.totalProbability = totalProbability;

  // Check total probability
  if (totalProbability === 0) {
    validation.warnings.push('Total probability is 0% - will use equal distribution');
  } else if (totalProbability > 100) {
    validation.warnings.push(`Total probability exceeds 100%: ${totalProbability}%`);
  } else if (totalProbability < 50) {
    validation.warnings.push(`Total probability is low: ${totalProbability}%`);
  }

  return validation;
}

/**
 * Test the randomization logic with a given set of rewards
 * @param {Array} rewards - Rewards to test
 * @param {number} iterations - Number of test iterations
 * @returns {Object} Test results
 */
function testRandomization(rewards, iterations = 10000) {
  const validation = validateRewardProbabilities(rewards);
  if (!validation.isValid) {
    return { success: false, errors: validation.errors };
  }

  const results = {};
  const startTime = Date.now();

  // Run test iterations
  for (let i = 0; i < iterations; i++) {
    try {
      const selected = selectRewardByProbability(rewards);
      results[selected.name] = (results[selected.name] || 0) + 1;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  const duration = Date.now() - startTime;
  
  // Analyze results
  const analysis = {
    totalIterations: iterations,
    duration: `${duration}ms`,
    results: {},
    deviations: {},
    maxDeviation: 0,
    success: true
  };

  const totalProbability = validation.totalProbability;

  rewards.forEach(reward => {
    const actualCount = results[reward.name] || 0;
    const actualPercentage = (actualCount / iterations) * 100;
    const expectedPercentage = totalProbability > 0 
      ? (reward.probability / totalProbability) * 100 
      : (100 / rewards.length); // Equal distribution for zero total
    
    const deviation = Math.abs(actualPercentage - expectedPercentage);
    
    analysis.results[reward.name] = {
      count: actualCount,
      actualPercentage: parseFloat(actualPercentage.toFixed(2)),
      expectedPercentage: parseFloat(expectedPercentage.toFixed(2)),
      deviation: parseFloat(deviation.toFixed(2))
    };

    analysis.deviations[reward.name] = deviation;
    analysis.maxDeviation = Math.max(analysis.maxDeviation, deviation);
  });

  // Determine if test passed (deviation should be < 2% for large sample sizes)
  const maxAcceptableDeviation = iterations >= 10000 ? 2.0 : 5.0;
  analysis.passed = analysis.maxDeviation < maxAcceptableDeviation;

  return analysis;
}

module.exports = {
  selectRewardByProbability,
  validateRewardProbabilities,
  testRandomization
};