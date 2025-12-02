const User = require("../models/User");
const mongoose = require("mongoose");

/**
 * Calculate retention metrics (D1, D7, D14, D30) for users
 * OPTIMIZED: Uses MongoDB aggregation pipeline instead of fetching all users
 * @param {Object} filters - Filter options (dateRange, gameId, source, age, gender)
 * @returns {Promise<Object>} Retention metrics
 */
async function calculateRetention(filters = {}) {
  try {
    const { startDate, endDate, gameId, source, age, gender } = filters;

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

    // Default date range: last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Add date filter
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        matchStage.createdAt.$gte = start;
      }
      if (endDate) {
        matchStage.createdAt.$lte = end;
      }
    }

    // Use aggregation pipeline for efficient calculation
    // If aggregation fails, fall back to JavaScript calculation
    const retentionDays = [1, 7, 14, 30];

    let aggregationResult = null;
    try {
      // Build aggregation pipeline
      const pipeline = [
        { $match: matchStage },
        {
          $project: {
            createdAt: 1,
            activeDates: { $ifNull: ["$dailyActivity.activeDates", []] },
          },
        },
        {
          $addFields: {
            retentionChecks: {
              $map: {
                input: retentionDays,
                as: "day",
                in: {
                  day: "$$day",
                  targetDate: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: {
                        $add: [
                          "$createdAt",
                          { $multiply: ["$$day", 24 * 60 * 60 * 1000] },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        {
          $addFields: {
            retentionResults: {
              $map: {
                input: "$retentionChecks",
                as: "check",
                in: {
                  day: "$$check.day",
                  retained: {
                    $cond: {
                      if: {
                        $and: [
                          { $ne: ["$activeDates", null] },
                          { $gt: [{ $size: "$activeDates" }, 0] },
                          { $in: ["$$check.targetDate", "$activeDates"] },
                        ],
                      },
                      then: 1,
                      else: 0,
                    },
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalCohort: { $sum: 1 },
            retention: { $push: "$retentionResults" },
          },
        },
        {
          $unwind: "$retention",
        },
        {
          $unwind: "$retention",
        },
        {
          $group: {
            _id: "$retention.day",
            totalCohort: { $first: "$totalCohort" },
            retained: { $sum: "$retention.retained" },
          },
        },
        {
          $group: {
            _id: null,
            totalCohort: { $first: "$totalCohort" },
            retention: {
              $push: {
                day: "$_id",
                retained: "$retained",
              },
            },
          },
        },
        {
          $project: {
            totalCohort: 1,
            d1: {
              $let: {
                vars: {
                  d1Data: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$retention",
                          as: "r",
                          cond: { $eq: ["$$r.day", 1] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$totalCohort", 0] },
                        { $ne: ["$$d1Data", null] },
                      ],
                    },
                    {
                      $multiply: [
                        { $divide: ["$$d1Data.retained", "$totalCohort"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
            d7: {
              $let: {
                vars: {
                  d7Data: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$retention",
                          as: "r",
                          cond: { $eq: ["$$r.day", 7] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$totalCohort", 0] },
                        { $ne: ["$$d7Data", null] },
                      ],
                    },
                    {
                      $multiply: [
                        { $divide: ["$$d7Data.retained", "$totalCohort"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
            d14: {
              $let: {
                vars: {
                  d14Data: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$retention",
                          as: "r",
                          cond: { $eq: ["$$r.day", 14] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$totalCohort", 0] },
                        { $ne: ["$$d14Data", null] },
                      ],
                    },
                    {
                      $multiply: [
                        { $divide: ["$$d14Data.retained", "$totalCohort"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
            d30: {
              $let: {
                vars: {
                  d30Data: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$retention",
                          as: "r",
                          cond: { $eq: ["$$r.day", 30] },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ["$totalCohort", 0] },
                        { $ne: ["$$d30Data", null] },
                      ],
                    },
                    {
                      $multiply: [
                        { $divide: ["$$d30Data.retained", "$totalCohort"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
        },
      ];

      const result = await User.aggregate(pipeline);

      if (result && result.length > 0 && result[0].totalCohort > 0) {
        aggregationResult = result[0];
      }
    } catch (error) {
      console.warn(
        "Retention aggregation failed, using JavaScript fallback:",
        error.message
      );
      // Fall through to JavaScript calculation
    }

    // If aggregation succeeded, use its results
    if (aggregationResult) {
      const totalCohort = aggregationResult.totalCohort;
      return {
        d1: parseFloat(aggregationResult.d1?.toFixed(2) || 0),
        d7: parseFloat(aggregationResult.d7?.toFixed(2) || 0),
        d14: parseFloat(aggregationResult.d14?.toFixed(2) || 0),
        d30: parseFloat(aggregationResult.d30?.toFixed(2) || 0),
        totalCohort: totalCohort,
        data: [
          {
            day: 1,
            retentionRate: parseFloat(aggregationResult.d1?.toFixed(2) || 0),
          },
          {
            day: 7,
            retentionRate: parseFloat(aggregationResult.d7?.toFixed(2) || 0),
          },
          {
            day: 14,
            retentionRate: parseFloat(aggregationResult.d14?.toFixed(2) || 0),
          },
          {
            day: 30,
            retentionRate: parseFloat(aggregationResult.d30?.toFixed(2) || 0),
          },
        ],
      };
    }

    // Fallback to optimized JavaScript calculation
    const users = await User.find(matchStage)
      .select("_id createdAt dailyActivity.activeDates")
      .lean()
      .limit(10000); // Limit to prevent memory issues

    const cohortUsers = users.filter((user) => {
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
        data: [],
      };
    }

    // Calculate retention for each day (optimized with early exit)
    const retentionData = [];

    for (const day of retentionDays) {
      let retained = 0;
      for (const user of cohortUsers) {
        if (!user.dailyActivity?.activeDates || !user.createdAt) continue;

        const userCreatedAt = new Date(user.createdAt);
        const targetDate = new Date(userCreatedAt);
        targetDate.setDate(targetDate.getDate() + day);

        const targetDateStr = formatDateString(targetDate);
        if (user.dailyActivity.activeDates.includes(targetDateStr)) {
          retained++;
        }
      }

      const retentionRate =
        cohortUsers.length > 0
          ? ((retained / cohortUsers.length) * 100).toFixed(2)
          : 0;

      retentionData.push({
        day: day,
        retained: retained,
        retentionRate: parseFloat(retentionRate),
      });
    }

    return {
      d1: retentionData.find((d) => d.day === 1)?.retentionRate || 0,
      d7: retentionData.find((d) => d.day === 7)?.retentionRate || 0,
      d14: retentionData.find((d) => d.day === 14)?.retentionRate || 0,
      d30: retentionData.find((d) => d.day === 30)?.retentionRate || 0,
      totalCohort: cohortUsers.length,
      data: retentionData,
    };
  } catch (error) {
    console.error("Error calculating retention:", error);
    throw error;
  }
}

/**
 * Get retention trend over time (for line chart)
 * OPTIMIZED: Uses aggregation pipeline with grouping
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of retention data points over time
 */
async function getRetentionTrend(filters = {}) {
  try {
    const { startDate, endDate, gameId, source, age, gender } = filters;

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Build user query match stage
    const matchStage = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    // Source filter
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

    // Use aggregation to group by cohort date and calculate retention
    const retentionDays = [1, 7, 14, 30];

    const users = await User.find(matchStage)
      .select("_id createdAt dailyActivity.activeDates")
      .lean()
      .limit(10000); // Limit to prevent memory issues

    // Group users by registration date (cohort) - optimized
    const cohorts = {};
    users.forEach((user) => {
      if (!user.createdAt) return;
      const cohortDate = formatDateString(new Date(user.createdAt));
      if (!cohorts[cohortDate]) {
        cohorts[cohortDate] = [];
      }
      cohorts[cohortDate].push(user);
    });

    // Calculate retention for each cohort (optimized)
    const trendData = [];

    for (const cohortDate of Object.keys(cohorts).sort()) {
      const cohortUsers = cohorts[cohortDate];
      const retention = {};

      for (const day of retentionDays) {
        let retained = 0;
        for (const user of cohortUsers) {
          if (!user.dailyActivity?.activeDates || !user.createdAt) continue;

          const userCreatedAt = new Date(user.createdAt);
          const targetDate = new Date(userCreatedAt);
          targetDate.setDate(targetDate.getDate() + day);

          const targetDateStr = formatDateString(targetDate);
          if (user.dailyActivity.activeDates.includes(targetDateStr)) {
            retained++;
          }
        }

        retention[`d${day}`] =
          cohortUsers.length > 0
            ? parseFloat(((retained / cohortUsers.length) * 100).toFixed(2))
            : 0;
      }

      trendData.push({
        date: cohortDate,
        cohortSize: cohortUsers.length,
        ...retention,
      });
    }

    return trendData;
  } catch (error) {
    console.error("Error getting retention trend:", error);
    throw error;
  }
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

module.exports = {
  calculateRetention,
  getRetentionTrend,
  formatDateString,
};
