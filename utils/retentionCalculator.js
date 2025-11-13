const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * Calculate retention metrics (D1, D7, D14, D30) for users
 * @param {Object} filters - Filter options (dateRange, gameId, source, age, gender)
 * @returns {Promise<Object>} Retention metrics
 */
async function calculateRetention(filters = {}) {
  try {
    const { startDate, endDate, gameId, source, age, gender } = filters;
    
    // Build user query
    const userQuery = {};
    
    // Source filter - based on social.provider field
    if (source) {
      if (source === 'direct') {
        // Direct users: all users who are NOT google AND NOT facebook
        // Simplest approach: use $nin which handles 'local', null, undefined, missing field
        userQuery['social.provider'] = { $nin: ['google', 'facebook'] };
      } else {
        // Filter by social.provider (google, facebook, etc.)
        userQuery['social.provider'] = source;
      }
    }
    
    if (age) {
      // Age range is stored in onboarding.ageRange
      userQuery['onboarding.ageRange'] = age;
    }
    if (gender) {
      // Gender is stored in onboarding.gender
      userQuery['onboarding.gender'] = gender.toLowerCase();
    }

    // Default date range: last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Add date filter to query
    if (startDate || endDate) {
      userQuery.createdAt = {};
      if (startDate) {
        userQuery.createdAt.$gte = start;
      }
      if (endDate) {
        userQuery.createdAt.$lte = end;
      }
    }

    // Get all users matching filters
    const users = await User.find(userQuery).select('_id createdAt dailyActivity').lean();
    
    // Filter users by registration date if date range is provided
    const cohortUsers = users.filter(user => {
      if (!user.createdAt) return false;
      const userCreatedAt = new Date(user.createdAt);
      return userCreatedAt >= start && userCreatedAt <= end;
    });

    if (cohortUsers.length === 0) {
      return {
        d1: 0,
        d7: 0,
        d14: 0,
        d30: 0,
        totalCohort: 0,
        data: []
      };
    }

    // Calculate retention for each day
    const retentionData = [];
    const retentionDays = [1, 7, 14, 30];
    
    for (const day of retentionDays) {
      const retained = cohortUsers.filter(user => {
        if (!user.dailyActivity || !user.dailyActivity.activeDates || !user.createdAt) {
          return false;
        }
        
        const userCreatedAt = new Date(user.createdAt);
        const targetDate = new Date(userCreatedAt);
        targetDate.setDate(targetDate.getDate() + day);
        
        const targetDateStr = formatDateString(targetDate);
        return user.dailyActivity.activeDates.includes(targetDateStr);
      }).length;
      
      const retentionRate = cohortUsers.length > 0 
        ? ((retained / cohortUsers.length) * 100).toFixed(2)
        : 0;
      
      retentionData.push({
        day: day,
        retained: retained,
        retentionRate: parseFloat(retentionRate)
      });
    }

    return {
      d1: retentionData.find(d => d.day === 1)?.retentionRate || 0,
      d7: retentionData.find(d => d.day === 7)?.retentionRate || 0,
      d14: retentionData.find(d => d.day === 14)?.retentionRate || 0,
      d30: retentionData.find(d => d.day === 30)?.retentionRate || 0,
      totalCohort: cohortUsers.length,
      data: retentionData
    };
  } catch (error) {
    console.error('Error calculating retention:', error);
    throw error;
  }
}

/**
 * Get retention trend over time (for line chart)
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of retention data points over time
 */
async function getRetentionTrend(filters = {}) {
  try {
    const { startDate, endDate, gameId, source, age, gender } = filters;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Build user query
    const userQuery = {};
    
    // Source filter - based on social.provider field
    if (source) {
      if (source === 'direct') {
        // Direct users: all users who are NOT google AND NOT facebook
        // Simplest approach: use $nin which handles 'local', null, undefined, missing field
        userQuery['social.provider'] = { $nin: ['google', 'facebook'] };
      } else {
        // Filter by social.provider (google, facebook, etc.)
        userQuery['social.provider'] = source;
      }
    }
    
    if (gender) {
      userQuery.gender = gender;
    }
    
    // Add date filter
    userQuery.createdAt = {};
    userQuery.createdAt.$gte = start;
    userQuery.createdAt.$lte = end;

    const users = await User.find(userQuery)
      .select('_id createdAt dailyActivity')
      .lean();

    // Group users by registration date (cohort)
    const cohorts = {};
    users.forEach(user => {
      const cohortDate = formatDateString(new Date(user.createdAt));
      if (!cohorts[cohortDate]) {
        cohorts[cohortDate] = [];
      }
      cohorts[cohortDate].push(user);
    });

    // Calculate retention for each cohort
    const trendData = [];
    const retentionDays = [1, 7, 14, 30];
    
    Object.keys(cohorts).sort().forEach(cohortDate => {
      const cohortUsers = cohorts[cohortDate];
      const retention = {};
      
      retentionDays.forEach(day => {
        const retained = cohortUsers.filter(user => {
          if (!user.dailyActivity || !user.dailyActivity.activeDates || !user.createdAt) {
            return false;
          }
          
          const userCreatedAt = new Date(user.createdAt);
          const targetDate = new Date(userCreatedAt);
          targetDate.setDate(targetDate.getDate() + day);
          
          const targetDateStr = formatDateString(targetDate);
          return user.dailyActivity.activeDates.includes(targetDateStr);
        }).length;
        
        retention[`d${day}`] = cohortUsers.length > 0 
          ? ((retained / cohortUsers.length) * 100).toFixed(2)
          : 0;
      });
      
      trendData.push({
        date: cohortDate,
        cohortSize: cohortUsers.length,
        ...retention
      });
    });

    return trendData;
  } catch (error) {
    console.error('Error getting retention trend:', error);
    throw error;
  }
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  calculateRetention,
  getRetentionTrend,
  formatDateString
};

