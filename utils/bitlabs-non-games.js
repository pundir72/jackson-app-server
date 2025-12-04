/**
 * Bitlabs Non-Game Offers Utility
 * Handles surveys, magic receipts, cashback, and shopping offers from Bitlabs
 * @module utils/bitlabs-non-games
 */

const bitlabsService = require("../services/bitlabs.service");
const bitlabsOfferCache = require("../utils/bitlabsOfferCache");

/**
 * Get non-game offers (surveys, magic receipts, cashback, shopping)
 * Uses dedicated Bitlabs endpoints: /v2/client/surveys and /v1/client/cashback/offers
 * @param {Object} params - Parameters
 * @param {string} params.userId - User ID
 * @param {Object} params.userProfile - User profile data
 * @param {string} params.type - Offer type: 'survey', 'magic_receipt', 'cashback', 'shopping', or 'all'
 * @param {string} params.category - Category filter
 * @returns {Promise<Object>} Non-game offers result
 */
async function getNonGameOffers(params = {}) {
  try {
    const {
      userId,
      userProfile = {},
      type = "all",
      category,
      devices,
    } = params;

    console.log(
      "🟠 [BITLABS UTILITY] ========== getNonGameOffers called =========="
    );
    console.log("🟠 [BITLABS UTILITY] Input params:", {
      userId,
      userProfile,
      type,
      category,
      devices,
    });
    console.log("🟠 [BITLABS UTILITY] Building queryParams for Bitlabs API...");

    // Build query parameters
    const queryParams = {};

    // Add device filter based on user profile or devices parameter (required for most offers)
    if (userProfile.platform) {
      queryParams.platform = userProfile.platform;
    } else if (devices && devices.length > 0) {
      // Convert devices array to platform
      const devicesArray = Array.isArray(devices) ? devices : [devices];
      if (devicesArray.includes("android") && devicesArray.includes("iphone")) {
        queryParams.platform = "mobile";
      } else if (devicesArray.includes("android")) {
        queryParams.platform = "android";
      } else if (devicesArray.includes("iphone")) {
        queryParams.platform = "ios";
      } else if (devicesArray.includes("ipad")) {
        queryParams.platform = "ipad";
      } else {
        queryParams.platform = "mobile";
      }
    } else {
      // Default to mobile (both iOS and Android) for admin/testing
      queryParams.platform = "mobile";
    }

    // Add devices array to queryParams for general offers API (shopping, magic receipts)
    // This ensures the /v2/client/offers endpoint gets devices filter
    if (devices && devices.length > 0) {
      queryParams.devices = Array.isArray(devices) ? devices : [devices];
    }

    // Add country if available (CRITICAL: offers are often country-specific)
    // If testing from India but offers target US/UK, you'll get empty results
    if (userProfile.country) {
      queryParams.country = userProfile.country;
    } else {
      // Default to US for admin/testing if no country specified
      // Change this to "IN" if you want to test with India-targeted offers
      queryParams.country = "US";
      console.log(
        `⚠️ No country specified in userProfile. Defaulting to "US" for testing.`
      );
      console.log(
        `   If offers are targeted to other countries (e.g., India), specify country in userProfile.`
      );
    }

    // Add client info if available
    if (userProfile.userAgent) {
      queryParams.client_user_agent = userProfile.userAgent;
    }
    if (userProfile.ip) {
      queryParams.client_ip = userProfile.ip;
    }

    console.log(
      "🟠 [BITLABS UTILITY] Final queryParams to send to Bitlabs API:",
      JSON.stringify(queryParams, null, 2)
    );

    const categorizedOffers = {
      surveys: [],
      magicReceipts: [],
      cashback: [],
      shopping: [],
      other: [],
    };

    // Fetch from dedicated endpoints based on type
    const fetchPromises = [];

    // Fetch surveys from dedicated endpoint
    if (type === "all" || type === "survey") {
      console.log(
        "🟠 [BITLABS UTILITY] Fetching surveys with queryParams:",
        queryParams
      );
      fetchPromises.push(
        bitlabsService
          .getSurveys(queryParams, userId)
          .then((result) => {
            console.log(
              "🟠 [BITLABS UTILITY] ========== Survey API Response Received =========="
            );
            console.log("🟠 [BITLABS UTILITY] Response summary:", {
              success: result.success,
              dataCount: result.data?.length || 0,
              error: result.error,
            });
            if (result.success && result.data) {
              // Normalize surveys to add userRewardCoins and userRewardXP fields
              const normalizedSurveys = result.data.map((survey) =>
                normalizeOffer(survey, userId)
              );
              categorizedOffers.surveys = normalizedSurveys;
              console.log(
                "🟠 [BITLABS UTILITY] ✅ Added",
                normalizedSurveys.length,
                "normalized surveys to categorizedOffers"
              );
              if (normalizedSurveys.length > 0) {
                console.log("🟠 [BITLABS UTILITY] First survey sample:", {
                  id: normalizedSurveys[0]?.id,
                  value: normalizedSurveys[0]?.value,
                  cpi: normalizedSurveys[0]?.cpi,
                  country: normalizedSurveys[0]?.country,
                  userRewardCoins: normalizedSurveys[0]?.userRewardCoins,
                  userRewardXP: normalizedSurveys[0]?.userRewardXP,
                  rewardCoins: normalizedSurveys[0]?.reward?.coins,
                  rewardXP: normalizedSurveys[0]?.reward?.xp,
                });
              }
            } else {
              console.log(
                "🟠 [BITLABS UTILITY] ⚠️ No surveys in response or request failed"
              );
            }
            console.log(
              "🟠 [BITLABS UTILITY] ================================================="
            );
          })
          .catch((err) => {
            console.error(
              "🟠 [BITLABS UTILITY] Error fetching surveys:",
              err.message
            );
          })
      );
    }

    // Fetch cashback from dedicated endpoint
    if (type === "all" || type === "cashback") {
      fetchPromises.push(
        bitlabsService
          .getCashbackOffers(queryParams, userId)
          .then((result) => {
            if (result.success && result.data) {
              // Return raw Bitlabs format - preserve original structure
              categorizedOffers.cashback = result.data;
            }
          })
          .catch((err) => {
            console.error("Error fetching cashback:", err.message);
          })
      );
    }

    // Fetch other non-game offers (magic receipts, shopping) from /v2/client/offers with is_game=false
    if (
      type === "all" ||
      type === "magic_receipt" ||
      type === "shopping" ||
      type === "other"
    ) {
      const offersQueryParams = {
        is_game: false,
        ...queryParams,
        // Ensure devices array is included for /v2/client/offers endpoint
        devices: devices || queryParams.devices || undefined,
        // CRITICAL: Ensure country is included for non-game offers (Bitlabs API requires it)
        country: queryParams.country || "US",
      };

      fetchPromises.push(
        bitlabsOfferCache
          .getOffers(offersQueryParams)
          .then((offers) => {
            offers.forEach((offer) => {
              const offerType = getOfferType(offer);

              // Skip surveys and cashback (already fetched from dedicated endpoints)
              if (offerType === "survey" || offerType === "cashback") {
                return;
              }

              // Preserve raw Bitlabs format - preserve ALL original fields
              // Add minimal metadata and camelCase aliases (same as surveys)
              const offerWithType = {
                ...offer, // Preserve ALL original Bitlabs fields (country, cpi, cr, language, loi, rating, tags, value, etc.)
                // Add minimal metadata for categorization (don't override existing fields)
                type: offer.type || offerType,
                provider: offer.provider || "bitlabs",
                sdkProvider: offer.sdkProvider || "bitlabs",
                // Ensure these fields exist (use original if present, otherwise add camelCase versions)
                offerId:
                  offer.offerId ||
                  offer.id?.toString() ||
                  offer.offer_id?.toString(),
                // Preserve original field names but also add camelCase aliases for compatibility (same as surveys)
                clickUrl: offer.clickUrl || offer.click_url || "",
                deepLink:
                  offer.deepLink || offer.deep_link || offer.click_url || "",
                supportUrl: offer.supportUrl || offer.support_url || "",
                estimatedTime:
                  offer.estimatedTime ||
                  offer.estimated_time ||
                  offer.duration ||
                  0,
                confirmationTime:
                  offer.confirmationTime || offer.confirmation_time || "",
                pendingTime: offer.pendingTime || offer.pending_time || 0,
                offerExpiresAt:
                  offer.offerExpiresAt || offer.offer_expires_at || null,
                sessionHours: offer.sessionHours || offer.session_hours || 0,
                isSticky:
                  offer.isSticky !== undefined
                    ? offer.isSticky
                    : offer.is_sticky || false,
                isAvailable:
                  offer.isAvailable !== undefined
                    ? offer.isAvailable
                    : offer.is_available !== false,
                mobileVerificationRequired:
                  offer.mobileVerificationRequired !== undefined
                    ? offer.mobileVerificationRequired
                    : offer.mobile_verification_required || false,
                webToMobile:
                  offer.webToMobile !== undefined
                    ? offer.webToMobile
                    : offer.web_to_mobile || false,
                webToMobileDevices:
                  offer.webToMobileDevices || offer.web_to_mobile_devices || [],
                thingsToKnow: offer.thingsToKnow || offer.things_to_know || [],
              };

              switch (offerType) {
                case "magic_receipt":
                  categorizedOffers.magicReceipts.push(offerWithType);
                  break;
                case "shopping":
                  categorizedOffers.shopping.push(offerWithType);
                  break;
                default:
                  categorizedOffers.other.push(offerWithType);
              }
            });
          })
          .catch((err) => {
            console.error("Error fetching other non-game offers:", err.message);
          })
      );
    }

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    // Combine all offers
    const allOffers = [
      ...categorizedOffers.surveys,
      ...categorizedOffers.magicReceipts,
      ...categorizedOffers.cashback,
      ...categorizedOffers.shopping,
      ...categorizedOffers.other,
    ];

    // Filter by type if specified
    let filteredOffers = allOffers;
    if (type !== "all") {
      filteredOffers = allOffers.filter((offer) => offer.type === type);
    }

    // Filter by category if specified
    if (category && category !== "all") {
      filteredOffers = filteredOffers.filter((offer) => {
        // Handle both raw Bitlabs format (category as object) and string format
        let offerCategory = "";
        if (typeof offer.category === "object" && offer.category !== null) {
          offerCategory =
            offer.category.name || offer.category.name_internal || "";
        } else {
          offerCategory = offer.category || "";
        }
        return offerCategory.toLowerCase().includes(category.toLowerCase());
      });
    }

    // Calculate totals
    const totalOffers = filteredOffers.length;
    const estimatedEarnings = filteredOffers.reduce((sum, offer) => {
      // Handle both raw Bitlabs format and normalized format
      const reward = offer.reward || {};
      const coins = reward.coins !== undefined ? parseFloat(reward.coins) : 0;
      return sum + (isNaN(coins) ? 0 : coins);
    }, 0);

    const result = {
      success: true,
      offers: filteredOffers,
      categorized: categorizedOffers,
      totalOffers,
      estimatedEarnings,
      breakdown: {
        surveys: categorizedOffers.surveys.length,
        magicReceipts: categorizedOffers.magicReceipts.length,
        cashback: categorizedOffers.cashback.length,
        shopping: categorizedOffers.shopping.length,
        other: categorizedOffers.other.length,
      },
    };

    console.log("🟠 [BITLABS UTILITY] ========== Returning result ==========");
    console.log("🟠 [BITLABS UTILITY] Result summary:", {
      success: result.success,
      totalOffers: result.totalOffers,
      surveysCount: result.breakdown.surveys,
      cashbackCount: result.breakdown.cashback,
      shoppingCount: result.breakdown.shopping,
      magicReceiptsCount: result.breakdown.magicReceipts,
      otherCount: result.breakdown.other,
      estimatedEarnings: result.estimatedEarnings,
    });
    console.log("🟠 [BITLABS UTILITY] ======================================");

    return result;
  } catch (error) {
    console.error("Error getting non-game offers:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch non-game offers",
      offers: [],
      categorized: {
        surveys: [],
        magicReceipts: [],
        cashback: [],
        shopping: [],
        other: [],
      },
      totalOffers: 0,
      estimatedEarnings: 0,
    };
  }
}

/**
 * Get surveys specifically
 * Uses dedicated Bitlabs endpoint: /v2/client/surveys
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Survey offers result
 */
async function getSurveys(params = {}) {
  // Extract params at function level so they're available in catch block
  const { userId, userProfile = {}, category } = params;

  try {
    // 🔍 DEBUG: Log input parameters
    console.log("\n🔍 ========== getSurveys() - INPUT PARAMETERS ==========");
    console.log("👤 User ID:", userId);
    console.log("👤 User Profile:", JSON.stringify(userProfile, null, 2));
    console.log("📂 Category Filter:", category);
    console.log("==================================================\n");

    const queryParams = {};

    // Add platform parameter (required for surveys)
    if (userProfile.platform) {
      queryParams.platform = userProfile.platform;
    } else {
      // Default to mobile if not specified (same as getNonGameOffers)
      queryParams.platform = "mobile";
    }

    // CRITICAL: Add country parameter (surveys are country-specific)
    // FIX: Add default country like getNonGameOffers() does
    if (userProfile.country) {
      queryParams.country = userProfile.country;
    } else {
      // Default to US for testing (same as getNonGameOffers)
      queryParams.country = "US";
      console.log(
        `⚠️ No country specified in userProfile. Defaulting to "US" for surveys.`
      );
      console.log(
        `   If surveys are targeted to other countries (e.g., India), specify country in userProfile.`
      );
    }

    // Add SDK parameter (recommended by Bitlabs, same as getNonGameOffers)
    queryParams.sdk = "CUSTOM"; // Default for backend API integration

    // NOTE: Removed client_user_agent and client_ip - Bitlabs returns 403 Forbidden
    // Error: "Using 'client_' params is not allowed. Contact support to unlock them."
    // These parameters require special permissions from Bitlabs support.
    // If you need these, contact Bitlabs support to unlock them for your account.
    // For now, we'll work without them - surveys will still work correctly.

    // 🔍 DEBUG: Log query params being sent
    console.log("\n🔍 ========== getSurveys() - QUERY PARAMS ==========");
    console.log("📋 Query Parameters:", JSON.stringify(queryParams, null, 2));
    console.log("==================================================\n");

    const result = await bitlabsService.getSurveys(queryParams, userId);

    if (!result || !result.success) {
      return {
        success: true, // Return success with empty data instead of error
        surveys: [],
        categorized: {
          surveys: [],
          magicReceipts: [],
          cashback: [],
          shopping: [],
          other: [],
        },
        totalSurveys: 0,
        estimatedEarnings: 0,
      };
    }

    let surveys = result.data || [];

    // 🔍 DEBUG: Log raw surveys from service
    console.log(
      "\n🔍 ========== getSurveys() - RAW SURVEYS FROM SERVICE =========="
    );
    console.log(`📊 Total Surveys: ${surveys.length}`);
    if (surveys.length > 0) {
      surveys.forEach((survey, index) => {
        console.log(`\n   Survey ${index + 1} (Before Normalization):`);
        console.log(`     id: ${survey.id || "N/A"}`);
        console.log(`     value: ${survey.value || "MISSING"}`);
        console.log(`     cpi: ${survey.cpi || "MISSING"}`);
        console.log(
          `     category: ${survey.category?.name || survey.category || "N/A"}`
        );
      });
    }
    console.log("==================================================\n");

    // Filter by category if specified
    if (category && category !== "all") {
      const beforeFilter = surveys.length;
      surveys = surveys.filter((survey) => {
        const surveyCategory = survey.category || "";
        return surveyCategory.toLowerCase().includes(category.toLowerCase());
      });
      console.log(
        `🔍 Filtered by category "${category}": ${beforeFilter} → ${surveys.length} surveys`
      );
    }

    const normalizedSurveys = surveys.map((survey, index) => {
      const normalized = normalizeOffer(survey, userId);

      // 🔍 DEBUG: Log normalization for first survey
      if (index === 0) {
        console.log("\n🔍 ========== NORMALIZATION EXAMPLE ==========");
        console.log("📋 Original Survey (from Bitlabs):");
        console.log(`   value: ${survey.value}`);
        console.log(`   cpi: ${survey.cpi}`);
        console.log(`   id: ${survey.id}`);
        console.log("\n📋 Normalized Survey:");
        console.log(
          `   reward.coins: ${normalized.reward?.coins || "MISSING"}`
        );
        console.log(
          `   reward.currency: ${normalized.reward?.currency || "MISSING"}`
        );
        console.log(`   reward.xp: ${normalized.reward?.xp || "MISSING"}`);
        console.log(
          `   publisherRevenue.cpi: ${
            normalized.publisherRevenue?.cpi || "MISSING"
          }`
        );
        console.log(
          `   publisherRevenue.value: ${
            normalized.publisherRevenue?.value || "MISSING"
          }`
        );
        console.log("==================================================\n");
      }

      return normalized;
    });

    const estimatedEarnings = normalizedSurveys.reduce(
      (sum, s) => sum + (s.reward?.coins || 0),
      0
    );

    // 🔍 DEBUG: Log final result
    console.log("\n🔍 ========== getSurveys() - FINAL RESULT ==========");
    console.log(`📊 Total Normalized Surveys: ${normalizedSurveys.length}`);
    console.log(`💰 Estimated Earnings: ${estimatedEarnings} coins`);
    normalizedSurveys.forEach((survey, index) => {
      console.log(`\n   Survey ${index + 1}:`);
      console.log(`     id: ${survey.id || survey.offerId || "N/A"}`);
      console.log(`     reward.coins: ${survey.reward?.coins || "MISSING"}`);
      console.log(
        `     publisherRevenue.cpi: ${
          survey.publisherRevenue?.cpi || "MISSING"
        }`
      );
      console.log(
        `     publisherRevenue.value: ${
          survey.publisherRevenue?.value || "MISSING"
        }`
      );
    });
    console.log("==================================================\n");

    return {
      success: true,
      surveys: normalizedSurveys,
      categorized: {
        surveys: normalizedSurveys,
        magicReceipts: [],
        cashback: [],
        shopping: [],
        other: [],
      },
      totalSurveys: normalizedSurveys.length,
      estimatedEarnings,
    };
  } catch (error) {
    // 🔴 ENHANCED ERROR LOGGING: Log full error details
    console.error(
      "\n🔴 [BITLABS UTILITY] ========== getSurveys() ERROR =========="
    );
    console.error(
      "🔴 [BITLABS UTILITY] ❌ Error Type:",
      error.constructor.name
    );
    console.error("🔴 [BITLABS UTILITY] ❌ Error Message:", error.message);
    console.error(
      "🔴 [BITLABS UTILITY] ❌ Error Status:",
      error.response?.status || error.status || "N/A"
    );
    console.error(
      "🔴 [BITLABS UTILITY] ❌ Full Error Response:",
      JSON.stringify(error.response?.data || error.data || {}, null, 2)
    );
    if (error.response?.data?.error) {
      console.error(
        "🔴 [BITLABS UTILITY] ❌ Error Details:",
        JSON.stringify(error.response.data.error, null, 2)
      );
    }
    console.error(
      "🔴 [BITLABS UTILITY] ❌ User ID:",
      params.userId || userId || "N/A"
    );
    console.error(
      "🔴 [BITLABS UTILITY] ❌ User Profile:",
      JSON.stringify(userProfile, null, 2)
    );
    console.error(
      "🔴 [BITLABS UTILITY] ==================================================\n"
    );

    // Return success with empty data instead of error (to prevent breaking user flow)
    return {
      success: true,
      surveys: [],
      categorized: {
        surveys: [],
        magicReceipts: [],
        cashback: [],
        shopping: [],
        other: [],
      },
      totalSurveys: 0,
      estimatedEarnings: 0,
    };
  }
}

/**
 * Get magic receipts
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Magic receipt offers result
 */
async function getMagicReceipts(params = {}) {
  return getNonGameOffers({ ...params, type: "magic_receipt" });
}

/**
 * Get cashback offers
 * Uses dedicated Bitlabs endpoint: /v1/client/cashback/offers
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Cashback offers result
 */
async function getCashbackOffers(params = {}) {
  try {
    const { userId, userProfile = {}, category } = params;

    const queryParams = {};

    // Add platform/device filter (required for most offers)
    if (userProfile.platform) {
      queryParams.platform = userProfile.platform;
    } else {
      // Default to mobile (both iOS and Android) for admin/testing
      queryParams.platform = "mobile";
    }

    if (userProfile.userAgent) {
      queryParams.client_user_agent = userProfile.userAgent;
    }
    if (userProfile.ip) {
      queryParams.client_ip = userProfile.ip;
    }

    // Add country if available (CRITICAL: offers are often country-specific)
    // If testing from India but offers target US/UK, you'll get empty results
    if (userProfile.country) {
      queryParams.country = userProfile.country;
    } else {
      // Default to US for admin/testing if no country specified
      // Change this to "IN" if you want to test with India-targeted offers
      queryParams.country = "US";
      console.log(
        `⚠️ No country specified for cashback. Defaulting to "US" for testing.`
      );
      console.log(
        `   If offers are targeted to India, set userProfile.country = "IN"`
      );
    }

    const result = await bitlabsService.getCashbackOffers(queryParams, userId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to fetch cashback offers",
        cashback: [],
        totalCashback: 0,
        estimatedEarnings: 0,
      };
    }

    let cashback = result.data || [];

    // Filter by category if specified
    if (category && category !== "all") {
      cashback = cashback.filter((offer) => {
        const offerCategory = offer.primary_category || offer.category || "";
        return offerCategory.toLowerCase().includes(category.toLowerCase());
      });
    }

    // For cashback: Preserve exact Bitlabs API structure (same keys and values)
    // Do NOT normalize - return raw Bitlabs response structure
    const rawCashback = cashback.map((offer) => {
      // Preserve ALL original Bitlabs fields exactly as received
      return {
        ...offer, // All original fields: cashback, click_url, country_code, currency, description, flat_payout, images, merchant_id, merchant_name, original_cashback, primary_category, rank, reward_delay_days, terms, tier_mappings, up_to
        // Only add minimal metadata for identification (don't override existing fields)
        type: offer.type || "cashback",
        provider: offer.provider || "bitlabs",
        sdkProvider: offer.sdkProvider || "bitlabs",
        // Add offerId for compatibility (use merchant_id as ID)
        offerId:
          offer.merchant_id?.toString() ||
          offer.id?.toString() ||
          offer.offer_id?.toString(),
        id:
          offer.merchant_id?.toString() ||
          offer.id?.toString() ||
          offer.offer_id?.toString(),
      };
    });

    return {
      success: true,
      cashback: rawCashback, // Return raw Bitlabs structure
      categorized: {
        surveys: [],
        magicReceipts: [],
        cashback: rawCashback, // Return raw Bitlabs structure
        shopping: [],
        other: [],
      },
      totalCashback: rawCashback.length,
      estimatedEarnings: 0, // Not calculated for raw structure
    };
  } catch (error) {
    console.error("Error getting cashback offers:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch cashback offers",
      cashback: [],
      totalCashback: 0,
      estimatedEarnings: 0,
    };
  }
}

/**
 * Get shopping offers
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Shopping offers result
 */
async function getShoppingOffers(params = {}) {
  return getNonGameOffers({ ...params, type: "shopping" });
}

/**
 * Track offer start/click
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Tracking result
 */
async function trackOfferClick(params = {}) {
  try {
    const { userId, offerId, offerType, trackingId } = params;

    // Log the click for analytics
    console.log(
      `Tracking offer click: ${offerId} by user ${userId} (type: ${offerType})`
    );

    // In the future, this could call Bitlabs tracking API
    // For now, just return success
    return {
      success: true,
      trackingId:
        trackingId ||
        `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: "Offer click tracked",
    };
  } catch (error) {
    console.error("Error tracking offer click:", error);
    return {
      success: false,
      error: error.message || "Failed to track offer click",
    };
  }
}

/**
 * Track offer completion
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Completion result
 */
async function trackCompletion(params = {}) {
  try {
    const { userId, offerId, offerType, completionData, reward } = params;

    console.log(
      `Tracking offer completion: ${offerId} by user ${userId} (type: ${offerType})`
    );

    // In the future, this could verify completion with Bitlabs API
    // For now, just return success
    return {
      success: true,
      offerId,
      reward: reward || 0,
      message: "Offer completion tracked",
    };
  } catch (error) {
    console.error("Error tracking offer completion:", error);
    return {
      success: false,
      error: error.message || "Failed to track offer completion",
    };
  }
}

/**
 * Verify callback from Bitlabs
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Verification result
 */
async function verifyCallback(params = {}) {
  try {
    const { callbackData, signature } = params;

    // Verify signature using Bitlabs service
    const isValid = bitlabsService.verifyCallbackSignature(
      callbackData,
      signature
    );

    return {
      success: true,
      isValid,
      message: isValid ? "Callback verified" : "Invalid callback signature",
    };
  } catch (error) {
    console.error("Error verifying callback:", error);
    return {
      success: false,
      isValid: false,
      error: error.message || "Failed to verify callback",
    };
  }
}

/**
 * Determine offer type from offer data
 * @param {Object} offer - Offer data
 * @returns {string} Offer type
 */
function getOfferType(offer) {
  // Check anchor/product name for keywords
  const anchor = (
    offer.anchor ||
    offer.product_name ||
    offer.name ||
    ""
  ).toLowerCase();
  const description = (offer.description || "").toLowerCase();
  const category = (offer.category || offer.genre || "").toLowerCase();

  // Survey indicators
  if (
    anchor.includes("survey") ||
    anchor.includes("poll") ||
    description.includes("survey") ||
    description.includes("questionnaire") ||
    category.includes("survey")
  ) {
    return "survey";
  }

  // Magic Receipt indicators
  if (
    anchor.includes("receipt") ||
    anchor.includes("magic receipt") ||
    description.includes("receipt") ||
    description.includes("upload receipt") ||
    category.includes("receipt")
  ) {
    return "magic_receipt";
  }

  // Cashback indicators
  if (
    anchor.includes("cashback") ||
    anchor.includes("cash back") ||
    description.includes("cashback") ||
    description.includes("cash back") ||
    category.includes("cashback")
  ) {
    return "cashback";
  }

  // Shopping indicators
  if (
    anchor.includes("shop") ||
    anchor.includes("store") ||
    anchor.includes("retail") ||
    description.includes("shopping") ||
    description.includes("purchase") ||
    category.includes("shopping") ||
    category.includes("retail")
  ) {
    return "shopping";
  }

  // Default to other
  return "other";
}

/**
 * Normalize offer data to standard format
 * Handles both offers and surveys from different Bitlabs endpoints
 * @param {Object} offer - Raw offer/survey from Bitlabs
 * @param {string} userId - User ID
 * @returns {Object} Normalized offer
 */
function normalizeOffer(offer, userId = null) {
  // If offer already has type set (from dedicated endpoints), use it
  const offerType = offer.type || getOfferType(offer);

  // Calculate user rewards with 20% margin (user gets 20% of value, admin keeps 80%)
  // Bitlabs survey response: { value: "120", cpi: "1.2", ... }
  // 'value' is what Bitlabs gives publisher - user gets 20% as reward coins
  const publisherValue = parseFloat(offer.value) || 0;
  const userRewardCoins = Math.round(publisherValue * 0.2); // 20% margin - user gets 20%
  const userRewardXP = Math.round(userRewardCoins * 0.5); // 50% of reward coins as XP

  return {
    id: offer.id || offer.offer_id || offer.surveyId,
    offerId:
      offer.id?.toString() ||
      offer.offer_id?.toString() ||
      offer.surveyId?.toString(),
    surveyId: offer.surveyId || offer.id?.toString(),
    title: offer.title || offer.anchor || offer.product_name || offer.name,
    description: offer.description || "",
    type: offerType,
    category: offer.category || offer.genre || "General",

    // Images
    icon: offer.icon || offer.icon_url || offer.creatives?.icon || "",
    banner:
      offer.banner ||
      offer.banner_url ||
      offer.creatives?.images?.["600x300"] ||
      offer.creatives?.images?.["630x315"] ||
      offer.icon_url ||
      "",

    // Rewards - Calculate with 20% user margin (user gets 20% of value, admin keeps 80%)
    reward: offer.value
      ? {
          coins: userRewardCoins, // 20% of value (20% margin)
          currency: "points",
          xp: userRewardXP, // 50% of reward coins as XP
          payout: publisherValue, // Full value from Bitlabs (for reference)
        }
      : offer.reward
      ? {
          coins: offer.reward.coins,
          currency: offer.reward.currency,
          xp: offer.reward.xp,
          payout: offer.reward.payout,
        }
      : null,

    // URLs
    clickUrl: offer.clickUrl || offer.click_url || offer.surveyUrl || "",
    surveyUrl: offer.surveyUrl || offer.click_url || "",
    deepLink: offer.deepLink || offer.click_url || "",
    supportUrl: offer.support_url || "",

    // Metadata
    estimatedTime:
      offer.estimatedTime ||
      offer.estimated_time ||
      offer.duration ||
      offer.loi ||
      0, // LOI = Length of Interview (minutes)
    confirmationTime: offer.confirmationTime || offer.confirmation_time || "",
    pendingTime: offer.pendingTime || offer.pending_time || 0,
    offerExpiresAt: offer.offer_expires_at || null,
    sessionHours: offer.session_hours || 0,

    // Publisher revenue data (from Bitlabs)
    publisherRevenue:
      offer.cpi || offer.value
        ? {
            cpi: parseFloat(offer.cpi) || 0, // USD payment from Bitlabs
            value: parseFloat(offer.value) || 0, // Points/currency received from Bitlabs
            currency: "USD",
          }
        : null,

    // Requirements
    requirements: offer.requirements || "",
    thingsToKnow: offer.things_to_know || offer.thingsToKnow || [],

    // Provider info
    provider: "bitlabs",
    sdkProvider: "bitlabs",

    // Additional fields
    funnelId: offer.funnel_id,
    productId: offer.product_id || offer.productId,
    productName: offer.product_name || offer.productName,
    isSticky: offer.is_sticky || offer.isSticky || false,
    isAvailable: offer.isAvailable !== false,
    mobileVerificationRequired: offer.mobile_verification_required || false,
    webToMobile: offer.web_to_mobile || false,
    webToMobileDevices: offer.web_to_mobile_devices || [],
    epc: offer.epc,
    lowestCapLeft: offer.lowest_cap_left,
    stats: offer.stats || {},

    // Preserve Bitlabs-specific fields
    cpi:
      offer.cpi !== undefined && offer.cpi !== null
        ? parseFloat(offer.cpi)
        : undefined, // Cost per install (USD)
    value:
      offer.value !== undefined && offer.value !== null
        ? parseFloat(offer.value)
        : undefined, // Reward value (points)
    cr:
      offer.cr !== undefined && offer.cr !== null
        ? parseFloat(offer.cr)
        : undefined, // Conversion rate (0-1, e.g., 0.078 = 7.8%)
    loi:
      offer.loi !== undefined && offer.loi !== null
        ? parseFloat(offer.loi)
        : undefined, // Length of interview (minutes)
    rating: offer.rating || undefined, // Survey rating
    country: offer.country || undefined, // Survey country
    language: offer.language || undefined, // Survey language
    tags: offer.tags || [], // Survey tags

    // User reward fields (calculated with 20% margin)
    userRewardCoins:
      publisherValue > 0 ? userRewardCoins : offer.reward?.coins || 0, // User gets 20% of value as coins
    userRewardXP:
      publisherValue > 0
        ? userRewardXP
        : offer.reward?.xp || Math.round((offer.reward?.coins || 0) * 0.5), // User gets 50% of coins as XP
  };
}

module.exports = {
  getNonGameOffers,
  getSurveys,
  getMagicReceipts,
  getCashbackOffers,
  getShoppingOffers,
  trackOfferClick,
  trackCompletion,
  verifyCallback,
};
