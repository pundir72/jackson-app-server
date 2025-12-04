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

// Helper function to get user gender
function getUserGender(user) {
  return user.onboarding?.gender || "other";
}

// Helper function to get admin-configured offers with fresh URLs from Bitlabs
// INDUSTRIAL-LEVEL SOLUTION: Fetches fresh click URLs per user (same as surveys)
async function getAdminConfiguredOffers(offerType, userProfile, userId, req) {
  try {
    const SurveySDK = require("../models/SurveySDK");
    const SurveyOffer = require("../models/SurveyOffer");
    const NonGameOffer = require("../models/NonGameOffer");

    // Find BitLab SDK
    const bitlabSDK = await SurveySDK.findOne({ name: { $regex: /bitlab/i } });

    if (!bitlabSDK) {
      return [];
    }

    let allOffers = [];

    // Handle "all" type - fetch from both models
    if (offerType === "all") {
      // Fetch surveys from SurveyOffer
      const surveyQuery = {
        sdkId: bitlabSDK._id,
        offerType: "survey",
        status: "live",
      };
      const surveys = await SurveyOffer.find(surveyQuery)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();

      // Fetch non-gaming offers from NonGameOffer
      const nonGameQuery = {
        sdkId: bitlabSDK._id,
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
        sdkId: bitlabSDK._id,
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
      allOffers = await OfferModel.find(query)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();
    }

    // Filter by user eligibility
    const eligibleOffers = allOffers.filter((offer) => {
      // Determine which model to use for eligibility check
      const isSurvey = offer.offerType === "survey";
      const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;
      const offerDoc = new OfferModel(offer);
      return offerDoc.isEligibleForUser(userProfile);
    });

    // INDUSTRIAL-LEVEL: Fetch fresh offers from Bitlabs with user's X-User-Id
    // This ensures click URLs are user-specific and properly tracked
    if (eligibleOffers.length > 0 && userId) {
      try {
        // Determine which Bitlabs API function to call based on offer type
        let bitlabsResult = null;
        const userProfileForAPI = {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req?.headers?.["user-agent"],
          ip: req?.ip || req?.connection?.remoteAddress,
        };

        if (offerType === "survey" || offerType === "surveys") {
          bitlabsResult = await bitlabsNonGames.getSurveys({
            userId: userId,
            userProfile: userProfileForAPI,
            category: userProfile.category || "all",
          });
        } else if (offerType === "cashback") {
          bitlabsResult = await bitlabsNonGames.getCashbackOffers({
            userId: userId,
            userProfile: userProfileForAPI,
            category: userProfile.category || "all",
          });
        } else if (
          offerType === "magic_receipt" ||
          offerType === "magic-receipts" ||
          offerType === "magicReceipts"
        ) {
          bitlabsResult = await bitlabsNonGames.getMagicReceipts({
            userId: userId,
            userProfile: userProfileForAPI,
            category: userProfile.category || "all",
          });
        } else if (offerType === "shopping") {
          bitlabsResult = await bitlabsNonGames.getShoppingOffers({
            userId: userId,
            userProfile: userProfileForAPI,
            category: userProfile.category || "all",
          });
        } else if (offerType === "all") {
          // For "all", fetch all types and combine
          bitlabsResult = await bitlabsNonGames.getNonGameOffers({
            userId: userId,
            userProfile: userProfileForAPI,
            type: "all",
            category: userProfile.category || "all",
          });
        }

        // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
        console.log(
          "\n🔵 [BITLABS API] ========== RAW API RESPONSE =========="
        );
        console.log("🔵 [BITLABS API] Offer Type:", offerType);
        console.log("🔵 [BITLABS API] User ID:", userId);
        console.log("🔵 [BITLABS API] Success:", bitlabsResult?.success);
        console.log(
          "🔵 [BITLABS API] Full Response:",
          JSON.stringify(bitlabsResult, null, 2)
        );
        if (bitlabsResult?.categorized) {
          console.log(
            "🔵 [BITLABS API] Surveys Count:",
            bitlabsResult.categorized.surveys?.length || 0
          );
          console.log(
            "🔵 [BITLABS API] Cashback Count:",
            bitlabsResult.categorized.cashback?.length || 0
          );
          console.log(
            "🔵 [BITLABS API] Magic Receipts Count:",
            bitlabsResult.categorized.magicReceipts?.length || 0
          );
          console.log(
            "🔵 [BITLABS API] Shopping Count:",
            bitlabsResult.categorized.shopping?.length || 0
          );
        }
        if (bitlabsResult?.surveys) {
          console.log(
            "🔵 [BITLABS API] Surveys Array Length:",
            bitlabsResult.surveys.length
          );
        }
        if (bitlabsResult?.cashback) {
          console.log(
            "🔵 [BITLABS API] Cashback Array Length:",
            bitlabsResult.cashback.length
          );
        }
        console.log(
          "🔵 [BITLABS API] ===========================================\n"
        );

        // Match admin config with fresh Bitlabs response
        if (bitlabsResult && bitlabsResult.success) {
          const freshOffers = [];

          // Get fresh offers from appropriate category
          let freshOffersList = [];
          if (offerType === "survey" || offerType === "surveys") {
            freshOffersList =
              bitlabsResult.categorized?.surveys || bitlabsResult.surveys || [];
          } else if (offerType === "cashback") {
            freshOffersList =
              bitlabsResult.categorized?.cashback ||
              bitlabsResult.cashback ||
              [];
          } else if (
            offerType === "magic_receipt" ||
            offerType === "magic-receipts" ||
            offerType === "magicReceipts"
          ) {
            freshOffersList = bitlabsResult.categorized?.magicReceipts || [];
          } else if (offerType === "shopping") {
            freshOffersList = bitlabsResult.categorized?.shopping || [];
          } else if (offerType === "all") {
            // Combine all types
            freshOffersList = [
              ...(bitlabsResult.categorized?.surveys || []),
              ...(bitlabsResult.categorized?.cashback || []),
              ...(bitlabsResult.categorized?.magicReceipts || []),
              ...(bitlabsResult.categorized?.shopping || []),
            ];
          }

          // Match each admin-configured offer with fresh Bitlabs response
          for (const configuredOffer of eligibleOffers) {
            // For cashback: match by merchant_id (stored as externalId)
            const matchingFreshOffer = freshOffersList.find((fresh) => {
              if (offerType === "cashback") {
                // For cashback, match by merchant_id
                return (
                  fresh.merchant_id?.toString() ===
                    configuredOffer.externalId ||
                  fresh.id === configuredOffer.externalId ||
                  fresh.offerId === configuredOffer.externalId
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
              // Offer not found in fresh Bitlabs response - mark as unavailable
              if (offerType === "cashback") {
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

          return freshOffers;
        }
      } catch (freshUrlError) {
        console.error("Error fetching fresh URLs from Bitlabs:", freshUrlError);
        // Fallback: return offers without fresh URLs
      }
    }

    // Fallback: return offers without fresh URLs (if fetching failed or userId not provided)
    return eligibleOffers.map((offer) => {
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
  } catch (error) {
    console.error("Error getting admin-configured offers:", error);
    return [];
  }
}

/**
 * GET /api/non-game-offers
 * Get all non-game offers (surveys, magic receipts, cashback, shopping)
 * Checks admin-configured offers first, then falls back to BitLab API
 */
router.get("/", protect, async (req, res) => {
  try {
    const {
      type = "all",
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
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
    };

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
    if (useAdminConfig === "true") {
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
        const adminOffers = await getAdminConfiguredOffers(
          offerType,
          userProfile,
          user._id.toString(),
          req
        );

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

          // Flatten all offers
          offers = adminOffers;
          source = "admin_configured";
        }
      } catch (configError) {
        console.error("Error fetching admin-configured offers:", configError);
        // Fall through to BitLab API
      }
    }

    // Step 2: Fallback to BitLab API if no admin config or if explicitly requested
    if (offers.length === 0 || useAdminConfig === "false") {
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

      // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
      console.log(
        "\n🔵 [BITLABS API] ========== RAW API RESPONSE (ALL OFFERS) =========="
      );
      console.log("🔵 [BITLABS API] Type Filter:", type);
      console.log("🔵 [BITLABS API] User ID:", user._id.toString());
      console.log("🔵 [BITLABS API] Success:", result?.success);
      console.log(
        "🔵 [BITLABS API] Full Response:",
        JSON.stringify(result, null, 2)
      );
      if (result?.categorized) {
        console.log(
          "🔵 [BITLABS API] Surveys Count:",
          result.categorized.surveys?.length || 0
        );
        console.log(
          "🔵 [BITLABS API] Cashback Count:",
          result.categorized.cashback?.length || 0
        );
        console.log(
          "🔵 [BITLABS API] Magic Receipts Count:",
          result.categorized.magicReceipts?.length || 0
        );
        console.log(
          "🔵 [BITLABS API] Shopping Count:",
          result.categorized.shopping?.length || 0
        );
      }
      if (result?.offers) {
        console.log("🔵 [BITLABS API] Total Offers:", result.offers.length);
      }
      console.log(
        "🔵 [BITLABS API] ===========================================\n"
      );

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
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = offers.slice(startIndex, endIndex);

    // Calculate totals
    const totalOffers = offers.length;
    const estimatedEarnings = offers.reduce(
      (sum, o) => sum + (o.reward?.coins || 0),
      0
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
      "xp vip profile location preferences"
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
              const bitlabsResult = await bitlabsNonGames.getSurveys({
                userId: user._id.toString(), // ← User's ID for proper tracking
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

              // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
              console.log(
                "\n🔵 [BITLABS API] ========== RAW API RESPONSE (SURVEYS) =========="
              );
              console.log("🔵 [BITLABS API] User ID:", user._id.toString());
              console.log("🔵 [BITLABS API] Success:", bitlabsResult?.success);
              console.log(
                "🔵 [BITLABS API] Full Response:",
                JSON.stringify(bitlabsResult, null, 2)
              );
              if (bitlabsResult?.surveys) {
                console.log(
                  "🔵 [BITLABS API] Surveys Array Length:",
                  bitlabsResult.surveys.length
                );
                if (bitlabsResult.surveys.length > 0) {
                  console.log(
                    "🔵 [BITLABS API] First Survey ID:",
                    bitlabsResult.surveys[0]?.id || "N/A"
                  );
                  console.log(
                    "🔵 [BITLABS API] First Survey Value:",
                    bitlabsResult.surveys[0]?.value || "N/A"
                  );
                }
              }
              if (bitlabsResult?.categorized?.surveys) {
                console.log(
                  "🔵 [BITLABS API] Categorized Surveys Count:",
                  bitlabsResult.categorized.surveys.length
                );
              }
              console.log(
                "🔵 [BITLABS API] ===========================================\n"
              );

              console.log(
                `\n🟡 [USER BACKEND] ========== BITLABS API RESPONSE ==========`
              );
              console.log(
                `🟡 [USER BACKEND] Bitlabs API Success: ${bitlabsResult.success}`
              );
              console.log(
                `🟡 [USER BACKEND] Total surveys from Bitlabs: ${
                  bitlabsResult.categorized?.surveys?.length || 0
                }`
              );
              if (bitlabsResult.categorized?.surveys) {
                bitlabsResult.categorized.surveys.forEach((survey, index) => {
                  console.log(
                    `🟡 [USER BACKEND] Bitlabs Survey ${index + 1}:`,
                    {
                      id: survey.id,
                      surveyId: survey.surveyId,
                      title: survey.title,
                      clickUrl: survey.clickUrl ? "✅ Has URL" : "❌ No URL",
                    }
                  );
                });
              }
              console.log(
                `🟡 [USER BACKEND] ===========================================\n`
              );

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

              // Only return surveys that have fresh click URLs
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
      const result = await bitlabsNonGames.getSurveys({
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

      if (result.success && result.categorized?.surveys) {
        surveys = result.categorized.surveys.map((s) => ({
          ...s,
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
        console.log(
          `✅ [USER BACKEND] Fetched ${surveys.length} surveys directly from Bitlabs (fallback)`
        );
      } else {
        console.error(
          "\n🔴 [USER BACKEND] ========== FALLBACK SURVEY FETCH FAILED =========="
        );
        console.error("🔴 [USER BACKEND] ❌ Result Success:", result.success);
        console.error("🔴 [USER BACKEND] ❌ Result Error:", result.error);
        console.error(
          "🔴 [USER BACKEND] ❌ Surveys Count:",
          result.categorized?.surveys?.length || 0
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
      "xp vip profile location preferences"
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
          req
        );
        if (adminOffers.length > 0) {
          // Filter out offers that are not available (no fresh URL)
          magicReceipts = adminOffers.filter((offer) => offer.isAvailable);
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

      // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
      console.log(
        "\n🔵 [BITLABS API] ========== RAW API RESPONSE (MAGIC RECEIPTS) =========="
      );
      console.log("🔵 [BITLABS API] User ID:", user._id.toString());
      console.log("🔵 [BITLABS API] Success:", result?.success);
      console.log(
        "🔵 [BITLABS API] Full Response:",
        JSON.stringify(result, null, 2)
      );
      if (result?.categorized?.magicReceipts) {
        console.log(
          "🔵 [BITLABS API] Magic Receipts Count:",
          result.categorized.magicReceipts.length
        );
        if (result.categorized.magicReceipts.length > 0) {
          console.log(
            "🔵 [BITLABS API] First Magic Receipt ID:",
            result.categorized.magicReceipts[0]?.id || "N/A"
          );
          console.log(
            "🔵 [BITLABS API] First Magic Receipt Value:",
            result.categorized.magicReceipts[0]?.value || "N/A"
          );
        }
      }
      console.log(
        "🔵 [BITLABS API] ===========================================\n"
      );

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
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
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
    };

    let cashbackOffers = [];
    let source = "bitlab_direct";

    //
    // INDUSTRIAL-LEVEL SOLUTION (Same as surveys):
    // - Admin configures which cashback offers to show (stores offer IDs + metadata)
    // - When user requests cashback offers, we fetch FRESH click URLs from Bitlabs with user's X-User-Id
    // - This ensures proper tracking: each user gets URLs tied to their session
    // - Bitlabs callbacks will include correct userId matching the user who clicked
    //
    // Flow:
    // 1. Get admin-configured cashback offer IDs from database
    // 2. Call Bitlabs API with user's X-User-Id to get fresh cashback offers
    // 3. Match admin config with Bitlabs response by offer ID
    // 4. Return cashback offers with fresh, user-specific click URLs
    //
    if (useAdminConfig === "true") {
      try {
        const adminOffers = await getAdminConfiguredOffers(
          "cashback",
          userProfile,
          user._id.toString(),
          req
        );
        if (adminOffers.length > 0) {
          // Filter out offers that are not available (no fresh URL)
          cashbackOffers = adminOffers.filter((offer) => offer.isAvailable);
          source = "admin_configured";
        }
      } catch (configError) {
        console.error(
          "Error fetching admin-configured cashback offers:",
          configError
        );
      }
    }

    // Step 2: Fallback to BitLab API
    if (cashbackOffers.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getCashbackOffers({
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

      // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
      console.log(
        "\n🔵 [BITLABS API] ========== RAW API RESPONSE (CASHBACK) =========="
      );
      console.log("🔵 [BITLABS API] User ID:", user._id.toString());
      console.log("🔵 [BITLABS API] Success:", result?.success);
      console.log(
        "🔵 [BITLABS API] Full Response:",
        JSON.stringify(result, null, 2)
      );
      if (result?.categorized?.cashback) {
        console.log(
          "🔵 [BITLABS API] Cashback Count:",
          result.categorized.cashback.length
        );
        if (result.categorized.cashback.length > 0) {
          console.log(
            "🔵 [BITLABS API] First Cashback ID:",
            result.categorized.cashback[0]?.id || "N/A"
          );
          console.log(
            "🔵 [BITLABS API] First Cashback Value:",
            result.categorized.cashback[0]?.value || "N/A"
          );
        }
      }
      if (result?.cashback) {
        console.log(
          "🔵 [BITLABS API] Cashback Array Length:",
          result.cashback.length
        );
      }
      console.log(
        "🔵 [BITLABS API] ===========================================\n"
      );

      if (result.success && result.categorized?.cashback) {
        // Preserve exact Bitlabs API structure for cashback
        cashbackOffers = result.categorized.cashback.map((c) => ({
          ...c, // Preserve all original Bitlabs fields
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = cashbackOffers.slice(startIndex, endIndex);

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
      "xp vip profile location preferences"
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
          req
        );
        if (adminOffers.length > 0) {
          // Filter out offers that are not available (no fresh URL)
          shoppingOffers = adminOffers.filter((offer) => offer.isAvailable);
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

      // 🔵 RAW BITLABS API RESPONSE - Direct response from third-party API
      console.log(
        "\n🔵 [BITLABS API] ========== RAW API RESPONSE (SHOPPING) =========="
      );
      console.log("🔵 [BITLABS API] User ID:", user._id.toString());
      console.log("🔵 [BITLABS API] Success:", result?.success);
      console.log(
        "🔵 [BITLABS API] Full Response:",
        JSON.stringify(result, null, 2)
      );
      if (result?.categorized?.shopping) {
        console.log(
          "🔵 [BITLABS API] Shopping Count:",
          result.categorized.shopping.length
        );
        if (result.categorized.shopping.length > 0) {
          console.log(
            "🔵 [BITLABS API] First Shopping ID:",
            result.categorized.shopping[0]?.id || "N/A"
          );
          console.log(
            "🔵 [BITLABS API] First Shopping Value:",
            result.categorized.shopping[0]?.value || "N/A"
          );
        }
      }
      console.log(
        "🔵 [BITLABS API] ===========================================\n"
      );

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
      console.log("🟡 [CALLBACK] ℹ️ Survey was rejected by Bitlabs");
      console.log(
        "🟡 [CALLBACK] ℹ️ No reward will be awarded (expected behavior)"
      );
      console.log(
        "🟡 [CALLBACK] ===========================================\n"
      );
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
