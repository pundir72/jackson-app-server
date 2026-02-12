/**
 * FIXED Retention Calculator for BUG-041
 * 
 * RETENTION DEFINITION:
 * - D1 Retention: % of users who were active 1 day after registration
 * - D7 Retention: % of users who were active 7 days after registration  
 * - D14 Retention: % of users who were active 14 days after registration
 * - D30 Retention: % of users who were active 30 days after registration
 * 
 * COHORT DEFINITION:
 * - Users are grouped by their registration date (createdAt)
 * - Only users with sufficient "age" are included (e.g., for D30, user must be at least 30 days old)
 * 
 * ACTIVITY DEFINITION:
 * - A user is "active" on a day if that date appears in their dailyActivity.activeDates array
 * - Activity tracking is handled by the global activity middleware
 */

const User = require("../models/User");
const mongoose = require("mongoose");

/**
 * Calculate retention metrics with clear, understandable logic
 * @param {Object} filters - Filter options (dateRange, gameId, source, age, gender)
 * @returns {Promise<Object>} Retention metrics with detailed breakdown
 */
async function calculateRetention(filters = {}) {
  try {
    console.log('🔍 Calculating retention metrics with filters:', filters);
    
    const { startDate, endDate, gameId, source, age, gender } = filters;
    const today = new Date();
    
    // Build user query match stage
    const matchStage = {};

    // Source filter - based on social.provider field
    if (source) {
      if (source === "direct") {
        matchStage["social.provider"] = { $nin: ["google", "facebook"] };
      } else {
        matchStage["social.provider"] = source;
      }
    }

    if (age) {
      matchStage["onboarding.ageRange"] = age;
    }
    if (gender) {
      matchStage["onboarding.gender"] = gender.toLowerCase();
    }

    // Date filter for cohort selection
    let start = startDate && startDate.trim() !== '' ? new Date(startDate) : undefined;
    let end = endDate && endDate.trim() !== '' ? new Date(endDate) : undefined;

    if (start || end) {
      matchStage.createdAt = {};
      if (start) {
        matchStage.createdAt.$gte = start;
      }
      if (end) {
        matchStage.createdAt.$lte = end;
      }
    }

    console.log('📊 User match stage:', JSON.stringify(matchStage, null, 2));

    // Define retention periods
    const retentionPeriods = [
      { name: 'd1', days: 1, label: 'Day 1' },
      { name: 'd7', days: 7, label: 'Day 7' },
      { name: 'd14', days: 14, label: 'Day 14' },
      { name: 'd30', days: 30, label: 'Day 30' }
    ];

    // Calculate retention for each period
    const retentionResults = {};
    const detailedData = [];
    let totalEligibleUsers = 0;

    for (const period of retentionPeriods) {
      console.log(`📈 Calculating ${period.label} retention...`);
      
      // Only include users who registered at least N days ago
      const cutoffDate = new Date(today);
      cutoffDate.setDate(cutoffDate.getDate() - period.days);
      
      const periodMatchStage = {
        ...matchStage,
        createdAt: {
          ...matchStage.createdAt,
          $lte: cutoffDate // User must be at least N days old
        }
      };

      console.log(`📅 ${period.label} cutoff date: ${cutoffDate.toISOString()}`);

      // Get eligible users for this retention period
      const eligibleUsers = await User.find(periodMatchStage)
        .select('_id createdAt dailyActivity.activeDates')
        .lean();

      console.log(`👥 ${period.label} eligible users: ${eligibleUsers.length}`);

      if (eligibleUsers.length === 0) {
        retentionResults[period.name] = 0;
        detailedData.push({
          period: period.name,
          label: period.label,
          days: period.days,
          eligibleUsers: 0,
          retainedUsers: 0,
          retentionRate: 0,
          cutoffDate: cutoffDate.toISOString()
        });
        continue;
      }

      // Count retained users
      let retainedUsers = 0;
      const retainedUserDetails = [];

      for (const user of eligibleUsers) {
        if (!user.createdAt || !user.dailyActivity?.activeDates) {
          continue;
        }

        // Calculate the target date (registration date + N days)
        const registrationDate = new Date(user.createdAt);
        const targetDate = new Date(registrationDate);
        targetDate.setDate(targetDate.getDate() + period.days);
        
        const targetDateStr = formatDateString(targetDate);
        
        // Check if user was active on the target date
        if (user.dailyActivity.activeDates.includes(targetDateStr)) {
          retainedUsers++;
          retainedUserDetails.push({
            userId: user._id,
            registrationDate: registrationDate.toISOString(),
            targetDate: targetDateStr,
            wasActive: true
          });
        }
      }

      const retentionRate = eligibleUsers.length > 0 
        ? (retainedUsers / eligibleUsers.length) * 100 
        : 0;

      retentionResults[period.name] = parseFloat(retentionRate.toFixed(2));
      
      detailedData.push({
        period: period.name,
        label: period.label,
        days: period.days,
        eligibleUsers: eligibleUsers.length,
        retainedUsers: retainedUsers,
        retentionRate: parseFloat(retentionRate.toFixed(2)),
        cutoffDate: cutoffDate.toISOString(),
        sampleRetainedUsers: retainedUserDetails.slice(0, 5) // First 5 for debugging
      });

      console.log(`✅ ${period.label}: ${retainedUsers}/${eligibleUsers.length} = ${retentionRate.toFixed(2)}%`);
      
      // Use D1 cohort size as total for consistency
      if (period.name === 'd1') {
        totalEligibleUsers = eligibleUsers.length;
      }
    }

    const result = {
      ...retentionResults,
      totalCohort: totalEligibleUsers,
      data: detailedData,
      calculatedAt: new Date().toISOString(),
      methodology: {
        definition: "Retention = % of users active on day N after registration",
        cohortCriteria: "Users registered at least N days ago",
        activityCriteria: "User has entry in dailyActivity.activeDates for target date",
        dateFormat: "YYYY-MM-DD"
      }
    };

    console.log('🎯 Final retention results:', {
      d1: result.d1,
      d7: result.d7,
      d14: result.d14,
      d30: result.d30,
      totalCohort: result.totalCohort
    });

    return result;
  } catch (error) {
    console.error("❌ Error calculating retention:", error);
    throw error;
  }
}

/**
 * Get retention trend over time with clear cohort analysis
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of retention data points over time
 */
async function getRetentionTrend(filters = {}) {
  try {
    console.log('📈 Calculating retention trend with filters:', filters);
    
    const { startDate, endDate, gameId, source, age, gender } = filters;
    const today = new Date();

    // Build user query match stage
    const matchStage = {};

    if (source) {
      if (source === "direct") {
        matchStage["social.provider"] = { $nin: ["google", "facebook"] };
      } else {
        matchStage["social.provider"] = source;
      }
    }

    if (gender) {
      matchStage["onboarding.gender"] = gender.toLowerCase();
    }

    if (age) {
      matchStage["onboarding.ageRange"] = age;
    }

    // Date filter for trend analysis
    let start = startDate && startDate.trim() !== '' ? new Date(startDate) : undefined;
    let end = endDate && endDate.trim() !== '' ? new Date(endDate) : undefined;

    // Default to last 30 days if no date range provided
    if (!start && !end) {
      end = new Date(today);
      start = new Date(today);
      start.setDate(start.getDate() - 30);
    }

    if (start || end) {
      matchStage.createdAt = {};
      if (start) {
        matchStage.createdAt.$gte = start;
      }
      if (end) {
        matchStage.createdAt.$lte = end;
      }
    }

    console.log('📊 Trend match stage:', JSON.stringify(matchStage, null, 2));

    // Get users and group by registration date
    const users = await User.find(matchStage)
      .select("_id createdAt dailyActivity.activeDates")
      .lean();

    console.log(`👥 Total users for trend analysis: ${users.length}`);

    // Group users by registration date (cohort)
    const cohorts = {};
    users.forEach((user) => {
      if (!user.createdAt) return;
      const cohortDate = formatDateString(new Date(user.createdAt));
      if (!cohorts[cohortDate]) {
        cohorts[cohortDate] = [];
      }
      cohorts[cohortDate].push(user);
    });

    console.log(`📅 Number of cohorts: ${Object.keys(cohorts).length}`);

    // Calculate retention for each cohort
    const trendData = [];
    const retentionPeriods = [1, 7, 14, 30];

    for (const cohortDate of Object.keys(cohorts).sort()) {
      const cohortUsers = cohorts[cohortDate];
      const cohortRegistrationDate = new Date(cohortDate);
      
      // Only calculate retention for cohorts that are old enough
      const daysSinceCohort = Math.floor((today - cohortRegistrationDate) / (1000 * 60 * 60 * 24));
      
      const retention = {
        date: cohortDate,
        cohortSize: cohortUsers.length,
        daysSinceCohort: daysSinceCohort
      };

      for (const days of retentionPeriods) {
        // Only calculate if cohort is old enough
        if (daysSinceCohort >= days) {
          let retainedUsers = 0;
          
          for (const user of cohortUsers) {
            if (!user.dailyActivity?.activeDates || !user.createdAt) continue;

            const userRegistrationDate = new Date(user.createdAt);
            const targetDate = new Date(userRegistrationDate);
            targetDate.setDate(targetDate.getDate() + days);

            const targetDateStr = formatDateString(targetDate);
            if (user.dailyActivity.activeDates.includes(targetDateStr)) {
              retainedUsers++;
            }
          }

          const retentionRate = cohortUsers.length > 0
            ? (retainedUsers / cohortUsers.length) * 100
            : 0;

          retention[`d${days}`] = parseFloat(retentionRate.toFixed(2));
          retention[`d${days}_count`] = retainedUsers;
        } else {
          retention[`d${days}`] = null; // Not enough time has passed
          retention[`d${days}_count`] = null;
        }
      }

      trendData.push(retention);
    }

    console.log(`📈 Generated trend data for ${trendData.length} cohorts`);

    return trendData;
  } catch (error) {
    console.error("❌ Error getting retention trend:", error);
    throw error;
  }
}

/**
 * Get retention insights and recommendations
 * @param {Object} retentionData - Retention data from calculateRetention
 * @returns {Object} Insights and recommendations
 */
function getRetentionInsights(retentionData) {
  const insights = {
    summary: {},
    recommendations: [],
    benchmarks: {
      d1: { good: 40, excellent: 60 },
      d7: { good: 20, excellent: 35 },
      d14: { good: 15, excellent: 25 },
      d30: { good: 10, excellent: 20 }
    }
  };

  // Analyze each retention period
  ['d1', 'd7', 'd14', 'd30'].forEach(period => {
    const rate = retentionData[period] || 0;
    const benchmark = insights.benchmarks[period];
    
    let status = 'poor';
    if (rate >= benchmark.excellent) status = 'excellent';
    else if (rate >= benchmark.good) status = 'good';
    
    insights.summary[period] = {
      rate: rate,
      status: status,
      benchmark: benchmark
    };
  });

  // Generate recommendations
  if (retentionData.d1 < 30) {
    insights.recommendations.push({
      priority: 'high',
      area: 'onboarding',
      message: 'D1 retention is low. Focus on improving first-day user experience and onboarding flow.'
    });
  }

  if (retentionData.d7 < 15) {
    insights.recommendations.push({
      priority: 'medium',
      area: 'engagement',
      message: 'D7 retention needs improvement. Consider implementing engagement features like daily rewards or challenges.'
    });
  }

  if (retentionData.d30 < 8) {
    insights.recommendations.push({
      priority: 'medium',
      area: 'long-term',
      message: 'D30 retention is low. Focus on long-term engagement and content variety.'
    });
  }

  // Check for retention cliff (big drop between periods)
  const d1ToD7Drop = retentionData.d1 - retentionData.d7;
  if (d1ToD7Drop > 25) {
    insights.recommendations.push({
      priority: 'high',
      area: 'week1',
      message: `Large drop from D1 to D7 (${d1ToD7Drop.toFixed(1)}%). Focus on week 1 engagement.`
    });
  }

  return insights;
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validate retention data for consistency
 */
function validateRetentionData(retentionData) {
  const issues = [];
  
  // Check for impossible retention rates (should generally decrease over time)
  if (retentionData.d7 > retentionData.d1) {
    issues.push('D7 retention higher than D1 - possible data issue');
  }
  
  if (retentionData.d14 > retentionData.d7) {
    issues.push('D14 retention higher than D7 - possible data issue');
  }
  
  if (retentionData.d30 > retentionData.d14) {
    issues.push('D30 retention higher than D14 - possible data issue');
  }
  
  // Check for zero cohort
  if (retentionData.totalCohort === 0) {
    issues.push('No eligible users in cohort - check date filters');
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues
  };
}

module.exports = {
  calculateRetention,
  getRetentionTrend,
  getRetentionInsights,
  validateRetentionData,
  formatDateString,
};