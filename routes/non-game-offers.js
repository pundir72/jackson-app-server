/**
 * Non-Game Offers Routes
 * Handles surveys, magic receipts, cashback, and shopping offers
 * @module routes/non-game-offers
 */

const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const bitlabsNonGames = require("../utils/bitlabs-non-games");
const everflowService = require("../services/everflow.service");
const config = require("../config/config");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");

// Helper function to calculate age from dateOfBirth or ageRange
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

// Helper function to get user age (from dateOfBirth or ageRange)
function getUserAge(user) {
  if (user.dateOfBirth) {
    const age = calculateAge(user.dateOfBirth);
    if (age !== null) return age;
  }
  // Fallback to ageRange if dateOfBirth is not available
  if (user.onboarding?.ageRange) {
    const ageRange = user.onboarding.ageRange;
    if (ageRange.includes("-")) {
      const [min, max] = ageRange.split("-").map(Number);
      return Math.floor((min + max) / 2); // Use midpoint as approximate age
    }
  }
  // Default fallback
  return 25;
}

// Helper function to get user gender (normalized to lowercase)
// Uses the same collection/field as admin users route: user.onboarding.gender
// Admin route shows gender from: user.onboarding.gender (stored as lowercase in DB)
function getUserGender(user) {
  // Gender is stored in onboarding.gender (same as admin users route)
  // Admin route displays it capitalized but stores it lowercase: "male", "female", "other"
  const gender = user.onboarding?.gender || "other";
  // Normalize to lowercase for consistent matching with offer targetAudience.gender
  return String(gender).toLowerCase();
}

// Helper function to get admin-configured offers with fresh URLs from Bitlabs
// INDUSTRIAL-LEVEL SOLUTION: Fetches fresh click URLs per user (same as surveys)
async function getAdminConfiguredOffers(
  offerType,
  userProfile,
  userId,
  req,
  category = "all"
) {
  console.log("\n🟢 ========== getAdminConfiguredOffers DEBUG ==========");
  console.log("🟢 [getAdminConfiguredOffers] Parameters:", {
    offerType,
    userId,
    category,
    userProfile: {
      age: userProfile.age,
      gender: userProfile.gender,
      country: userProfile.country,
    },
  });

  try {
    const SurveySDK = require("../models/SurveySDK");
    const SurveyOffer = require("../models/SurveyOffer");
    const NonGameOffer = require("../models/NonGameOffer");

    // Find SDK - try Bitlabs first, then Everflow
    let sdk = await SurveySDK.findOne({ name: { $regex: /bitlab/i } });
    let sdkProvider = "bitlabs";
    
    if (!sdk) {
      // Try Everflow SDK
      sdk = await SurveySDK.findOne({ name: { $regex: /everflow/i } });
      sdkProvider = "everflow";
    }

    if (!sdk) {
      console.warn("⚠️ [getAdminConfiguredOffers] No SDK found (Bitlabs or Everflow)");
      return [];
    }

    console.log("🟢 [getAdminConfiguredOffers] SDK found:", {
      sdkId: sdk._id.toString(),
      name: sdk.name,
      provider: sdkProvider,
    });

    let allOffers = [];

    // Handle "all" type - fetch from both models
    if (offerType === "all") {
      // Fetch surveys from SurveyOffer
      const surveyQuery = {
        sdkId: sdk._id,
        offerType: "survey",
        status: "live",
      };
      const surveys = await SurveyOffer.find(surveyQuery)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();

      // Fetch non-gaming offers from NonGameOffer
      const nonGameQuery = {
        sdkId: sdk._id,
        status: "live",
      };
      const nonGameOffers = await NonGameOffer.find(nonGameQuery)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();

      allOffers = [...surveys, ...nonGameOffers];
    } else {
      // Determine which model to use based on offerType
      const isSurvey = offerType === "survey" || offerType === "surveys";
      const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;

      // Build query
      const query = {
        sdkId: sdk._id,
        status: "live",
      };

      if (!isSurvey) {
        // Map type for NonGameOffer (surveys handled separately)
        const typeMap = {
          cashback: "cashback",
          shopping: "shopping",
          magic_receipt: "magic_receipt",
          "magic-receipts": "magic_receipt",
          magicReceipts: "magic_receipt",
        };
        query.offerType = typeMap[offerType] || offerType;
      } else {
        query.offerType = "survey";
      }

      // Get configured offers
      console.log(
        "🟢 [getAdminConfiguredOffers] Database query:",
        JSON.stringify(query, null, 2)
      );
      allOffers = await OfferModel.find(query)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();

      console.log("🟢 [getAdminConfiguredOffers] Offers from database:", {
        totalCount: allOffers.length,
        sampleOffers: allOffers.slice(0, 3).map((o) => ({
          _id: o._id?.toString(),
          externalId: o.externalId,
          title: o.title,
          offerType: o.offerType,
          status: o.status,
        })),
      });
    }

    // Filter by user eligibility
    console.log(
      "🟢 [getAdminConfiguredOffers] Filtering by user eligibility..."
    );
    const eligibleOffers = allOffers.filter((offer) => {
      // Determine which model to use for eligibility check
      const isSurvey = offer.offerType === "survey";
      const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;
      const offerDoc = new OfferModel(offer);
      const isEligible = offerDoc.isEligibleForUser(userProfile);

      if (!isEligible && offerType === "cashback") {
        console.log("🟡 [getAdminConfiguredOffers] Offer not eligible:", {
          externalId: offer.externalId,
          title: offer.title,
          targetAudience: offer.targetAudience,
        });
      }

      return isEligible;
    });

    console.log("🟢 [getAdminConfiguredOffers] Eligible offers:", {
      beforeFilter: allOffers.length,
      afterFilter: eligibleOffers.length,
      filteredOut: allOffers.length - eligibleOffers.length,
    });

    // INDUSTRIAL-LEVEL: Fetch fresh offers from SDK with user's X-User-Id
    // This ensures click URLs are user-specific and properly tracked
    if (eligibleOffers.length > 0 && userId) {
      try {
        // CRITICAL: Do NOT send server IP to Bitlabs - it causes VPN detection
        // Bitlabs will detect the production server's IP as VPN and return empty results
        // Only send user profile data, not server IP or userAgent
        const userProfileForAPI = {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          // NOTE: Removed userAgent and ip - these cause VPN detection on production servers
          // Bitlabs will use the X-User-Id header for user tracking instead
        };

        // Cashback offers are often US-targeted; ensure country is US when fetching from Bitlabs
        if (sdkProvider === "bitlabs" && offerType === "cashback") {
          userProfileForAPI.country = "US";
        }

        let apiResult = null;

        if (sdkProvider === "bitlabs") {
          // Bitlabs API calls
          const bitlabsNonGames = require("../utils/bitlabs-non-games");
          
          if (offerType === "survey" || offerType === "surveys") {
            apiResult = await bitlabsNonGames.getSurveys({
              userId: userId,
              userProfile: userProfileForAPI,
              category: category || "all",
            });
          } else if (offerType === "cashback") {
            apiResult = await bitlabsNonGames.getCashbackOffers({
              userId: userId,
              userProfile: userProfileForAPI,
              category: category || "all",
            });
          } else if (
            offerType === "magic_receipt" ||
            offerType === "magic-receipts" ||
            offerType === "magicReceipts"
          ) {
            apiResult = await bitlabsNonGames.getMagicReceipts({
              userId: userId,
              userProfile: userProfileForAPI,
              category: category || "all",
            });
          } else if (offerType === "shopping") {
            apiResult = await bitlabsNonGames.getShoppingOffers({
              userId: userId,
              userProfile: userProfileForAPI,
              category: category || "all",
            });
          } else if (offerType === "all") {
            // For "all", fetch all types and combine
            apiResult = await bitlabsNonGames.getNonGameOffers({
              userId: userId,
              userProfile: userProfileForAPI,
              type: "all",
              category: category || "all",
            });
          }
        } else if (sdkProvider === "everflow") {
          // Everflow API calls
          const everflowService = require("../services/everflow.service");
          
          if (everflowService.isConfigured()) {
            const queryParams = {
              offer_status: "active",
              userId: userId, // Pass user ID for user-specific click URLs (sub_id1 tracking)
            };
            
            if (category && category !== "all") {
              queryParams.category = category;
            }
            
            apiResult = await everflowService.getOffers(queryParams);
            
            // Normalize Everflow response to match Bitlabs format
            if (apiResult.success && apiResult.data) {
              apiResult = {
                success: true,
                offers: apiResult.data,
                categorized: {
                  surveys: apiResult.data.filter(o => (o.offerType || o.type) === "survey"),
                  cashback: apiResult.data.filter(o => (o.offerType || o.type) === "cashback"),
                  shopping: apiResult.data.filter(o => (o.offerType || o.type) === "shopping"),
                  magicReceipts: apiResult.data.filter(o => (o.offerType || o.type) === "magic_receipt"),
                  other: apiResult.data.filter(o => !["survey", "cashback", "shopping", "magic_receipt"].includes(o.offerType || o.type)),
                },
                totalOffers: apiResult.data.length,
              };
            }
          }
        }

        // 🔵 RAW API RESPONSE - Direct response from third-party API
        console.log(
          `\n🔵 [${sdkProvider.toUpperCase()} API] ========== RAW API RESPONSE ==========`
        );
        console.log(`🔵 [${sdkProvider.toUpperCase()} API] Offer Type:`, offerType);
        console.log(`🔵 [${sdkProvider.toUpperCase()} API] User ID:`, userId);
        console.log(`🔵 [${sdkProvider.toUpperCase()} API] Success:`, apiResult?.success);
        console.log(
          `🔵 [${sdkProvider.toUpperCase()} API] Full Response:`,
          JSON.stringify(apiResult, null, 2).substring(0, 2000)
        );
        if (apiResult?.categorized) {
          console.log(
            `🔵 [${sdkProvider.toUpperCase()} API] Surveys Count:`,
            apiResult.categorized.surveys?.length || 0
          );
          console.log(
            `🔵 [${sdkProvider.toUpperCase()} API] Cashback Count:`,
            apiResult.categorized.cashback?.length || 0
          );
          console.log(
            `🔵 [${sdkProvider.toUpperCase()} API] Magic Receipts Count:`,
            apiResult.categorized.magicReceipts?.length || 0
          );
          console.log(
            `🔵 [${sdkProvider.toUpperCase()} API] Shopping Count:`,
            apiResult.categorized.shopping?.length || 0
          );
        }
        console.log(
          `🔵 [${sdkProvider.toUpperCase()} API] ===========================================\n`
        );

        // Match admin config with fresh API response
        if (apiResult && apiResult.success) {
          const freshOffers = [];

          // Get fresh offers from appropriate category
          let freshOffersList = [];
          if (offerType === "survey" || offerType === "surveys") {
            freshOffersList =
              apiResult.categorized?.surveys || apiResult.surveys || [];
          } else if (offerType === "cashback") {
            freshOffersList =
              apiResult.categorized?.cashback ||
              apiResult.cashback ||
              [];
            console.log(
              `🟢 [getAdminConfiguredOffers] Fresh cashback offers from ${sdkProvider}:`,
              {
                count: freshOffersList.length,
                sampleIds: freshOffersList
                  .slice(0, 5)
                  .map((o) => o.merchant_id || o.offerId || o.externalId),
              }
            );
          } else if (
            offerType === "magic_receipt" ||
            offerType === "magic-receipts" ||
            offerType === "magicReceipts"
          ) {
            freshOffersList = apiResult.categorized?.magicReceipts || [];
          } else if (offerType === "shopping") {
            freshOffersList = apiResult.categorized?.shopping || [];
          } else if (offerType === "all") {
            // Combine all types
            freshOffersList = [
              ...(apiResult.categorized?.surveys || []),
              ...(apiResult.categorized?.cashback || []),
              ...(apiResult.categorized?.magicReceipts || []),
              ...(apiResult.categorized?.shopping || []),
            ];
          }

          console.log(
            `🟢 [getAdminConfiguredOffers] Matching admin offers with fresh ${sdkProvider} offers...`
          );
          console.log("🟢 [getAdminConfiguredOffers] Matching:", {
            eligibleOffersCount: eligibleOffers.length,
            freshOffersCount: freshOffersList.length,
            sdkProvider: sdkProvider,
          });

          // Match each admin-configured offer with fresh API response
          let matchedCount = 0;
          let unmatchedCount = 0;
          for (const configuredOffer of eligibleOffers) {
            // Match by externalId (works for both Bitlabs and Everflow)
            const matchingFreshOffer = freshOffersList.find((fresh) => {
              if (sdkProvider === "bitlabs" && offerType === "cashback") {
                // For Bitlabs cashback, match by merchant_id
                return (
                  fresh.merchant_id?.toString() === configuredOffer.externalId ||
                  fresh.id === configuredOffer.externalId ||
                  fresh.offerId === configuredOffer.externalId
                );
              } else if (sdkProvider === "everflow") {
                // For Everflow, match by network_offer_id or offerId
                return (
                  fresh.network_offer_id?.toString() === configuredOffer.externalId ||
                  fresh.offerId === configuredOffer.externalId ||
                  fresh.id === configuredOffer.externalId ||
                  fresh.externalId === configuredOffer.externalId
                );
              } else {
                // For surveys and other offers, match by id/surveyId/offerId
                return (
                  fresh.id === configuredOffer.externalId ||
                  fresh.surveyId === configuredOffer.externalId ||
                  fresh.offerId === configuredOffer.externalId
                );
              }
            });

            if (
              matchingFreshOffer &&
              (matchingFreshOffer.click_url || matchingFreshOffer.clickUrl)
            ) {
              matchedCount++;
              if (offerType === "cashback") {
                console.log(
                  "✅ [getAdminConfiguredOffers] Matched cashback offer:",
                  {
                    externalId: configuredOffer.externalId,
                    merchant_id: matchingFreshOffer.merchant_id,
                    merchant_name: matchingFreshOffer.merchant_name,
                    hasClickUrl: !!(
                      matchingFreshOffer.click_url ||
                      matchingFreshOffer.clickUrl
                    ),
                  }
                );
              }

              // For cashback, magic receipts, and shopping: Preserve exact Bitlabs API structure
              if (
                offerType === "cashback" ||
                offerType === "magic_receipt" ||
                offerType === "magic-receipts" ||
                offerType === "magicReceipts" ||
                offerType === "shopping"
              ) {
                // Include ALL database fields + fresh Bitlabs data
                freshOffers.push({
                  ...matchingFreshOffer, // Preserve ALL original Bitlabs fields
                  click_url:
                    matchingFreshOffer.click_url || matchingFreshOffer.clickUrl, // Use fresh URL from Bitlabs

                  // Database fields
                  _id: configuredOffer._id?.toString(),
                  externalId: configuredOffer.externalId,
                  coinReward: configuredOffer.coinReward || 0,
                  userRewardCoins:
                    configuredOffer.userRewardCoins ||
                    configuredOffer.coinReward ||
                    0,
                  userRewardXP:
                    configuredOffer.userRewardXP ||
                    Math.round((configuredOffer.coinReward || 0) * 0.5),
                  estimatedTime: configuredOffer.estimatedTime || 1,
                  status: configuredOffer.status,
                  targetAudience: configuredOffer.targetAudience || {},
                  requirements: configuredOffer.requirements || {},
                  offerDetails: configuredOffer.offerDetails || {},
                  analytics: configuredOffer.analytics || {},
                  metadata: {
                    ...configuredOffer.metadata,
                    ...matchingFreshOffer, // Merge fresh Bitlabs data into metadata
                    // Always expose the latest, user-specific click URL in metadata.externalUrl
                    // so frontend can safely use it as the redirect URL.
                    externalUrl:
                      (matchingFreshOffer.click_url ||
                        matchingFreshOffer.clickUrl ||
                        configuredOffer.metadata?.externalUrl ||
                        ""),
                  },
                  expiryDate: configuredOffer.expiryDate || null,
                  createdAt: configuredOffer.createdAt || null,
                  updatedAt: configuredOffer.updatedAt || null,
                  sdkId:
                    configuredOffer.sdkId?._id?.toString() ||
                    configuredOffer.sdkId?.toString() ||
                    null,
                  sdkName:
                    configuredOffer.sdkId?.name ||
                    configuredOffer.sdkId?.displayName ||
                    "bitlabs",

                  isAvailable: true,
                  source: "admin_configured",
                });
              } else {
                // For surveys and other offers: Include ALL database fields + fresh URL
                freshOffers.push({
                  // Core identifiers
                  id:
                    configuredOffer._id?.toString() ||
                    configuredOffer.externalId,
                  externalId: configuredOffer.externalId,
                  surveyId: configuredOffer.externalId,
                  offerId: configuredOffer.externalId,

                  // Basic info
                  title: configuredOffer.title,
                  name: configuredOffer.title,
                  description: configuredOffer.description || "",

                  // Category (can be object or string)
                  category:
                    configuredOffer.category?.name ||
                    configuredOffer.category ||
                    "other",
                  categoryObject: configuredOffer.category, // Full category object if exists

                  // Type and status
                  type: configuredOffer.offerType,
                  status: configuredOffer.status,

                  // Images
                  icon:
                    configuredOffer.metadata?.thumbnail ||
                    configuredOffer.category?.icon_url ||
                    matchingFreshOffer.icon ||
                    "",
                  banner:
                    configuredOffer.metadata?.thumbnail ||
                    matchingFreshOffer.banner ||
                    "",

                  // Rewards
                  coinReward: configuredOffer.coinReward || 0,
                  userRewardCoins:
                    configuredOffer.userRewardCoins ||
                    configuredOffer.coinReward ||
                    0,
                  userRewardXP:
                    configuredOffer.userRewardXP ||
                    Math.round((configuredOffer.coinReward || 0) * 0.5),
                  reward: {
                    coins: configuredOffer.coinReward || 0,
                    currency: "points",
                    xp:
                      configuredOffer.userRewardXP ||
                      Math.round((configuredOffer.coinReward || 0) * 0.5),
                  },

                  // Time
                  estimatedTime: configuredOffer.estimatedTime || 5,
                  duration: configuredOffer.estimatedTime || 5,
                  loi: configuredOffer.estimatedTime || 5,

                  // URLs (fresh from Bitlabs)
                  clickUrl: matchingFreshOffer.clickUrl, // Fresh URL from Bitlabs
                  surveyUrl:
                    matchingFreshOffer.clickUrl ||
                    matchingFreshOffer.surveyUrl ||
                    configuredOffer.metadata?.surveyUrl ||
                    "",
                  url:
                    matchingFreshOffer.clickUrl || matchingFreshOffer.url || "",

                  // Target audience (from database)
                  targetAudience: configuredOffer.targetAudience || {},

                  // Requirements (from database)
                  requirements: configuredOffer.requirements || {},

                  // Content (from database)
                  content: configuredOffer.content || {},

                  // Analytics (from database)
                  analytics: configuredOffer.analytics || {},

                  // Metadata (from database - includes all stored metadata)
                  metadata: configuredOffer.metadata || {},

                  // Dates
                  expiryDate: configuredOffer.expiryDate || null,
                  createdAt: configuredOffer.createdAt || null,
                  updatedAt: configuredOffer.updatedAt || null,

                  // Provider info
                  provider: "bitlabs",
                  sdkId:
                    configuredOffer.sdkId?._id?.toString() ||
                    configuredOffer.sdkId?.toString() ||
                    null,
                  sdkName:
                    configuredOffer.sdkId?.name ||
                    configuredOffer.sdkId?.displayName ||
                    "bitlabs",

                  // Additional fields from fresh Bitlabs response
                  value: matchingFreshOffer.value || 0,
                  cpi: matchingFreshOffer.cpi || 0,
                  cr: matchingFreshOffer.cr || 0,
                  rating: matchingFreshOffer.rating || 0,
                  country: matchingFreshOffer.country || null,
                  language: matchingFreshOffer.language || null,
                  tags:
                    configuredOffer.metadata?.tags ||
                    matchingFreshOffer.tags ||
                    [],

                  // Availability
                  isAvailable: true,
                  source: "admin_configured",
                });
              }
            } else {
              unmatchedCount++;
              // Offer not found in fresh Bitlabs response - mark as unavailable
              if (offerType === "cashback") {
                console.log(
                  "⚠️ [getAdminConfiguredOffers] Cashback offer not matched:",
                  {
                    externalId: configuredOffer.externalId,
                    title: configuredOffer.title,
                    reason:
                      "Not found in fresh Bitlabs response or no click_url",
                  }
                );
                // For cashback: Return structure with isAvailable: false
                // Use rawBitlabsData from metadata if available, otherwise use basic fields
                const rawData = configuredOffer.metadata?.rawBitlabsData || {};
                freshOffers.push({
                  // Bitlabs structure
                  merchant_id: parseInt(configuredOffer.externalId),
                  merchant_name:
                    configuredOffer.title || rawData.merchant_name || "",
                  cashback:
                    rawData.cashback ||
                    configuredOffer.metadata?.cashback ||
                    "0",
                  click_url: "", // No fresh URL available
                  country_code: rawData.country_code || "",
                  currency: rawData.currency || "USD",
                  description:
                    configuredOffer.description || rawData.description || "",
                  flat_payout: rawData.flat_payout || false,
                  images: rawData.images || {},
                  original_cashback:
                    rawData.original_cashback || rawData.cashback || "0",
                  primary_category: rawData.primary_category || "",
                  rank: rawData.rank || 0,
                  reward_delay_days: rawData.reward_delay_days || 0,
                  terms: rawData.terms || [],
                  tier_mappings: rawData.tier_mappings || [],
                  up_to: rawData.up_to || false,

                  // Database fields
                  _id: configuredOffer._id?.toString(),
                  externalId: configuredOffer.externalId,
                  title: configuredOffer.title,
                  coinReward: configuredOffer.coinReward || 0,
                  userRewardCoins:
                    configuredOffer.userRewardCoins ||
                    configuredOffer.coinReward ||
                    0,
                  userRewardXP:
                    configuredOffer.userRewardXP ||
                    Math.round((configuredOffer.coinReward || 0) * 0.5),
                  estimatedTime: configuredOffer.estimatedTime || 1,
                  status: configuredOffer.status,
                  category: configuredOffer.category,
                  offerType: configuredOffer.offerType,
                  targetAudience: configuredOffer.targetAudience || {},
                  requirements: configuredOffer.requirements || {},
                  offerDetails: configuredOffer.offerDetails || {},
                  analytics: configuredOffer.analytics || {},
                  metadata: configuredOffer.metadata || {},
                  expiryDate: configuredOffer.expiryDate || null,
                  createdAt: configuredOffer.createdAt || null,
                  updatedAt: configuredOffer.updatedAt || null,
                  sdkId:
                    configuredOffer.sdkId?._id?.toString() ||
                    configuredOffer.sdkId?.toString() ||
                    null,
                  sdkName:
                    configuredOffer.sdkId?.name ||
                    configuredOffer.sdkId?.displayName ||
                    "bitlabs",

                  isAvailable: false,
                  source: "admin_configured",
                });
              } else if (
                offerType === "magic_receipt" ||
                offerType === "magic-receipts" ||
                offerType === "magicReceipts"
              ) {
                // For magic receipts: Return structure with isAvailable: false
                // Use rawBitlabsData from metadata if available, otherwise use basic fields
                const rawData = configuredOffer.metadata?.rawBitlabsData || {};
                freshOffers.push({
                  // Bitlabs structure
                  id: parseInt(configuredOffer.externalId),
                  anchor: configuredOffer.title || rawData.anchor || "",
                  product_name:
                    rawData.product_name || configuredOffer.description || "",
                  total_points: rawData.total_points || "0",
                  click_url: "", // No fresh URL available
                  confirmation_time: rawData.confirmation_time || "",
                  pending_time: rawData.pending_time || 0,
                  session_hours: rawData.session_hours || 0,
                  offer_expires_at: rawData.offer_expires_at || null,
                  events: rawData.events || [],
                  epc: rawData.epc || "0",
                  description:
                    configuredOffer.description || rawData.description || "",
                  requirements: rawData.requirements || "",
                  things_to_know: rawData.things_to_know || [],
                  creatives: rawData.creatives || {},
                  icon_url: rawData.icon_url || "",
                  impression_url: rawData.impression_url || "",
                  support_url: rawData.support_url || "",

                  // Database fields
                  _id: configuredOffer._id?.toString(),
                  externalId: configuredOffer.externalId,
                  title: configuredOffer.title,
                  coinReward: configuredOffer.coinReward || 0,
                  userRewardCoins:
                    configuredOffer.userRewardCoins ||
                    configuredOffer.coinReward ||
                    0,
                  userRewardXP:
                    configuredOffer.userRewardXP ||
                    Math.round((configuredOffer.coinReward || 0) * 0.5),
                  estimatedTime: configuredOffer.estimatedTime || 1,
                  status: configuredOffer.status,
                  category: configuredOffer.category,
                  offerType: configuredOffer.offerType,
                  targetAudience: configuredOffer.targetAudience || {},
                  requirements: {
                    ...configuredOffer.requirements,
                    ...(rawData.requirements
                      ? { bitlabs: rawData.requirements }
                      : {}),
                  },
                  offerDetails: configuredOffer.offerDetails || {},
                  analytics: configuredOffer.analytics || {},
                  metadata: configuredOffer.metadata || {},
                  expiryDate: configuredOffer.expiryDate || null,
                  createdAt: configuredOffer.createdAt || null,
                  updatedAt: configuredOffer.updatedAt || null,
                  sdkId:
                    configuredOffer.sdkId?._id?.toString() ||
                    configuredOffer.sdkId?.toString() ||
                    null,
                  sdkName:
                    configuredOffer.sdkId?.name ||
                    configuredOffer.sdkId?.displayName ||
                    "bitlabs",

                  isAvailable: false,
                  source: "admin_configured",
                });
              } else if (offerType === "shopping") {
                // For shopping: Return structure with isAvailable: false
                // Use rawBitlabsData from metadata if available, otherwise use basic fields
                const rawData = configuredOffer.metadata?.rawBitlabsData || {};
                freshOffers.push({
                  // Bitlabs structure
                  id: parseInt(configuredOffer.externalId),
                  anchor: configuredOffer.title || rawData.anchor || "",
                  product_name:
                    rawData.product_name || configuredOffer.description || "",
                  total_points: rawData.total_points || "0",
                  click_url: "", // No fresh URL available
                  confirmation_time: rawData.confirmation_time || "",
                  pending_time: rawData.pending_time || 0,
                  session_hours: rawData.session_hours || 0,
                  offer_expires_at: rawData.offer_expires_at || null,
                  events: rawData.events || [],
                  epc: rawData.epc || "0",
                  description:
                    configuredOffer.description || rawData.description || "",
                  requirements: rawData.requirements || "",
                  things_to_know: rawData.things_to_know || [],
                  creatives: rawData.creatives || {},
                  icon_url: rawData.icon_url || "",
                  impression_url: rawData.impression_url || "",
                  support_url: rawData.support_url || "",

                  // Database fields
                  _id: configuredOffer._id?.toString(),
                  externalId: configuredOffer.externalId,
                  title: configuredOffer.title,
                  coinReward: configuredOffer.coinReward || 0,
                  userRewardCoins:
                    configuredOffer.userRewardCoins ||
                    configuredOffer.coinReward ||
                    0,
                  userRewardXP:
                    configuredOffer.userRewardXP ||
                    Math.round((configuredOffer.coinReward || 0) * 0.5),
                  estimatedTime: configuredOffer.estimatedTime || 1,
                  status: configuredOffer.status,
                  category: configuredOffer.category,
                  offerType: configuredOffer.offerType,
                  targetAudience: configuredOffer.targetAudience || {},
                  requirements: {
                    ...configuredOffer.requirements,
                    ...(rawData.requirements
                      ? { bitlabs: rawData.requirements }
                      : {}),
                  },
                  offerDetails: configuredOffer.offerDetails || {},
                  analytics: configuredOffer.analytics || {},
                  metadata: configuredOffer.metadata || {},
                  expiryDate: configuredOffer.expiryDate || null,
                  createdAt: configuredOffer.createdAt || null,
                  updatedAt: configuredOffer.updatedAt || null,
                  sdkId:
                    configuredOffer.sdkId?._id?.toString() ||
                    configuredOffer.sdkId?.toString() ||
                    null,
                  sdkName:
                    configuredOffer.sdkId?.name ||
                    configuredOffer.sdkId?.displayName ||
                    "bitlabs",

                  isAvailable: false,
                  source: "admin_configured",
                });
              } else {
                freshOffers.push({
                  id: configuredOffer.externalId,
                  surveyId: configuredOffer.externalId,
                  offerId: configuredOffer.externalId,
                  title: configuredOffer.title,
                  name: configuredOffer.title,
                  description: configuredOffer.description || "",
                  category: configuredOffer.category || "other",
                  type: configuredOffer.offerType,
                  icon: configuredOffer.metadata?.thumbnail || "",
                  banner: configuredOffer.metadata?.thumbnail || "",
                  reward: {
                    coins: configuredOffer.coinReward || 0,
                    currency: "points",
                    xp: Math.round((configuredOffer.coinReward || 0) * 0.5),
                  },
                  estimatedTime: configuredOffer.estimatedTime || 5,
                  duration: configuredOffer.estimatedTime || 5,
                  clickUrl: "", // No fresh URL available
                  surveyUrl: "",
                  url: "",
                  isAvailable: false, // Not available from Bitlabs
                  provider: "bitlabs",
                  source: "admin_configured",
                });
              }
            }
          }

          console.log("🟢 [getAdminConfiguredOffers] Matching complete:", {
            matched: matchedCount,
            unmatched: unmatchedCount,
            totalReturned: freshOffers.length,
          });

          if (offerType === "cashback") {
            console.log(
              "🟢 [getAdminConfiguredOffers] Cashback offers summary:",
              {
                available: freshOffers.filter((o) => o.isAvailable).length,
                unavailable: freshOffers.filter((o) => !o.isAvailable).length,
              }
            );
          }

          console.log(
            "🟢 ========== getAdminConfiguredOffers DEBUG END ==========\n"
          );
          return freshOffers;
        }
      } catch (freshUrlError) {
        console.error(
          "❌ [getAdminConfiguredOffers] Error fetching fresh URLs from Bitlabs:",
          freshUrlError
        );
        console.error(
          "❌ [getAdminConfiguredOffers] Error stack:",
          freshUrlError.stack
        );
        // Fallback: return offers without fresh URLs
      }
    }

    console.log(
      "🟢 [getAdminConfiguredOffers] No fresh URLs fetched, returning offers without URLs"
    );
    console.log(
      "🟢 [getAdminConfiguredOffers] Eligible offers count:",
      eligibleOffers.length
    );

    // Fallback: return offers without fresh URLs (if fetching failed or userId not provided)
    const fallbackOffers = eligibleOffers.map((offer) => {
      // For cashback: Preserve raw Bitlabs structure from metadata
      if (offer.offerType === "cashback") {
        const rawData = offer.metadata?.rawBitlabsData || {};
        return {
          merchant_id: parseInt(offer.externalId),
          merchant_name: offer.title || rawData.merchant_name || "",
          cashback: rawData.cashback || "0",
          click_url: "", // No fresh URL available
          country_code: rawData.country_code || "",
          currency: rawData.currency || "USD",
          description: offer.description || rawData.description || "",
          flat_payout: rawData.flat_payout || false,
          images: rawData.images || {},
          original_cashback:
            rawData.original_cashback || rawData.cashback || "0",
          primary_category: rawData.primary_category || "",
          rank: rawData.rank || 0,
          reward_delay_days: rawData.reward_delay_days || 0,
          terms: rawData.terms || [],
          tier_mappings: rawData.tier_mappings || [],
          up_to: rawData.up_to || false,
          isAvailable: false, // Not available without fresh URL
          source: "admin_configured",
        };
      }

      // For surveys and other offers: Include ALL database fields
      return {
        // Core identifiers
        id: offer._id?.toString() || offer.externalId,
        externalId: offer.externalId,
        surveyId: offer.externalId,
        offerId: offer.externalId,

        // Basic info
        title: offer.title,
        name: offer.title,
        description: offer.description || "",

        // Category (can be object or string)
        category: offer.category?.name || offer.category || "other",
        categoryObject: offer.category, // Full category object if exists

        // Type and status
        type: offer.offerType,
        status: offer.status,

        // Images
        icon: offer.metadata?.thumbnail || offer.category?.icon_url || "",
        banner: offer.metadata?.thumbnail || "",

        // Rewards
        coinReward: offer.coinReward || 0,
        userRewardCoins: offer.userRewardCoins || offer.coinReward || 0,
        userRewardXP:
          offer.userRewardXP || Math.round((offer.coinReward || 0) * 0.5),
        reward: {
          coins: offer.coinReward || 0,
          currency: "points",
          xp: offer.userRewardXP || Math.round((offer.coinReward || 0) * 0.5),
        },

        // Time
        estimatedTime: offer.estimatedTime || 5,
        duration: offer.estimatedTime || 5,
        loi: offer.estimatedTime || 5,

        // URLs (no fresh URL available)
        clickUrl: "", // No fresh URL available
        surveyUrl: offer.metadata?.surveyUrl || "",
        url: "",

        // Target audience (from database)
        targetAudience: offer.targetAudience || {},

        // Requirements (from database)
        requirements: offer.requirements || {},

        // Content (from database)
        content: offer.content || {},

        // Analytics (from database)
        analytics: offer.analytics || {},

        // Metadata (from database - includes all stored metadata)
        metadata: offer.metadata || {},

        // Dates
        expiryDate: offer.expiryDate || null,
        createdAt: offer.createdAt || null,
        updatedAt: offer.updatedAt || null,

        // Provider info
        provider: "bitlabs",
        sdkId: offer.sdkId?._id?.toString() || offer.sdkId?.toString() || null,
        sdkName: offer.sdkId?.name || offer.sdkId?.displayName || "bitlabs",

        // Tags
        tags: offer.metadata?.tags || [],

        // Availability
        isAvailable: false, // Not available without fresh URL
        source: "admin_configured",
      };
    });

    console.log("🟢 [getAdminConfiguredOffers] Returning fallback offers:", {
      count: fallbackOffers.length,
      offerType,
    });
    console.log(
      "🟢 ========== getAdminConfiguredOffers DEBUG END ==========\n"
    );

    return fallbackOffers;
  } catch (error) {
    console.error(
      "❌ [getAdminConfiguredOffers] Error getting admin-configured offers:",
      error
    );
    console.error("❌ [getAdminConfiguredOffers] Error stack:", error.stack);
    console.log(
      "🟢 ========== getAdminConfiguredOffers DEBUG END (ERROR) ==========\n"
    );
    return [];
  }
}

/**
 * GET /api/non-game-offers
 * Get all non-game offers (surveys, magic receipts, cashback, shopping)
 * Checks admin-configured offers first, then falls back to BitLab API
 */
router.get("/", protect, async (req, res) => {
  console.log("\n🔵 ========== MAIN NON-GAME-OFFERS ROUTE DEBUG ==========");
  console.log("🔵 [MAIN ROUTE] Request received at:", new Date().toISOString());

  try {
    const {
      type = "all",
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig: rawUseAdminConfig = "true",
    } = req.query;

    // Trim whitespace from useAdminConfig to handle cases like "true " or " true"
    const useAdminConfig = String(rawUseAdminConfig).trim();

    // Trim whitespace from useAdminConfig to handle cases like "true " or " true"
    const trimmedUseAdminConfig = String(useAdminConfig).trim();

    console.log("🔵 [MAIN ROUTE] Request Parameters:", {
      type,
      category,
      page,
      limit,
      useAdminConfig: useAdminConfig,
      useAdminConfigTrimmed: trimmedUseAdminConfig,
      useAdminConfigLength: useAdminConfig?.length,
      userId: req.user?.userId,
    });

    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences onboarding"
    );

    if (!user) {
      console.error("❌ [MAIN ROUTE] User not found:", req.user?.userId);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    console.log("🔵 [MAIN ROUTE] User found:", {
      userId: user._id.toString(),
      hasLocation: !!user.location,
      hasPreferences: !!user.preferences,
      hasXP: !!user.xp,
      hasOnboarding: !!user.onboarding,
      gender: user.onboarding?.gender || "N/A",
      ageRange: user.onboarding?.ageRange || "N/A",
    });

    // Device type affects eligibility for admin-configured NonGameOffer.requirements.deviceType
    // Cashback offers are typically web-based, so treat deviceType as "web" for type=cashback
    const deviceTypeForOffers = type === "cashback" ? "web" : "mobile";

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: deviceTypeForOffers,
      hasGoogleId: !!user.social?.googleId, // Skip gender restrictions for Google users
    };

    console.log("🔵 [MAIN ROUTE] User Profile:", {
      age: userProfile.age,
      gender: userProfile.gender,
      country: userProfile.country,
      language: userProfile.language,
      xp: userProfile.xp,
      deviceType: userProfile.deviceType,
    });

    let offers = [];
    let categorized = {
      surveys: [],
      cashback: [],
      shopping: [],
      magicReceipts: [],
      other: [],
    };
    let source = "bitlab_direct";

    // Step 1: Check admin-configured offers first
    console.log("🔵 [MAIN ROUTE] useAdminConfig check:", {
      original: rawUseAdminConfig,
      trimmed: useAdminConfig,
      willExecute: useAdminConfig === "true",
    });

    if (useAdminConfig === "true") {
      console.log(
        "🔵 [MAIN ROUTE] useAdminConfig=true - Fetching admin-configured offers..."
      );
      try {
        // Map type to offerType
        const typeMap = {
          all: "all",
          survey: "survey",
          surveys: "survey",
          cashback: "cashback",
          shopping: "shopping",
          magic_receipt: "magic_receipt",
          "magic-receipts": "magic_receipt",
          magicReceipts: "magic_receipt",
        };

        const offerType = typeMap[type] || "all";
        console.log("🔵 [MAIN ROUTE] Type mapping:", {
          requestedType: type,
          mappedOfferType: offerType,
        });

        console.log("🔵 [MAIN ROUTE] Calling getAdminConfiguredOffers with:", {
          offerType,
          userId: user._id.toString(),
          category,
        });

        const adminOffers = await getAdminConfiguredOffers(
          offerType,
          userProfile,
          user._id.toString(),
          req,
          category
        );

        console.log("🔵 [MAIN ROUTE] Admin offers received:", {
          totalCount: adminOffers.length,
          sampleOffers: adminOffers.slice(0, 3).map((o) => ({
            type: o.type || o.offerType,
            merchant_id: o.merchant_id,
            merchant_name: o.merchant_name,
            primary_category: o.primary_category,
          })),
        });

        if (adminOffers.length > 0) {
          // Group by type
          adminOffers.forEach((offer) => {
            const offerTypeKey =
              offer.type === "magic_receipt"
                ? "magicReceipts"
                : offer.type === "magic-receipts"
                ? "magicReceipts"
                : offer.type || "other";
            if (categorized[offerTypeKey]) {
              categorized[offerTypeKey].push(offer);
            } else {
              categorized.other.push(offer);
            }
          });

          console.log("🔵 [MAIN ROUTE] Categorized offers:", {
            surveys: categorized.surveys.length,
            cashback: categorized.cashback.length,
            shopping: categorized.shopping.length,
            magicReceipts: categorized.magicReceipts.length,
            other: categorized.other.length,
          });

          // Flatten all offers
          offers = adminOffers;
          source = "admin_configured";
          console.log(
            "✅ [MAIN ROUTE] Returning",
            offers.length,
            "admin-configured offers"
          );
        } else {
          console.warn("⚠️ [MAIN ROUTE] No admin-configured offers found");
        }
      } catch (configError) {
        console.error(
          "❌ [MAIN ROUTE] Error fetching admin-configured offers:",
          configError
        );
        console.error("❌ [MAIN ROUTE] Error stack:", configError.stack);
        // Fall through to BitLab API
      }
    }

    // Step 2: Fallback to BitLab API if no admin config or if explicitly requested
    // NOTE: For cashback offers, NO FALLBACK - only return admin-configured data
    const isCashbackRequest = type === "cashback";
    console.log("🔵 [MAIN ROUTE] Checking fallback conditions:", {
      offersCount: offers.length,
      useAdminConfig,
      isCashbackRequest,
      willFallback:
        (offers.length === 0 || useAdminConfig === "false") &&
        !isCashbackRequest,
    });

    if (
      (offers.length === 0 || useAdminConfig === "false") &&
      !isCashbackRequest
    ) {
      // Try Bitlabs first
      const result = await bitlabsNonGames.getNonGameOffers({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        type,
        category,
      });


      if (result.success) {
        offers = result.offers || [];
        categorized = result.categorized || categorized;
        // Preserve exact Bitlabs API structure for cashback, magic receipts, and shopping
        if (categorized.cashback) {
          categorized.cashback = categorized.cashback.map((c) => ({
            ...c, // Preserve all original Bitlabs fields
            source: "bitlab_direct",
          }));
        }
        if (categorized.magicReceipts) {
          categorized.magicReceipts = categorized.magicReceipts.map((m) => ({
            ...m, // Preserve all original Bitlabs fields
            source: "bitlab_direct",
          }));
        }
        if (categorized.shopping) {
          categorized.shopping = categorized.shopping.map((s) => ({
            ...s, // Preserve all original Bitlabs fields
            source: "bitlab_direct",
          }));
        }
        source = "bitlab_direct";
      }

      // Step 3: If still no offers, try Everflow API
      if (offers.length === 0 && everflowService.isConfigured()) {
        console.log("🔵 [MAIN ROUTE] Trying Everflow API as additional fallback...");
        console.log("🔵 [MAIN ROUTE] Everflow config check:", {
          configured: everflowService.isConfigured(),
          baseURL: config.EVERFLOW_BASE_URL,
          apiKey: config.EVERFLOW_API_KEY ? "***SET***" : "MISSING",
        });
        
        try {
          // Pass userId for user-specific click URLs (Everflow uses sub_id1 for tracking)
          const everflowResult = await everflowService.getPostbacks({
            status: "active",
            limit: parseInt(limit) * 2, // Get more to filter
            userId: user?._id?.toString(), // Pass user ID for tracking
          });

          console.log("🔵 [MAIN ROUTE] Everflow result:", {
            success: everflowResult.success,
            dataLength: everflowResult.data?.length || 0,
            total: everflowResult.total || 0,
            error: everflowResult.error,
          });

          if (everflowResult.success && everflowResult.data && everflowResult.data.length > 0) {
            // Filter offers by type if specified
            let filteredOffers = everflowResult.data;
            
            if (type !== "all") {
              filteredOffers = filteredOffers.filter((offer) => {
                const offerType = offer.offerType || offer.type || "other";
                return offerType === type || 
                       (type === "magic_receipt" && offerType === "magic_receipt") ||
                       (type === "magic-receipts" && offerType === "magic_receipt");
              });
            }

            // Filter by category if specified
            if (category && category !== "all") {
              filteredOffers = filteredOffers.filter((offer) => {
                const offerCategory = (offer.category || "").toLowerCase();
                return offerCategory.includes(category.toLowerCase());
              });
            }

            // Add user-specific click URLs if needed
            const normalizedEverflowOffers = filteredOffers.map((offer) => ({
              ...offer,
              source: "everflow",
              provider: "everflow",
            }));

            // Merge with existing offers
            offers = [...offers, ...normalizedEverflowOffers];
            
            // Categorize Everflow offers
            normalizedEverflowOffers.forEach((offer) => {
              const offerType = offer.offerType || offer.type || "other";
              const categoryKey = offerType === "magic_receipt" ? "magicReceipts" : offerType;
              if (categorized[categoryKey]) {
                categorized[categoryKey].push(offer);
              } else {
                categorized.other.push(offer);
              }
            });

            if (normalizedEverflowOffers.length > 0) {
              source = source === "bitlab_direct" ? "bitlab_everflow" : "everflow";
              console.log(
                `✅ [MAIN ROUTE] Added ${normalizedEverflowOffers.length} offers from Everflow`
              );
            }
          }
        } catch (everflowError) {
          console.error("❌ [MAIN ROUTE] Everflow API error:", everflowError);
          // Continue without Everflow offers
        }
      }
    } else if (
      isCashbackRequest &&
      useAdminConfig === "true" &&
      offers.length === 0
    ) {
      // For cashback: No fallback, return empty array if no admin config
      console.warn(
        "⚠️ [MAIN ROUTE] No admin-configured cashback offers found - returning empty array (no fallback)"
      );
      offers = [];
      categorized.cashback = [];
      source = "admin_configured";
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = offers.slice(startIndex, endIndex);

    console.log("🔵 [MAIN ROUTE] Pagination:", {
      page: parseInt(page),
      limit: parseInt(limit),
      startIndex,
      endIndex,
      totalOffers: offers.length,
      paginatedCount: paginatedOffers.length,
    });

    // Calculate totals
    const totalOffers = offers.length;
    const estimatedEarnings = offers.reduce(
      (sum, o) => sum + (o.reward?.coins || 0),
      0
    );

    console.log("🔵 [MAIN ROUTE] Final Response:", {
      success: true,
      totalOffers,
      paginatedCount: paginatedOffers.length,
      categorized: {
        surveys: categorized.surveys.length,
        cashback: categorized.cashback.length,
        shopping: categorized.shopping.length,
        magicReceipts: categorized.magicReceipts.length,
      },
      source,
      estimatedEarnings,
    });

    console.log(
      "🔵 ========== MAIN NON-GAME-OFFERS ROUTE DEBUG END ==========\n"
    );

    res.json({
      success: true,
      data: {
        offers: paginatedOffers,
        categorized: categorized,
        breakdown: {
          surveys: categorized.surveys?.length || 0,
          cashback: categorized.cashback?.length || 0,
          shopping: categorized.shopping?.length || 0,
          magicReceipts: categorized.magicReceipts?.length || 0,
          other: categorized.other?.length || 0,
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalOffers,
          pages: Math.ceil(totalOffers / parseInt(limit)),
        },
        type: type || "all",
        category: category || "all",
        totalOffers: totalOffers,
        estimatedEarnings: estimatedEarnings,
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting non-game offers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get non-game offers",
    });
  }
});

/**
 * GET /api/non-game-offers/surveys
 * Get survey offers (checks admin-configured offers first, then BitLab API)
 */
router.get("/surveys", protect, async (req, res) => {
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences onboarding"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
      hasGoogleId: !!user.social?.googleId, // Skip gender restrictions for Google users
    };

    let surveys = [];
    let source = "bitlab_direct";

    // Step 1: Check admin-configured offers (SurveyOffer model)
    //
    // INDUSTRIAL-LEVEL SOLUTION (Based on Bitlabs Official Documentation):
    // - Admin configures which surveys to show (stores survey IDs + metadata)
    // - When user requests surveys, we fetch FRESH click URLs from Bitlabs with user's X-User-Id
    // - This ensures proper tracking: each user gets URLs tied to their session
    // - Bitlabs callbacks will include correct userId matching the user who clicked
    //
    // Flow:
    // 1. Get admin-configured survey IDs from database
    // 2. Call Bitlabs API with user's X-User-Id to get fresh surveys
    // 3. Match admin config with Bitlabs response by survey ID
    // 4. Return surveys with fresh, user-specific click URLs
    //
    // Reference: BITLABS_INDUSTRIAL_SOLUTION.md
    if (useAdminConfig === "true") {
      try {
        const SurveySDK = require("../models/SurveySDK");
        const SurveyOffer = require("../models/SurveyOffer");

        // Find BitLab SDK
        const bitlabSDK = await SurveySDK.findOne({
          name: { $regex: /bitlab/i },
        });

        if (bitlabSDK) {
          // Get admin-configured surveys (only IDs, not click URLs)
          const configuredOffers = await SurveyOffer.find({
            sdkId: bitlabSDK._id,
            offerType: "survey",
            status: "live",
          });

          console.log(
            `\n🔵 [USER BACKEND] ========== ADMIN CONFIGURED SURVEYS ==========`
          );
          console.log(
            `🔵 [USER BACKEND] Total configured surveys found: ${configuredOffers.length}`
          );
          configuredOffers.forEach((offer, index) => {
            console.log(`🔵 [USER BACKEND] Survey ${index + 1}:`, {
              id: offer._id,
              externalId: offer.externalId,
              title: offer.title,
              status: offer.status,
              coinReward: offer.coinReward,
            });
          });
          console.log(
            `🔵 [USER BACKEND] ===========================================\n`
          );

          // Filter by user eligibility
          const eligibleOffers = configuredOffers.filter((offer) =>
            offer.isEligibleForUser(userProfile)
          );

          console.log(
            `\n🟢 [USER BACKEND] ========== ELIGIBLE SURVEYS ==========`
          );
          console.log(
            `🟢 [USER BACKEND] Total eligible surveys: ${eligibleOffers.length} (after filtering)`
          );
          eligibleOffers.forEach((offer, index) => {
            console.log(`🟢 [USER BACKEND] Eligible Survey ${index + 1}:`, {
              externalId: offer.externalId,
              title: offer.title,
            });
          });
          console.log(
            `🟢 [USER BACKEND] ===========================================\n`
          );

          if (eligibleOffers.length > 0) {
            // INDUSTRIAL-LEVEL: Fetch fresh surveys from Bitlabs with user's X-User-Id
            // This ensures click URLs are user-specific and properly tracked
            try {
              // CRITICAL: Do NOT send server IP to Bitlabs - it causes VPN detection
              // Bitlabs will detect the production server's IP as VPN and return empty results
              // Only send user profile data, not server IP or userAgent
              const bitlabsResult = await bitlabsNonGames.getSurveys({
                userId: user._id.toString(), // ← User's ID for proper tracking
                userProfile: {
                  ...userProfile,
                  platform: "mobile",
                  osVersion: "iOS 15.0",
                  appVersion: "1.0.0",
                  deviceModel: "iPhone 13",
                  // NOTE: Removed userAgent and ip - these cause VPN detection on production servers
                  // Bitlabs will use the X-User-Id header for user tracking instead
                },
                category,
              });


              // Match admin-configured surveys with fresh Bitlabs response
              // INDUSTRIAL-LEVEL: Each user gets fresh click URLs with their X-User-Id
              // This ensures proper tracking when user clicks and completes surveys
              const surveysWithFreshUrls = eligibleOffers
                .map((offer, offerIndex) => {
                  console.log(
                    `\n🔍 [USER BACKEND] Matching offer ${offerIndex + 1}/${
                      eligibleOffers.length
                    }:`,
                    {
                      externalId: offer.externalId,
                      title: offer.title,
                    }
                  );

                  // Find matching survey in Bitlabs response by externalId
                  const matchingSurvey =
                    bitlabsResult.categorized?.surveys?.find(
                      (s) =>
                        s.id === offer.externalId ||
                        s.surveyId === offer.externalId
                    );

                  console.log(
                    `🔍 [USER BACKEND] Matching result:`,
                    matchingSurvey
                      ? {
                          found: true,
                          bitlabsId: matchingSurvey.id,
                          bitlabsSurveyId: matchingSurvey.surveyId,
                          hasClickUrl: !!matchingSurvey.clickUrl,
                        }
                      : {
                          found: false,
                          reason: "Survey not in Bitlabs response",
                        }
                  );

                  if (matchingSurvey && matchingSurvey.clickUrl) {
                    // Return survey with fresh click URL (user-specific)
                    return {
                      id: offer.externalId,
                      surveyId: offer.externalId,
                      title: offer.title,
                      description: offer.description,
                      category: offer.category,
                      icon: offer.metadata?.thumbnail || matchingSurvey.icon,
                      banner:
                        offer.metadata?.thumbnail || matchingSurvey.banner,
                      reward: {
                        coins: offer.coinReward,
                        currency: "points",
                        xp: Math.round(offer.coinReward * 0.5),
                      },
                      estimatedTime: offer.estimatedTime,
                      clickUrl: matchingSurvey.clickUrl, // ← Fresh URL with user's session
                      surveyUrl:
                        matchingSurvey.surveyUrl || matchingSurvey.clickUrl,
                      isAvailable: offer.status === "live",
                      provider: "bitlabs",
                      source: "admin_configured",
                    };
                  } else {
                    // Survey not available from Bitlabs (expired, not available for user's country, etc.)
                    return {
                      id: offer.externalId,
                      surveyId: offer.externalId,
                      title: offer.title,
                      description: offer.description,
                      category: offer.category,
                      icon: offer.metadata?.thumbnail,
                      banner: offer.metadata?.thumbnail,
                      reward: {
                        coins: offer.coinReward,
                        currency: "points",
                        xp: Math.round(offer.coinReward * 0.5),
                      },
                      estimatedTime: offer.estimatedTime,
                      clickUrl: null, // Not available
                      surveyUrl: null,
                      isAvailable: false,
                      provider: "bitlabs",
                      source: "admin_configured",
                      message: "Survey temporarily unavailable",
                    };
                  }
                })
                .filter((o) => o !== null);

              console.log(
                `\n🟣 [USER BACKEND] ========== SURVEYS WITH FRESH URLS ==========`
              );
              console.log(
                `🟣 [USER BACKEND] Total surveys with fresh URLs: ${surveysWithFreshUrls.length}`
              );
              surveysWithFreshUrls.forEach((survey, index) => {
                console.log(`🟣 [USER BACKEND] Survey ${index + 1}:`, {
                  id: survey.id,
                  title: survey.title,
                  hasClickUrl: !!survey.clickUrl,
                  isAvailable: survey.isAvailable,
                });
              });
              console.log(
                `🟣 [USER BACKEND] ===========================================\n`
              );

              // Check if VPN restriction was detected
              const hasVpnRestriction = bitlabsResult.restrictionReason?.using_vpn === true;
              
              // If VPN is detected, return all admin-configured surveys even without fresh URLs
              // This allows users to see surveys even when server IP is flagged as VPN
              if (hasVpnRestriction) {
                console.warn(
                  `\n⚠️ [USER BACKEND] ========== VPN RESTRICTION DETECTED ==========`
                );
                console.warn(
                  `⚠️ [USER BACKEND] Bitlabs detected VPN on server IP. Returning admin-configured surveys without fresh URLs.`
                );
                console.warn(
                  `⚠️ [USER BACKEND] Surveys will be marked as unavailable but still shown to users.`
                );
                console.warn(
                  `⚠️ [USER BACKEND] ==================================================\n`
                );
                
                // Return all surveys (including those without click URLs) when VPN is detected
                surveys = surveysWithFreshUrls;
                source = "admin_configured";
                console.log(
                  `✅ [USER BACKEND] Returning ${surveys.length} admin-configured surveys (VPN restriction active)`
                );
              } else {
                // Normal behavior: Only return surveys that have fresh click URLs
                const availableSurveys = surveysWithFreshUrls.filter(
                  (s) => s.clickUrl !== null
                );

                console.log(
                  `\n✅ [USER BACKEND] ========== FINAL AVAILABLE SURVEYS ==========`
                );
                console.log(
                  `✅ [USER BACKEND] Total available surveys (with click URLs): ${availableSurveys.length}`
                );
                console.log(
                  `✅ [USER BACKEND] Filtered out (no click URL): ${
                    surveysWithFreshUrls.length - availableSurveys.length
                  }`
                );
                availableSurveys.forEach((survey, index) => {
                  console.log(
                    `✅ [USER BACKEND] Available Survey ${index + 1}:`,
                    {
                      id: survey.id,
                      title: survey.title,
                      clickUrl: survey.clickUrl ? "✅" : "❌",
                    }
                  );
                });
                console.log(
                  `✅ [USER BACKEND] ===========================================\n`
                );

                if (availableSurveys.length > 0) {
                  surveys = availableSurveys;
                  source = "admin_configured";
                  console.log(
                    `✅ [USER BACKEND] Generated ${availableSurveys.length} fresh click URLs for user ${user._id} (admin-configured surveys)`
                  );
                } else {
                  console.log(
                    `⚠️ [USER BACKEND] Admin configured ${eligibleOffers.length} surveys, but none are available from Bitlabs for user ${user._id}`
                  );
                }
              }
            } catch (bitlabsError) {
              // 🔴 ENHANCED ERROR LOGGING: Log full error details
              console.error(
                "\n🔴 [USER BACKEND] ========== ERROR FETCHING SURVEYS FROM BITLABS =========="
              );
              console.error(
                "🔴 [USER BACKEND] ❌ User ID:",
                user._id.toString()
              );
              console.error(
                "🔴 [USER BACKEND] ❌ Error Status:",
                bitlabsError.response?.status || bitlabsError.status
              );
              console.error(
                "🔴 [USER BACKEND] ❌ Error Message:",
                bitlabsError.message
              );
              console.error(
                "🔴 [USER BACKEND] ❌ Error Response Data:",
                JSON.stringify(
                  bitlabsError.response?.data || bitlabsError.data,
                  null,
                  2
                )
              );
              console.error(
                "🔴 [USER BACKEND] ❌ Error Details:",
                bitlabsError.response?.data?.error || bitlabsError.error
              );
              console.error(
                "🔴 [USER BACKEND] ❌ Trace ID:",
                bitlabsError.response?.data?.trace_id ||
                  bitlabsError.data?.trace_id
              );
              console.error(
                "🔴 [USER BACKEND] ❌ User Profile:",
                JSON.stringify(userProfile, null, 2)
              );
              console.error(
                "🔴 [USER BACKEND] ==================================================\n"
              );
              // Fall through to direct Bitlabs API call below
            }
          }
        }
      } catch (configError) {
        console.error("Error fetching admin-configured offers:", configError);
        // Fall through to BitLab API
      }
    }

    // Step 2: Fallback to BitLab API if no admin config or if explicitly requested
    if (surveys.length === 0 || useAdminConfig === "false") {
      // CRITICAL: Do NOT send server IP to Bitlabs - it causes VPN detection
      // Bitlabs will detect the production server's IP as VPN and return empty results
      // Only send user profile data, not server IP
      const result = await bitlabsNonGames.getSurveys({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          // NOTE: Removed userAgent and ip - these cause VPN detection on production servers
          // Bitlabs will use the X-User-Id header for user tracking instead
        },
        category,
      });

      // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
      console.log(
        "\n🔵 [BITLABS API] ========== RAW API RESPONSE (SURVEYS - FALLBACK) =========="
      );
      console.log("🔵 [BITLABS API] User ID:", user._id.toString());
      console.log("🔵 [BITLABS API] Success:", result?.success);
      console.log(
        "🔵 [BITLABS API] Full Response:",
        JSON.stringify(result, null, 2)
      );
      if (result?.surveys) {
        console.log(
          "🔵 [BITLABS API] Surveys Array Length:",
          result.surveys.length
        );
        if (result.surveys.length > 0) {
          console.log(
            "🔵 [BITLABS API] First Survey ID:",
            result.surveys[0]?.id || "N/A"
          );
          console.log(
            "🔵 [BITLABS API] First Survey Value:",
            result.surveys[0]?.value || "N/A"
          );
        }
      }
      if (result?.categorized?.surveys) {
        console.log(
          "🔵 [BITLABS API] Categorized Surveys Count:",
          result.categorized.surveys.length
        );
      }
      console.log(
        "🔵 [BITLABS API] ===========================================\n"
      );

      // Handle both response structures: result.categorized.surveys and result.surveys
      if (result.success) {
        const surveysFromResult = result.categorized?.surveys || result.surveys || [];
        if (surveysFromResult.length > 0) {
          surveys = surveysFromResult.map((s) => ({
            ...s,
            source: "bitlab_direct",
          }));
          source = "bitlab_direct";
          console.log(
            `✅ [USER BACKEND] Fetched ${surveys.length} surveys directly from Bitlabs (fallback)`
          );
        } else {
          console.warn(
            "\n⚠️ [USER BACKEND] ========== NO SURVEYS IN BITLABS RESPONSE =========="
          );
          console.warn("⚠️ [USER BACKEND] Result Success:", result.success);
          console.warn("⚠️ [USER BACKEND] User Profile:", {
            country: userProfile.country,
            platform: userProfile.platform,
            userId: user._id.toString(),
          });
          console.warn(
            "⚠️ [USER BACKEND] Possible reasons:",
            "- Bitlabs API not configured properly",
            "- User country not supported",
            "- No surveys available for this user profile",
            "- API token missing or invalid"
          );
          console.warn(
            "⚠️ [USER BACKEND] ==================================================\n"
          );
        }
      } else {
        console.error(
          "\n🔴 [USER BACKEND] ========== FALLBACK SURVEY FETCH FAILED =========="
        );
        console.error("🔴 [USER BACKEND] ❌ Result Success:", result.success);
        console.error("🔴 [USER BACKEND] ❌ Result Error:", result.error);
        console.error("🔴 [USER BACKEND] ❌ User Profile:", {
          country: userProfile.country,
          platform: userProfile.platform,
          userId: user._id.toString(),
        });
        console.error(
          "🔴 [USER BACKEND] ❌ Surveys Count:",
          result.categorized?.surveys?.length || result.surveys?.length || 0
        );
        console.error(
          "🔴 [USER BACKEND] ==================================================\n"
        );
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedSurveys = surveys.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        surveys: paginatedSurveys,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: surveys.length,
          pages: Math.ceil(surveys.length / parseInt(limit)),
        },
        totalSurveys: surveys.length,
        estimatedEarnings: surveys.reduce(
          (sum, s) => sum + (s.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting surveys:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get surveys",
    });
  }
});

/**
 * GET /api/non-game-offers/magic-receipts
 * Get magic receipt offers
 */
router.get("/magic-receipts", protect, async (req, res) => {
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences onboarding"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
      hasGoogleId: !!user.social?.googleId, // Skip gender restrictions for Google users
    };

    let magicReceipts = [];
    let source = "bitlab_direct";

    //
    // INDUSTRIAL-LEVEL SOLUTION (Same as surveys):
    // - Admin configures which magic receipt offers to show (stores offer IDs + metadata)
    // - When user requests magic receipts, we fetch FRESH click URLs from Bitlabs with user's X-User-Id
    // - This ensures proper tracking: each user gets URLs tied to their session
    // - Bitlabs callbacks will include correct userId matching the user who clicked
    //
    // Flow:
    // 1. Get admin-configured magic receipt offer IDs from database
    // 2. Call Bitlabs API with user's X-User-Id to get fresh magic receipt offers
    // 3. Match admin config with Bitlabs response by offer ID
    // 4. Return magic receipt offers with fresh, user-specific click URLs
    //
    if (useAdminConfig === "true") {
      try {
        const adminOffers = await getAdminConfiguredOffers(
          "magic_receipt",
          userProfile,
          user._id.toString(),
          req,
          category
        );
        // Filter by category if specified
        let filteredOffers = adminOffers;
        if (category && category !== "all") {
          filteredOffers = adminOffers.filter((offer) => {
            const offerCategory =
              offer.primary_category || offer.category || "";
            return offerCategory.toLowerCase().includes(category.toLowerCase());
          });
        }

        if (filteredOffers.length > 0) {
          // Filter out offers that are not available (no fresh URL)
          magicReceipts = filteredOffers.filter((offer) => offer.isAvailable);
          source = "admin_configured";
        }
      } catch (configError) {
        console.error(
          "Error fetching admin-configured magic receipts:",
          configError
        );
      }
    }

    // Step 2: Fallback to BitLab API
    if (magicReceipts.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getMagicReceipts({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        category,
      });


      if (result.success && result.categorized?.magicReceipts) {
        // Preserve exact Bitlabs API structure for magic receipts
        magicReceipts = result.categorized.magicReceipts.map((m) => ({
          ...m, // Preserve all original Bitlabs fields
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = magicReceipts.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        magicReceipts: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: magicReceipts.length,
          pages: Math.ceil(magicReceipts.length / parseInt(limit)),
        },
        totalMagicReceipts: magicReceipts.length,
        estimatedEarnings: magicReceipts.reduce(
          (sum, m) => sum + (m.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting magic receipts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get magic receipts",
    });
  }
});

/**
 * GET /api/non-game-offers/cashback
 * Get cashback offers
 */
router.get("/cashback", protect, async (req, res) => {
  console.log("\n🔵 ========== CASHBACK ROUTE DEBUG ==========");
  console.log("🔵 [CASHBACK] Request received at:", new Date().toISOString());

  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;

    console.log("🔵 [CASHBACK] Request Parameters:", {
      category,
      page,
      limit,
      useAdminConfig,
      userId: req.user?.userId,
    });

    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences onboarding"
    );

    if (!user) {
      console.error("❌ [CASHBACK] User not found:", req.user?.userId);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    console.log("🔵 [CASHBACK] User found:", {
      userId: user._id.toString(),
      hasLocation: !!user.location,
      hasPreferences: !!user.preferences,
      hasXP: !!user.xp,
    });

    const userAge = getUserAge(user);
    const userGender = getUserGender(user);

    const userProfile = {
      age: userAge,
      gender: userGender,
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
    };

    console.log("🔵 [CASHBACK] User Profile:", {
      age: userProfile.age,
      gender: userProfile.gender,
      country: userProfile.country,
      language: userProfile.language,
      xp: userProfile.xp,
      deviceType: userProfile.deviceType,
    });

    let cashbackOffers = [];
    let source = "admin_configured";

    //
    // ADMIN-CONFIGURED ONLY SOLUTION:
    // - Admin configures which cashback offers to show (stores offer IDs + metadata)
    // - When user requests cashback offers, we fetch FRESH click URLs from Bitlabs with user's X-User-Id
    // - This ensures proper tracking: each user gets URLs tied to their session
    // - Bitlabs callbacks will include correct userId matching the user who clicked
    // - NO FALLBACK: Only return admin-configured offers
    //
    // Flow:
    // 1. Get admin-configured cashback offer IDs from database
    // 2. Call Bitlabs API with user's X-User-Id to get fresh cashback offers
    // 3. Match admin config with Bitlabs response by offer ID
    // 4. Return cashback offers with fresh, user-specific click URLs
    // 5. Return all admin-configured offers even if some don't have fresh URLs
    //
    if (useAdminConfig === "true") {
      console.log(
        "🔵 [CASHBACK] useAdminConfig=true - Fetching admin-configured offers..."
      );
      try {
        console.log("🔵 [CASHBACK] Calling getAdminConfiguredOffers with:", {
          offerType: "cashback",
          userId: user._id.toString(),
          category,
        });

        const adminOffers = await getAdminConfiguredOffers(
          "cashback",
          userProfile,
          user._id.toString(),
          req,
          category
        );

        console.log("🔵 [CASHBACK] Admin offers received:", {
          totalCount: adminOffers.length,
          sampleOffers: adminOffers.slice(0, 3).map((o) => ({
            merchant_id: o.merchant_id,
            merchant_name: o.merchant_name,
            primary_category: o.primary_category,
            category: o.category,
            isAvailable: o.isAvailable,
          })),
        });

        // Filter by category if specified (for cashback, use primary_category field)
        let filteredOffers = adminOffers;
        if (category && category !== "all") {
          console.log("🔵 [CASHBACK] Filtering by category:", category);
          const beforeFilter = adminOffers.length;
          filteredOffers = adminOffers.filter((offer) => {
            const offerCategory =
              offer.primary_category || offer.category || "";
            const matches = offerCategory
              .toLowerCase()
              .includes(category.toLowerCase());
            if (!matches) {
              console.log("🔵 [CASHBACK] Offer filtered out:", {
                merchant_name: offer.merchant_name,
                offerCategory,
                requestedCategory: category,
              });
            }
            return matches;
          });
          console.log("🔵 [CASHBACK] Category filtering result:", {
            before: beforeFilter,
            after: filteredOffers.length,
            filteredOut: beforeFilter - filteredOffers.length,
          });
        } else {
          console.log(
            "🔵 [CASHBACK] No category filter applied (category='all')"
          );
        }

        if (filteredOffers.length > 0) {
          // Return ALL admin-configured offers (including unavailable ones)
          // This ensures admin-configured offers are always shown
          cashbackOffers = filteredOffers;
          source = "admin_configured";
          console.log(
            "✅ [CASHBACK] Returning",
            cashbackOffers.length,
            "cashback offers"
          );
        } else {
          // No admin-configured offers found
          console.warn(
            "⚠️ [CASHBACK] No admin-configured cashback offers found after filtering"
          );
          cashbackOffers = [];
          source = "admin_configured";
        }
      } catch (configError) {
        console.error(
          "❌ [CASHBACK] Error fetching admin-configured cashback offers:",
          configError
        );
        console.error("❌ [CASHBACK] Error stack:", configError.stack);
        cashbackOffers = [];
        source = "admin_configured";
      }
    } else {
      // If useAdminConfig is false, return empty array (no fallback)
      console.warn(
        "⚠️ useAdminConfig=false: Returning empty cashback offers (admin config only)"
      );
      cashbackOffers = [];
      source = "admin_configured";
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = cashbackOffers.slice(startIndex, endIndex);

    console.log("🔵 [CASHBACK] Pagination:", {
      page: parseInt(page),
      limit: parseInt(limit),
      startIndex,
      endIndex,
      totalOffers: cashbackOffers.length,
      paginatedCount: paginatedOffers.length,
    });

    console.log("🔵 [CASHBACK] Final Response:", {
      success: true,
      totalCashback: cashbackOffers.length,
      paginatedCount: paginatedOffers.length,
      source,
      estimatedEarnings: cashbackOffers.reduce(
        (sum, c) => sum + (c.reward?.coins || 0),
        0
      ),
    });

    console.log("🔵 ========== CASHBACK ROUTE DEBUG END ==========\n");

    res.json({
      success: true,
      data: {
        cashback: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: cashbackOffers.length,
          pages: Math.ceil(cashbackOffers.length / parseInt(limit)),
        },
        totalCashback: cashbackOffers.length,
        estimatedEarnings: cashbackOffers.reduce(
          (sum, c) => sum + (c.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting cashback offers:", error);

    // Return more detailed error information
    const statusCode = error.status || error.response?.status || 500;
    const errorMessage = error.message || "Failed to get cashback offers";

    // HTTP 428 means cashback feature not enabled
    if (statusCode === 428) {
      return res.status(428).json({
        success: false,
        error: {
          message: "Cashback feature is not enabled in BitLabs Dashboard",
          details:
            error.data?.error?.details || error.data || error.response?.data,
          traceId: error.data?.trace_id,
          statusCode: 428,
          suggestion:
            "Please enable cashback feature in your BitLabs Publisher Dashboard",
        },
      });
    }

    res.status(statusCode).json({
      success: false,
      error: {
        message: errorMessage,
        details: error.data || error.response?.data,
        statusCode: statusCode,
      },
    });
  }
});

/**
 * GET /api/non-game-offers/shopping
 * Get shopping offers
 */
router.get("/shopping", protect, async (req, res) => {
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences onboarding"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
      hasGoogleId: !!user.social?.googleId, // Skip gender restrictions for Google users
    };

    let shoppingOffers = [];
    let source = "bitlab_direct";

    //
    // INDUSTRIAL-LEVEL SOLUTION (Same as surveys):
    // - Admin configures which shopping offers to show (stores offer IDs + metadata)
    // - When user requests shopping offers, we fetch FRESH click URLs from Bitlabs with user's X-User-Id
    // - This ensures proper tracking: each user gets URLs tied to their session
    // - Bitlabs callbacks will include correct userId matching the user who clicked
    //
    // Flow:
    // 1. Get admin-configured shopping offer IDs from database
    // 2. Call Bitlabs API with user's X-User-Id to get fresh shopping offers
    // 3. Match admin config with Bitlabs response by offer ID
    // 4. Return shopping offers with fresh, user-specific click URLs
    //
    if (useAdminConfig === "true") {
      try {
        const adminOffers = await getAdminConfiguredOffers(
          "shopping",
          userProfile,
          user._id.toString(),
          req,
          category
        );
        // Filter by category if specified
        let filteredOffers = adminOffers;
        if (category && category !== "all") {
          filteredOffers = adminOffers.filter((offer) => {
            const offerCategory =
              offer.primary_category || offer.category || "";
            return offerCategory.toLowerCase().includes(category.toLowerCase());
          });
        }

        if (filteredOffers.length > 0) {
          // Filter out offers that are not available (no fresh URL)
          shoppingOffers = filteredOffers.filter((offer) => offer.isAvailable);
          source = "admin_configured";
        }
      } catch (configError) {
        console.error(
          "Error fetching admin-configured shopping offers:",
          configError
        );
      }
    }

    // Step 2: Fallback to BitLab API
    if (shoppingOffers.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getShoppingOffers({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        category,
      });


      if (result.success && result.categorized?.shopping) {
        // Preserve exact Bitlabs API structure for shopping
        shoppingOffers = result.categorized.shopping.map((s) => ({
          ...s, // Preserve all original Bitlabs fields
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = shoppingOffers.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        shopping: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: shoppingOffers.length,
          pages: Math.ceil(shoppingOffers.length / parseInt(limit)),
        },
        totalShopping: shoppingOffers.length,
        estimatedEarnings: shoppingOffers.reduce(
          (sum, s) => sum + (s.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting shopping offers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get shopping offers",
    });
  }
});

/**
 * POST /api/non-game-offers/click
 * Track offer click
 */
router.post("/click", protect, async (req, res) => {
  try {
    const { offerId, offerType } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: "offerId is required",
      });
    }

    const result = await bitlabsNonGames.trackOfferClick({
      userId: user._id.toString(),
      offerId,
      offerType: offerType || "other",
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to track offer click",
      });
    }

    res.json({
      success: true,
      data: {
        trackingId: result.trackingId,
        message: result.message,
      },
    });
  } catch (error) {
    console.error("Error tracking offer click:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track offer click",
    });
  }
});

/**
 * POST /api/non-game-offers/complete
 * Track offer completion and award rewards
 */
router.post("/complete", protect, async (req, res) => {
  try {
    const { offerId, offerType, completionData, reward } = req.body;
    const user = await User.findById(req.user.userId).select("wallet xp");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: "offerId is required",
      });
    }

    // Track completion
    const trackingResult = await bitlabsNonGames.trackCompletion({
      userId: user._id.toString(),
      offerId,
      offerType: offerType || "other",
      completionData,
      reward,
    });

    if (!trackingResult.success) {
      return res.status(500).json({
        success: false,
        error: trackingResult.error || "Failed to track offer completion",
      });
    }

    // Award rewards if provided
    const finalReward = reward || trackingResult.reward || 0;
    if (finalReward > 0) {
      const coins = Math.round(finalReward);
      const baseXp = Math.round(finalReward * 0.5);

      // Update user wallet and XP
      user.wallet.balance = (user.wallet.balance || 0) + coins;
      user.wallet.lastUpdated = new Date();

      const { finalXP, multiplier: tierMultiplier } =
        await applyTierMultiplierToXP(user, baseXp);

      user.xp.current = (user.xp.current || 0) + finalXP;
      user.xp.total = (user.xp.total || 0) + finalXP;

      // Create transaction record
      const transaction = new Transaction({
        user: user._id,
        type: "credit",
        amount: coins,
        description: `Non-game offer completed - ${offerType || "offer"}`,
        status: "completed",
        referenceId: offerId,
      });

      await Promise.all([user.save(), transaction.save()]);

      res.json({
        success: true,
        data: {
          message: "Offer completed successfully!",
          reward: {
            coins,
            xp: finalXP,
          },
          newBalance: user.wallet.balance,
          newXP: user.xp.current,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          message: "Offer completion tracked",
          reward: {
            coins: 0,
            xp: 0,
          },
        },
      });
    }
  } catch (error) {
    console.error("Error tracking offer completion:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track offer completion",
    });
  }
});

/**
 * POST /api/non-game-offers/callback/bitlabs
 * Webhook endpoint for Bitlabs callbacks
 *
 * INDUSTRIAL-LEVEL IMPLEMENTATION:
 * - Bitlabs sends callback when user completes any offer (survey, cashback, magic receipt, shopping)
 * - userId in callback matches X-User-Id used to generate click URL
 * - This ensures proper user tracking and reward attribution
 * - HMAC signature verification prevents fraud
 * - Supports all non-gaming offer types: surveys, cashback, magic receipts, shopping
 *
 * Reference: BITLABS_INDUSTRIAL_SOLUTION.md
 */
router.post("/callback/bitlabs", async (req, res) => {
  try {
    // 🔵 DEBUG: Log incoming callback request
    console.log(
      "\n🔵 [CALLBACK] ========== BITLABS CALLBACK RECEIVED =========="
    );
    console.log(
      "🔵 [CALLBACK] 📥 Raw Request Body:",
      JSON.stringify(req.body, null, 2)
    );
    console.log("🔵 [CALLBACK] 📥 Request Headers:", {
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
      ip: req.ip || req.connection.remoteAddress,
    });
    console.log("🔵 [CALLBACK] ⏰ Timestamp:", new Date().toISOString());
    console.log("🔵 [CALLBACK] ===========================================\n");

    const { signature, ...callbackData } = req.body;

    // 🔵 DEBUG: Log callback data before verification
    console.log("🔵 [CALLBACK] 📋 Callback Data (before verification):", {
      userId: callbackData.userId,
      offerId: callbackData.offerId,
      status: callbackData.status,
      value: callbackData.value,
      reward: callbackData.reward,
      hasSignature: !!signature,
    });

    // Verify callback signature (HMAC verification prevents fraud)
    const verification = await bitlabsNonGames.verifyCallback({
      callbackData,
      signature,
    });

    // 🔵 DEBUG: Log verification result
    console.log("🔵 [CALLBACK] 🔐 Signature Verification Result:", {
      success: verification.success,
      isValid: verification.isValid,
      message: verification.message,
    });

    if (!verification.success || !verification.isValid) {
      console.error("❌ [CALLBACK] ========== INVALID SIGNATURE ==========");
      console.error("❌ [CALLBACK] Invalid signature:", {
        offerId: callbackData.offerId,
        userId: callbackData.userId,
        status: callbackData.status,
        verificationResult: verification,
      });
      console.error(
        "❌ [CALLBACK] ===========================================\n"
      );
      return res.status(400).json({
        success: false,
        error: "Invalid callback signature",
      });
    }

    // Process callback data
    const { userId, offerId, reward, status, value } = callbackData;

    // 🔵 DEBUG: Log valid callback details
    console.log("✅ [CALLBACK] ========== VALID CALLBACK RECEIVED ==========");
    console.log("✅ [CALLBACK] ✅ Signature verified successfully");
    console.log("✅ [CALLBACK] 📋 Callback Details:", {
      userId,
      offerId,
      status,
      value,
      reward,
      timestamp: new Date().toISOString(),
    });
    console.log("✅ [CALLBACK] ===========================================\n");

    // 🔵 DEBUG: Handle all statuses with detailed logging
    if (!userId || !offerId) {
      console.warn(
        "⚠️ [CALLBACK] ========== MISSING REQUIRED FIELDS =========="
      );
      console.warn("⚠️ [CALLBACK] Missing userId or offerId:", {
        hasUserId: !!userId,
        hasOfferId: !!offerId,
        callbackData,
      });
      console.warn(
        "⚠️ [CALLBACK] ===========================================\n"
      );

      return res.json({
        success: true,
        message: "Callback received but missing required fields",
      });
    }

    // Find user first (needed for all statuses)
    const user = await User.findById(userId).select("wallet xp");

    if (!user) {
      console.error("❌ [CALLBACK] ========== USER NOT FOUND ==========");
      console.error("❌ [CALLBACK] User ID from callback:", userId);
      console.error("❌ [CALLBACK] Survey ID:", offerId);
      console.error("❌ [CALLBACK] Status:", status);
      console.error(
        "❌ [CALLBACK] ===========================================\n"
      );

      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // 🔵 DEBUG: Log user found
    console.log("✅ [CALLBACK] User found:", {
      userId: user._id.toString(),
      currentBalance: user.wallet?.balance || 0,
      currentXP: user.xp?.current || 0,
    });

    // Initialize coins variable for logging
    let coins = 0;

    // Handle different callback statuses
    if (status === "completed") {
      console.log(
        "\n🟢 [CALLBACK] ========== PROCESSING COMPLETED OFFER =========="
      );
      console.log("🟢 [CALLBACK] Offer Status: COMPLETED");
      console.log("🟢 [CALLBACK] Offer ID:", offerId);
      console.log("🟢 [CALLBACK] User will receive reward");
      console.log(
        "🟢 [CALLBACK] ===========================================\n"
      );

      // Determine reward amount:
      // 1. Check if admin-configured offer exists (surveys, cashback, magic receipts, shopping)
      //    Use coinReward from database
      // 2. Use 'value' from callback (what Bitlabs gives publisher)
      // 3. Fallback to 'reward' from callback

      try {
        const SurveySDK = require("../models/SurveySDK");
        const SurveyOffer = require("../models/SurveyOffer");
        const NonGameOffer = require("../models/NonGameOffer");

        const bitlabSDK = await SurveySDK.findOne({
          name: { $regex: /bitlab/i },
        });

        if (bitlabSDK) {
          // Check SurveyOffer first (for surveys)
          let configuredOffer = await SurveyOffer.findOne({
            sdkId: bitlabSDK._id,
            externalId: offerId,
            offerType: "survey",
            status: "live",
          });

          // If not found in SurveyOffer, check NonGameOffer (for cashback, magic receipts, shopping)
          if (!configuredOffer) {
            configuredOffer = await NonGameOffer.findOne({
              sdkId: bitlabSDK._id,
              externalId: offerId,
              status: "live",
            });
          }

          if (configuredOffer) {
            // Use admin-configured reward (may be adjusted from original 'value')
            coins = configuredOffer.coinReward || 0;
            const offerType = configuredOffer.offerType || "unknown";
            console.log(
              `✅ Using admin-configured reward: ${coins} coins for ${offerType} offer ${offerId}`
            );
          }
        }
      } catch (configError) {
        console.error("Error checking admin-configured offer:", configError);
      }

      // If no admin config, use Bitlabs callback data
      if (coins === 0) {
        // Priority: 'value' field (what Bitlabs gives publisher)
        if (value) {
          coins = parseFloat(value) || 0;
          console.log(
            `✅ Using 'value' from callback: ${coins} coins for survey ${offerId}`
          );
        } else if (reward) {
          // Fallback to 'reward' field
          coins = Math.round(reward);
          console.log(
            `✅ Using 'reward' from callback: ${coins} coins for survey ${offerId}`
          );
        }
      }

      if (coins > 0) {
        // 🔵 DEBUG: Log reward calculation
        console.log("🟢 [CALLBACK] 💰 Reward Calculation:", {
          coins,
          source: configuredOffer ? "admin_config" : "bitlabs_callback",
          valueFromCallback: value,
          rewardFromCallback: reward,
        });

        // FIX: Change 'xp' to 'baseXp' to match line 1348
        const baseXp = Math.round(coins * 0.5); // 50% of coins as XP

        console.log("🟢 [CALLBACK] 📊 XP Calculation:", {
          baseXp,
          coins,
          formula: "coins × 0.5",
        });

        // Store balance before update
        const balanceBefore = user.wallet.balance || 0;
        const xpBefore = user.xp.current || 0;

        // Update wallet
        user.wallet.balance = balanceBefore + coins;
        user.wallet.lastUpdated = new Date();

        // Calculate XP with tier multiplier
        const {
          finalXP,
          multiplier: tierMultiplier,
          tier,
        } = await applyTierMultiplierToXP(user, baseXp);

        console.log("🟢 [CALLBACK] 🎯 Tier Multiplier Applied:", {
          baseXp,
          tierMultiplier,
          tier,
          finalXP,
          formula: `baseXp × ${tierMultiplier} = ${finalXP}`,
        });

        // Update XP
        user.xp.current = xpBefore + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        // 🔵 DEBUG: Log before creating transaction
        console.log("🟢 [CALLBACK] 💾 Creating Transaction:", {
          userId: user._id.toString(),
          type: "credit",
          amount: coins,
          description: `Bitlabs non-game offer completed - ${offerId}`,
        });

        const transaction = new Transaction({
          user: user._id,
          type: "credit",
          amount: coins,
          balanceType: "coins",
          description: `Bitlabs non-game offer completed - ${offerId}`,
          status: "completed",
          referenceId: offerId,
          metadata: {
            source: "bitlabs_callback",
            offerType: "non_game_offer", // Supports surveys, cashback, magic receipts, shopping
            bitlabsStatus: status,
            rewardCoins: coins,
            xpEarned: finalXP,
            tierMultiplier,
            tier,
          },
        });

        // Save user and transaction
        await Promise.all([user.save(), transaction.save()]);

        // 🔵 DEBUG: Log final reward summary
        console.log(
          "🟢 [CALLBACK] ========== REWARD AWARDED SUCCESSFULLY =========="
        );
        console.log("🟢 [CALLBACK] ✅ User:", userId);
        console.log("🟢 [CALLBACK] ✅ Survey:", offerId);
        console.log("🟢 [CALLBACK] 💰 Coins:", {
          before: balanceBefore,
          awarded: coins,
          after: user.wallet.balance,
        });
        console.log("🟢 [CALLBACK] ⭐ XP:", {
          before: xpBefore,
          baseXP: baseXp,
          tierMultiplier: tierMultiplier,
          finalXP: finalXP,
          after: user.xp.current,
        });
        console.log("🟢 [CALLBACK] 📝 Transaction ID:", transaction._id);
        console.log(
          "🟢 [CALLBACK] ✅ User tracking verified (userId matches X-User-Id from click URL)"
        );
        console.log(
          "🟢 [CALLBACK] ===========================================\n"
        );
      } else {
        console.warn(
          "\n⚠️ [CALLBACK] ========== NO REWARD AMOUNT FOUND =========="
        );
        console.warn("⚠️ [CALLBACK] Survey:", offerId);
        console.warn("⚠️ [CALLBACK] User:", userId);
        console.warn("⚠️ [CALLBACK] Status:", status);
        console.warn("⚠️ [CALLBACK] Callback Data:", callbackData);
        console.warn(
          "⚠️ [CALLBACK] Reason: No reward amount found (coins = 0)"
        );
        console.warn(
          "⚠️ [CALLBACK] ===========================================\n"
        );
      }
    } else if (status === "screened_out") {
      // 🔵 DEBUG: Log screened out status
      console.log("\n🟡 [CALLBACK] ========== USER SCREENED OUT ==========");
      console.log("🟡 [CALLBACK] ⚠️ Survey Status: SCREENED_OUT");
      console.log("🟡 [CALLBACK] 📋 Details:", {
        userId,
        offerId,
        status,
        value,
        reward,
      });
      console.log("🟡 [CALLBACK] ℹ️ User did not qualify for this survey");
      console.log(
        "🟡 [CALLBACK] ℹ️ No reward will be awarded (expected behavior)"
      );
      console.log("🟡 [CALLBACK] ℹ️ User can try other available surveys");
      console.log(
        "🟡 [CALLBACK] ===========================================\n"
      );
    } else if (status === "rejected") {
      // 🔵 DEBUG: Log rejected status
      console.log("\n🟡 [CALLBACK] ========== SURVEY REJECTED ==========");
      console.log("🟡 [CALLBACK] ⚠️ Survey Status: REJECTED");
      console.log("🟡 [CALLBACK] 📋 Details:", {
        userId,
        offerId,
        status,
        value,
        reward,
      });
    } else {
      // 🔵 DEBUG: Log unknown status
      console.log("\n🟠 [CALLBACK] ========== UNKNOWN STATUS ==========");
      console.log("🟠 [CALLBACK] ⚠️ Survey Status:", status);
      console.log("🟠 [CALLBACK] 📋 Details:", {
        userId,
        offerId,
        status,
        value,
        reward,
        allCallbackData: callbackData,
      });
      console.log(
        "🟠 [CALLBACK] ℹ️ Unknown status - no reward will be awarded"
      );
      console.log(
        "🟠 [CALLBACK] ===========================================\n"
      );
    }

    // 🔵 DEBUG: Log callback processing completion
    console.log(
      "✅ [CALLBACK] ========== CALLBACK PROCESSING COMPLETE =========="
    );
    console.log("✅ [CALLBACK] ✅ Callback processed successfully");
    console.log("✅ [CALLBACK] 📋 Summary:", {
      userId,
      offerId,
      status,
      rewardAwarded: status === "completed" && coins > 0,
    });
    console.log("✅ [CALLBACK] ⏰ Completed at:", new Date().toISOString());
    console.log("✅ [CALLBACK] ===========================================\n");

    res.json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    // 🔴 DEBUG: Log callback processing error
    console.error(
      "\n🔴 [CALLBACK] ========== CALLBACK PROCESSING ERROR =========="
    );
    console.error("🔴 [CALLBACK] ❌ Error Type:", error.constructor.name);
    console.error("🔴 [CALLBACK] ❌ Error Message:", error.message);
    console.error("🔴 [CALLBACK] ❌ Error Stack:", error.stack);
    console.error(
      "🔴 [CALLBACK] ❌ Request Body:",
      JSON.stringify(req.body, null, 2)
    );
    console.error("🔴 [CALLBACK] ❌ Callback Data:", {
      userId: req.body?.userId,
      offerId: req.body?.offerId,
      status: req.body?.status,
    });
    console.error(
      "🔴 [CALLBACK] ===========================================\n"
    );

    res.status(500).json({
      success: false,
      error: "Failed to process callback",
    });
  }
});

module.exports = router;

module.exports = router;
