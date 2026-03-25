/**
 * Admin Non-Gaming Offers & Survey Routes
 *
 * Uses two new isolated collections:
 *   SurveyConfig         → surveyconfigs        (surveys: bitlabs, besitos)
 *   NonGamingOfferConfig → nongamingofferconfigs (cashback, shopping, magic_receipt, other: bitlabs, everflow, affise)
 *
 * Admin APIs  (adminAuth required)
 *   GET    /admin/non-gaming/fetch     – preview non-gaming offers from SDK (no DB write)
 *   GET    /admin/surveys/fetch        – preview surveys from SDK (no DB write)
 *   POST   /admin/non-gaming/sync      – save selected non-gaming offers → nongamingofferconfigs
 *   POST   /admin/surveys/sync         – save selected surveys → surveyconfigs
 *   GET    /admin/configured           – list saved offers from both collections
 *   DELETE /admin/configured/:id       – remove a saved offer
 *
 * User APIs  (protect required)
 *   GET /user/non-gaming-offers        – live docs from nongamingofferconfigs
 *   GET /user/surveys                  – live docs from surveyconfigs
 *
 * Mounted at: /api/non-gaming-survey
 */

"use strict";

const express       = require("express");
const router        = express.Router();
const { adminAuth } = require("../middleware/adminAuth");
const protect       = require("../middleware/auth");

// New isolated collections
const SurveyConfig         = require("../models/SurveyConfig");
const NonGamingOfferConfig = require("../models/NonGamingOfferConfig");

// SurveySDK — still used to record SDK registry (existing collection, untouched)
const SurveySDK = require("../models/SurveySDK");

// Coin conversion
const ConversionSettings = require("../models/ConversionSettings");

// User model — for loading age/gender at request time (JWT only carries userId)
const User = require("../models/User");

// XP tier multiplier — same logic as admin GET /xp-tiers-v2 endpoint
const XPMultiplier = require("../models/XPMultiplier");

// Default multipliers (same hardcoded fallbacks as admin-xp-tier-v2.js)
const TIER_DEFAULTS = { JUNIOR: 1.0, MID: 1.5, SENIOR: 2.0 };

function getTierKeyFromXP(xp) {
  const n = Number(xp) || 0;
  if (n >= 5000) return "SENIOR";
  if (n >= 1000) return "MID";
  return "JUNIOR";
}

async function getAccessBenefitsMultiplier(userXp) {
  const tierKey = getTierKeyFromXP(userXp);
  console.log(`[XP-MULTIPLIER] userXP=${userXp} → tierKey=${tierKey}`);
  try {
    const config = await XPMultiplier.findOne({ tier: tierKey, isActive: true }).lean();
    console.log(`[XP-MULTIPLIER] XPMultiplier DB result:`, config ? { tier: config.tier, multiplier: config.multiplier, isActive: config.isActive } : null);
    if (config && config.multiplier > 0) {
      console.log(`[XP-MULTIPLIER] Using DB multiplier: ${config.multiplier}`);
      return Number(config.multiplier);
    }
    // No active config — use same hardcoded defaults as admin endpoint
    const defaultMultiplier = TIER_DEFAULTS[tierKey] || 1.0;
    console.log(`[XP-MULTIPLIER] No active XPMultiplier for tier=${tierKey} — using default: ${defaultMultiplier}`);
    return defaultMultiplier;
  } catch (err) {
    console.error(`[XP-MULTIPLIER] ERROR reading XPMultiplier: ${err.message}`);
    return TIER_DEFAULTS[tierKey] || 1.0;
  }
}

// User always gets 40% of publisher revenue; admin keeps 60%.
const USER_SHARE = 0.40;

async function getCoinsPerDollar() {
  try {
    const s = await ConversionSettings.getActiveSettings("USD");
    return s.coinsPerDollar || 100;
  } catch (_) {
    return 100;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function categoriseOffers(offers) {
  const result = { surveys: [], cashback: [], shopping: [], magicReceipts: [], other: [] };
  offers.forEach((offer) => {
    const anchor      = (offer.anchor || offer.name || offer.merchant_name || "").toLowerCase();
    const description = (offer.description || "").toLowerCase();
    const cat         = offer.category || offer.categories?.[0] || offer.primary_category || "";
    const categoryStr = typeof cat === "object"
      ? (cat.name || cat.name_internal || "").toLowerCase()
      : (cat || "").toLowerCase();
    const hasCashbackField = offer.cashback !== undefined || offer.original_cashback !== undefined;

    if (anchor.includes("survey") || description.includes("survey") || categoryStr.includes("survey") || offer.type === "survey") {
      result.surveys.push(offer);
    } else if (offer.type === "cashback" || anchor.includes("cashback") || anchor.includes("cash back") || description.includes("cashback") || description.includes("cash back") || categoryStr.includes("cashback") || hasCashbackField || offer.merchant_name) {
      result.cashback.push(offer);
    } else if (anchor.includes("shop") || anchor.includes("store") || anchor.includes("retail") || description.includes("shopping") || description.includes("purchase") || categoryStr.includes("shopping") || categoryStr.includes("retail") || offer.type === "shopping") {
      result.shopping.push(offer);
    } else if (anchor.includes("magic receipt") || anchor.includes("receipt") || description.includes("receipt") || description.includes("upload receipt") || categoryStr.includes("receipt") || categoryStr.includes("magic receipt") || offer.type === "magic_receipt") {
      result.magicReceipts.push(offer);
    } else {
      result.other.push(offer);
    }
  });
  return result;
}

function mapCategoryEnum(raw) {
  const c = (raw || "").toLowerCase();
  if (c.includes("finance") || c.includes("banking"))            return "finance";
  if (c.includes("shopping") || c.includes("retail") || c.includes("clothing") || c.includes("fashion") || c.includes("store") || c.includes("merchant")) return "shopping";
  if (c.includes("entertainment") || c.includes("music") || c.includes("video")) return "entertainment";
  if (c.includes("technology") || c.includes("tech") || c.includes("software")) return "technology";
  if (c.includes("health") || c.includes("fitness") || c.includes("medical")) return "health";
  if (c.includes("travel") || c.includes("hotel") || c.includes("flight")) return "travel";
  if (c.includes("education") || c.includes("learning") || c.includes("course")) return "education";
  return "other";
}

function mapBesitosDevice(devices) {
  const arr = Array.isArray(devices) ? devices : (devices ? [devices] : []);
  if (arr.includes("ipad")) return "tablet";
  if (arr.includes("android") || arr.includes("iphone") || arr.includes("ios")) return "mobile";
  return "mobile";
}

async function getOrCreateSDK(nameRegex, defaults, userId) {
  let sdk = await SurveySDK.findOne({ name: { $regex: nameRegex, $options: "i" } });
  if (!sdk) {
    sdk = new SurveySDK({ ...defaults, isActive: true, createdBy: userId });
    await sdk.save();
  }
  return sdk;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Fetch non-gaming offers from SDK (preview only — no DB write)
// GET /api/non-gaming-survey/admin/non-gaming/fetch
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/non-gaming/fetch", adminAuth, async (req, res) => {
  try {
    const { sdk = "bitlabs", type = "all", country, page = 1, limit = 20 } = req.query;
    const devices = req.query.devices
      ? (Array.isArray(req.query.devices) ? req.query.devices : [req.query.devices])
      : ["android", "iphone"];

    if (sdk === "bitlabs") {
      const bitlabsService = require("../services/bitlabs.service");
      const result = await bitlabsService.getPublisherOffers({ is_game: false, country: country || "US", devices });
      if (!result.success) return res.status(500).json({ success: false, message: result.error || "Failed to fetch Bitlabs offers", data: [] });

      let offers = result.data || [];

      // Client-side device filter — BitLabs Publisher API does not filter by device server-side
      if (devices && devices.length > 0) {
        const requestedDevices = devices.map(d => String(d).toLowerCase());
        const beforeCount = offers.length;
        offers = offers.filter(offer => {
          // Check all possible device fields BitLabs may return
          const offerDevices = [
            ...(offer.devices           || []),
            ...(offer.platforms         || []),
            ...(offer.webToMobileDevices || offer.web_to_mobile_devices || []),
          ].map(d => String(d).toLowerCase());
          // If offer has no device info, include it (cannot restrict)
          if (offerDevices.length === 0) return true;
          return offerDevices.some(d => requestedDevices.includes(d));
        });
        console.log(`[device-filter] requested=${JSON.stringify(requestedDevices)} | before=${beforeCount} | after=${offers.length}`);
      }

      const categorized = categoriseOffers(offers);
      let filtered = offers;
      if (type && type !== "all") {
        if (type === "cashback")      filtered = categorized.cashback;
        else if (type === "shopping") filtered = categorized.shopping;
        else if (type === "magic_receipt" || type === "magic-receipts") filtered = categorized.magicReceipts;
        else if (type === "survey" || type === "surveys") filtered = categorized.surveys;
      }
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      return res.json({
        success: true,
        data: filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum),
        categorized: { surveys: categorized.surveys, cashback: categorized.cashback, shopping: categorized.shopping, magicReceipts: categorized.magicReceipts, other: categorized.other },
        breakdown: { surveys: categorized.surveys.length, cashback: categorized.cashback.length, shopping: categorized.shopping.length, magicReceipts: categorized.magicReceipts.length, other: categorized.other.length },
        total: filtered.length,
        timestamp: result.timestamp || new Date().toISOString(),
      });

    } else if (sdk === "everflow") {
      const everflowService = require("../services/everflow.service");
      if (!everflowService.isConfigured()) return res.status(400).json({ success: false, message: "Everflow API is not configured.", data: [] });
      const qp = { offer_status: "active" };
      if (country) qp.country = country;
      const result = await everflowService.getOffers(qp);
      if (!result.success) return res.status(500).json({ success: false, message: result.error || "Failed to fetch Everflow offers", data: [] });
      let offers = result.data || [];
      if (type && type !== "all") offers = offers.filter((o) => (o.offerType || o.type || "other") === type);
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      return res.json({ success: true, data: offers.slice((pageNum - 1) * limitNum, pageNum * limitNum), total: offers.length, timestamp: result.timestamp || new Date().toISOString() });

    } else if (sdk === "affise") {
      const affiseController = require("../controllers/affise.controller");
      return affiseController.getAdminOffers(req, res);

    } else {
      return res.status(400).json({ success: false, message: `Unsupported SDK: "${sdk}". Use: bitlabs, everflow, affise.` });
    }
  } catch (error) {
    console.error("[non-gaming/fetch]", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch non-gaming offers", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Fetch surveys from SDK (preview only — no DB write)
// GET /api/non-gaming-survey/admin/surveys/fetch
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/surveys/fetch", adminAuth, async (req, res) => {
  try {
    const { sdk = "bitlabs", country, page = 1, limit = 20 } = req.query;
    const devices = req.query.devices
      ? (Array.isArray(req.query.devices) ? req.query.devices : [req.query.devices])
      : ["android", "iphone"];

    if (sdk === "bitlabs") {
      const bitlabsService = require("../services/bitlabs.service");
      const result = await bitlabsService.getSurveys({ country, platform: "mobile" });
      if (!result.success) return res.status(500).json({ success: false, message: result.error || "Failed to fetch Bitlabs surveys", data: [] });
      let surveys = result.data || [];

      // Client-side device filter — BitLabs may not filter surveys by device server-side
      if (devices && devices.length > 0) {
        const requestedDevices = devices.map(d => String(d).toLowerCase());
        const beforeCount = surveys.length;
        surveys = surveys.filter(s => {
          const surveyDevices = [
            ...(s.devices            || []),
            ...(s.platforms          || []),
            ...(s.webToMobileDevices || s.web_to_mobile_devices || []),
          ].map(d => String(d).toLowerCase());
          if (surveyDevices.length === 0) return true;
          return surveyDevices.some(d => requestedDevices.includes(d));
        });
        console.log(`[device-filter][surveys] requested=${JSON.stringify(requestedDevices)} | before=${beforeCount} | after=${surveys.length}`);
      }

      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      return res.json({ success: true, data: surveys.slice((pageNum - 1) * limitNum, pageNum * limitNum), total: surveys.length, timestamp: result.timestamp || new Date().toISOString() });

    } else if (sdk === "besitos") {
      const besitosService = require("../services/besitos.service");
      if (!besitosService.isConfigured()) return res.status(500).json({ success: false, message: "Besitos API is not properly configured", data: [] });
      const params = { device: mapBesitosDevice(devices), user_ip: "127.0.0.1" };
      if (country) params.country = country;
      let raw;
      try { raw = await besitosService.getSurveys(params, "admin-preview"); }
      catch (err) { return res.status(500).json({ success: false, message: err.message || "Failed to fetch Besitos surveys", data: [] }); }

      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      const transformed = list.map((s) => {
        const estimatedTime   = s.length ? Math.round(s.length) : 0;
        const userRewardCoins = s.amount ? Math.round(s.amount * 0.8 * 50) : 0;
        const userRewardXP    = Math.round(userRewardCoins * 0.5);
        return { id: s.id?.toString() || "", surveyId: s.id?.toString() || "", title: s.name || `Survey ${s.id}`, description: s.description || `Earn $${s.amount || 0}`, clickUrl: s.url || "", value: s.amount ? parseFloat(s.amount) : 0, cpi: s.cpi ? parseFloat(s.cpi) : 0, loi: estimatedTime, estimatedTime, userRewardCoins, userRewardXP, reward: { coins: userRewardCoins, xp: userRewardXP, currency: s.amount_currency || "$" }, type: "survey", provider: "besitos", country: country || "" };
      });
      const pageNum  = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      return res.json({ success: true, data: transformed.slice((pageNum - 1) * limitNum, pageNum * limitNum), total: transformed.length });

    } else {
      return res.status(400).json({ success: false, message: `Unsupported SDK: "${sdk}". Use: bitlabs, besitos.` });
    }
  } catch (error) {
    console.error("[surveys/fetch]", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch surveys", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Sync non-gaming offers → nongamingofferconfigs collection
// POST /api/non-gaming-survey/admin/non-gaming/sync
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/non-gaming/sync", adminAuth, async (req, res) => {
  try {
    const { sdk = "bitlabs", offerIds = [], autoActivate = true, devices, country, targetAudience = [] } = req.body;
    if (!Array.isArray(offerIds) || offerIds.length === 0) {
      return res.status(400).json({ success: false, message: "offerIds array is required and must not be empty" });
    }

    let offersToSync = [];

    if (sdk === "bitlabs") {
      const bitlabsService = require("../services/bitlabs.service");
      const result = await bitlabsService.getPublisherOffers({
        is_game: false,
        country: country || "US",
        devices: Array.isArray(devices) && devices.length > 0 ? devices : ["android", "iphone"],
      });
      if (!result.success || !result.data) return res.status(500).json({ success: false, message: "Failed to fetch offers from Bitlabs for sync" });

      const categorized = categoriseOffers(result.data);
      const all = [
        ...categorized.cashback.map(o     => ({ ...o, offerType: "cashback" })),
        ...categorized.shopping.map(o     => ({ ...o, offerType: "shopping" })),
        ...categorized.magicReceipts.map(o => ({ ...o, offerType: "magic_receipt" })),
        ...categorized.other.map(o        => ({ ...o, offerType: "other" })),
      ];
      const idSet = new Set(offerIds.map(String));
      offersToSync = all.filter(o => idSet.has(String(o.id || o.merchant_id || o.product_id || o.offerId || "")));

    } else if (sdk === "everflow") {
      const everflowService = require("../services/everflow.service");
      if (!everflowService.isConfigured()) return res.status(400).json({ success: false, message: "Everflow API is not configured." });
      for (const id of offerIds) {
        let payload = null;
        try { const r = await everflowService.getOfferById(String(id)); if (r?.success && r?.data) payload = r.data; } catch (_) {}
        offersToSync.push({ id: String(id), offerType: payload?.offerType || payload?.type || "other", title: payload?.title || payload?.name || `Everflow Offer ${id}`, description: payload?.description || "", category: payload?.category || "other", coinReward: 30, estimatedTime: 0, ...(payload || {}) });
      }

    } else if (sdk === "affise") {
      const affiseService = require("../services/affise.service");
      const stripHtml = (str) => (str ? str.replace(/<[^>]*>/g, "").trim() : "");
      let affiseResult;
      try { affiseResult = await affiseService.getOffers({ "status[]": "active" }, { admin: true }); } catch (_) {}
      const allAffise = affiseResult?.data || [];
      const idSet = new Set(offerIds.map(String));
      for (const raw of allAffise) {
        const rawId = String(raw.id || raw.offer_id || "");
        if (!idSet.has(rawId)) continue;
        const cpi = parseFloat(raw.payments?.[0]?.revenue ?? 0) || 0;
        const userRewardCoins = Math.round(cpi * 0.5);
        const userRewardXP    = Math.round(userRewardCoins * 0.5);
        offersToSync.push({
          id:             rawId,
          offerType:      "other",
          title:          raw.title || `Affise Offer ${rawId}`,
          description:    stripHtml(raw.description_lang?.en) || "",
          click_url:      raw.link || raw.links?.[0]?.url || "",
          logo:           raw.logo || raw.logo_source || "",
          preview_url:    raw.preview_url || "",
          category:       raw.categories?.[0]?.name || "other",
          cpi,
          userRewardCoins,
          userRewardXP,
          coinReward:     userRewardCoins,
          estimatedTime:  0,
          allowed_countries: raw.targeting?.[0]?.country?.allow ?? [],
        });
      }

    } else {
      return res.status(400).json({ success: false, message: `Unsupported SDK: "${sdk}". Use: bitlabs, everflow, affise.` });
    }

    const coinsPerDollar = await getCoinsPerDollar();
    let syncedCount = 0, updatedCount = 0, skippedCount = 0;
    const errors = [];

    for (const offer of offersToSync) {
      try {
        const externalId = String(offer.merchant_id || offer.id || offer.product_id || offer.offerId || "").trim();
        if (!externalId) { skippedCount++; continue; }

        const audienceEntry   = Array.isArray(targetAudience) ? targetAudience.find(t => String(t.offerId) === externalId || String(t.offerId) === String(offer.id)) : null;
        const selectedAges    = audienceEntry?.targetAudience?.age    || [];
        const selectedGenders = audienceEntry?.targetAudience?.gender || [];

        const isCashback     = offer.offerType === "cashback";
        const isMagicReceipt = offer.offerType === "magic_receipt" || offer.offerType === "magic-receipts";
        const isShopping     = offer.offerType === "shopping";
        const isBitlabs      = sdk === "bitlabs";

        // Resolve publisher value by offer type / SDK
        const publisherValue = sdk === "everflow"        ? parseFloat(offer.payoutAmount) || 0
          : sdk === "affise"                             ? parseFloat(offer.cpi)          || 0
          : isCashback                                   ? parseFloat(offer.cashback)     || 0
          : (isMagicReceipt || isShopping)               ? parseFloat(offer.total_points) || 0
          :                                                parseFloat(offer.value)         || 0;

        // Same pattern as survey sync: use pre-existing value or compute from publisherValue
        let userRewardCoins = offer.userRewardCoins || offer.reward?.coins || offer.coinReward || 0;
        if (!userRewardCoins && publisherValue > 0) {
          userRewardCoins = isBitlabs
            ? Math.round(publisherValue * 0.2)
            : Math.round(publisherValue * coinsPerDollar * USER_SHARE);
        }
        const userRewardXP = offer.userRewardXP || offer.reward?.xp || Math.round(userRewardCoins * 0.5);
        const coinReward   = userRewardCoins;

        const rawCat     = isCashback ? (offer.primary_category || "") : (offer.categories?.[0] || offer.category?.name || offer.category || "");
        const categoryStr = mapCategoryEnum(typeof rawCat === "object" ? (rawCat.name || "") : rawCat);

        const title = isCashback
          ? (offer.merchant_name || offer.name || offer.anchor || "Untitled Cashback")
          : (isMagicReceipt || isShopping)
          ? (offer.anchor || offer.product_name || (isMagicReceipt ? "Untitled Magic Receipt" : "Untitled Shopping"))
          : (offer.title || offer.name || "Untitled Offer");

        const estimatedTime = isCashback ? 1
          : (isMagicReceipt || isShopping) ? Math.max(1, Math.round((offer.session_hours || 0) / 60) || offer.estimatedTime || 1)
          : Math.max(1, offer.estimatedTime || offer.duration || offer.loi || 5);

        const docData = {
          sdkName      : sdk,
          externalId,
          title,
          description  : offer.description || "",
          offerType    : offer.offerType || "other",
          category     : categoryStr,
          status       : autoActivate ? "live" : "paused",
          isActive     : true,
          coinReward,
          userRewardCoins,
          userRewardXP,
          estimatedTime,
          clickUrl     : offer.click_url || offer.clickUrl || offer.preview_url || offer.url || "",
          thumbnail    : offer.creativeBundleUrl || offer.creative_bundle?.url || offer.thumbnailUrl || offer.logo || offer.creatives?.icon || offer.icon_url || offer.icon || "",
          targetAudience: {
            age      : selectedAges.length === 0 || selectedAges.includes("all")    ? [] : selectedAges.filter(a => a !== "all"),
            gender   : selectedGenders.length === 0 || selectedGenders.includes("all") ? [] : selectedGenders.filter(g => g !== "all"),
            countries: offer.country_code ? [offer.country_code] : (country ? [country] : []),
            minXP    : 0,
          },
          publisherRevenue: { cpi: parseFloat(offer.cpi) || 0, value: publisherValue, currency: "USD" },
          rawData      : offer,
          updatedBy    : req.user.userId,
        };

        const existing = await NonGamingOfferConfig.findOne({ sdkName: sdk, externalId });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          updatedCount++;
        } else {
          await NonGamingOfferConfig.create({ ...docData, createdBy: req.user.userId });
          syncedCount++;
        }
      } catch (err) {
        console.error("[non-gaming/sync] save error:", err.message);
        errors.push({ offerId: offer.id || offer.merchant_id, error: err.message });
      }
    }

    res.json({
      success: true,
      message: "Non-gaming offers synced successfully",
      data   : { syncedCount, updatedCount, skippedCount, errorCount: errors.length, totalProcessed: offersToSync.length },
    });
  } catch (error) {
    console.error("[non-gaming/sync]", error.message);
    res.status(500).json({ success: false, message: "Failed to sync non-gaming offers", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Sync surveys → surveyconfigs collection
// POST /api/non-gaming-survey/admin/surveys/sync
// ─────────────────────────────────────────────────────────────────────────────

router.post("/admin/surveys/sync", adminAuth, async (req, res) => {
  try {
    const { sdk = "bitlabs", offerIds = [], autoActivate = true, devices, country, targetAudience = [] } = req.body;
    if (!Array.isArray(offerIds) || offerIds.length === 0) {
      return res.status(400).json({ success: false, message: "offerIds array is required and must not be empty" });
    }

    const useBesitos = String(sdk).toLowerCase() === "besitos";
    const coinsPerDollar = await getCoinsPerDollar();
    let offersToSync = [];

    if (useBesitos) {
      const besitosService = require("../services/besitos.service");
      if (!besitosService.isConfigured()) return res.status(500).json({ success: false, message: "Besitos API is not properly configured" });
      const params = { device: mapBesitosDevice(devices), user_ip: "127.0.0.1" };
      if (country) params.country = country;
      let rawRes;
      try { rawRes = await besitosService.getSurveys(params, "admin-preview"); }
      catch (err) { return res.status(500).json({ success: false, message: err.message || "Failed to fetch Besitos surveys" }); }

      const list   = Array.isArray(rawRes) ? rawRes : (rawRes?.data || rawRes?.surveys || []);
      const idSet  = new Set(offerIds.map(String));
      offersToSync = list
        .filter(s => idSet.has(String(s.id)))
        .map(s => {
          const estimatedTime   = s.length ? Math.round(s.length) : 0;
          const publisherAmt    = s.amount ? parseFloat(s.amount) : 0;
          const userRewardCoins = publisherAmt > 0 ? Math.round(publisherAmt * coinsPerDollar * USER_SHARE) : 0;
          const userRewardXP    = Math.round(userRewardCoins * 0.5);
          // Besitos survey API returns no image fields — match old endpoint behaviour
          return { id: s.id?.toString() || "", title: s.name || `Survey ${s.id}`, description: s.description || `Earn $${s.amount || 0}`, clickUrl: s.url || "", surveyUrl: s.url || "", value: publisherAmt, cpi: s.cpi ? parseFloat(s.cpi) : 0, loi: estimatedTime, estimatedTime, userRewardCoins, userRewardXP, icon: "", banner: "", offerType: "survey", provider: "besitos", country: country || "", rawData: s };
        });

    } else {
      const bitlabsService = require("../services/bitlabs.service");
      const result = await bitlabsService.getSurveys({ country: country || "US", platform: "mobile" });
      if (!result.success) return res.status(500).json({ success: false, message: "Failed to fetch surveys from Bitlabs" });
      const idSet  = new Set(offerIds.map(String));
      offersToSync = (result.data || []).filter(o => idSet.has(String(o.id || o.surveyId || o.offerId || "")));
    }

    let syncedCount = 0, updatedCount = 0, skippedCount = 0;
    const errors = [];

    for (const offer of offersToSync) {
      try {
        const externalId = String(offer.id || offer.surveyId || offer.offerId || "").trim();
        if (!externalId) { skippedCount++; continue; }

        const audienceEntry   = Array.isArray(targetAudience) ? targetAudience.find(t => String(t.offerId) === externalId) : null;
        const selectedAges    = audienceEntry?.targetAudience?.age    || [];
        const selectedGenders = audienceEntry?.targetAudience?.gender || [];

        const publisherValue  = parseFloat(offer.value) || parseFloat(offer.cpi) || 0;
        let userRewardCoins   = offer.userRewardCoins || offer.reward?.coins || 0;
        if (!userRewardCoins && publisherValue > 0) {
          // Bitlabs: match the admin UI display formula (value × 0.2)
          // Besitos: pre-mapped with userRewardCoins already set above
          userRewardCoins = useBesitos
            ? Math.round(publisherValue * coinsPerDollar * USER_SHARE)
            : Math.round(publisherValue * 0.2);
        }
        const userRewardXP    = offer.userRewardXP    || offer.reward?.xp    || Math.round(userRewardCoins * 0.5);

        const docData = {
          sdkName       : useBesitos ? "besitos" : "bitlabs",
          externalId,
          title         : offer.title || offer.name || "Untitled Survey",
          description   : offer.description || "",
          offerType     : "survey",
          status        : autoActivate ? "live" : "paused",
          isActive      : true,
          coinReward    : userRewardCoins,
          userRewardCoins,
          userRewardXP,
          estimatedTime : Math.max(1, offer.estimatedTime || offer.loi || offer.duration || 5),
          clickUrl      : offer.clickUrl || offer.surveyUrl || offer.click_url || "",
          surveyUrl     : offer.surveyUrl || offer.clickUrl || "",
          thumbnail     : offer.creatives?.icon || offer.icon || offer.banner || "",
          cpi           : parseFloat(offer.cpi)    || 0,
          cr            : parseFloat(offer.cr)     || 0,
          loi           : parseFloat(offer.loi)    || offer.estimatedTime || 0,
          value         : publisherValue,
          rating        : offer.rating             || 0,
          country       : offer.country            || null,
          language      : offer.language           || null,
          provider      : useBesitos ? "besitos" : "bitlabs",
          targetAudience: {
            age      : selectedAges.length === 0 || selectedAges.includes("all")    ? [] : selectedAges.filter(a => a !== "all"),
            gender   : selectedGenders.length === 0 || selectedGenders.includes("all") ? [] : selectedGenders.filter(g => g !== "all"),
            countries: offer.countries || (offer.country ? [offer.country] : []),
            minXP    : 0,
          },
          rawData       : offer.rawData || offer,
          updatedBy     : req.user.userId,
        };

        const existing = await SurveyConfig.findOne({ sdkName: docData.sdkName, externalId });
        if (existing) {
          Object.assign(existing, docData);
          await existing.save();
          updatedCount++;
        } else {
          await SurveyConfig.create({ ...docData, createdBy: req.user.userId });
          syncedCount++;
        }
      } catch (err) {
        console.error("[surveys/sync] save error:", err.message);
        errors.push({ offerId: offer.id || offer.surveyId, error: err.message });
      }
    }

    res.json({
      success: true,
      message: "Surveys synced successfully",
      data   : { syncedCount, updatedCount, skippedCount, errorCount: errors.length, totalProcessed: offersToSync.length },
    });
  } catch (error) {
    console.error("[surveys/sync]", error.message);
    res.status(500).json({ success: false, message: "Failed to sync surveys", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Get configured offers from both new collections
// GET /api/non-gaming-survey/admin/configured
// Query: offerType=all|survey|cashback|shopping|magic_receipt
//        status=all|live|paused  /  sdk=all|bitlabs|besitos|everflow|affise
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/configured", adminAuth, async (req, res) => {
  try {
    const { offerType = "all", status = "all", sdk = "all" } = req.query;
    const sdkParam = sdk.trim().toLowerCase();

    const buildQuery = (base) => {
      const q = { ...base };
      if (status !== "all") q.status = status;
      if (sdkParam !== "all") q.sdkName = sdkParam;
      return q;
    };

    let allOffers = [];

    if (offerType === "all" || offerType === "survey") {
      const q = buildQuery({ offerType: "survey" });
      const surveys = await SurveyConfig.find(q).sort({ createdAt: -1 }).lean();
      allOffers.push(...surveys.map(o => ({ ...o, _modelType: "survey" })));
    }

    if (offerType === "all" || ["cashback", "shopping", "magic_receipt", "other"].includes(offerType)) {
      const q = buildQuery({});
      if (offerType !== "all") q.offerType = offerType;
      const nonGaming = await NonGamingOfferConfig.find(q).sort({ createdAt: -1 }).lean();
      allOffers.push(...nonGaming.map(o => ({ ...o, _modelType: "non-gaming" })));
    }

    allOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const breakdown = { surveys: 0, cashback: 0, shopping: 0, magicReceipts: 0, other: 0 };
    allOffers.forEach(o => {
      if (o.offerType === "survey")            breakdown.surveys++;
      else if (o.offerType === "cashback")     breakdown.cashback++;
      else if (o.offerType === "shopping")     breakdown.shopping++;
      else if (o.offerType === "magic_receipt") breakdown.magicReceipts++;
      else                                     breakdown.other++;
    });

    const shaped = allOffers.map(o => ({
      id            : o._id,
      externalId    : o.externalId,
      sdkName       : o.sdkName,
      title         : o.title,
      description   : o.description,
      offerType     : o.offerType,
      category      : o.category,
      status        : o.status,
      isActive      : o.isActive,
      coinReward    : o.coinReward,
      userRewardCoins: o.userRewardCoins,
      userRewardXP  : o.userRewardXP,
      estimatedTime : o.estimatedTime,
      clickUrl      : o.clickUrl || o.surveyUrl || "",
      thumbnail     : o.thumbnail || "",
      targetAudience: o.targetAudience,
      // survey-specific
      cpi           : o.cpi,
      loi           : o.loi,
      cr            : o.cr,
      value         : o.value,
      rating        : o.rating,
      country       : o.country,
      language      : o.language,
      provider      : o.provider,
      // non-gaming-specific
      publisherRevenue: o.publisherRevenue,
      offerDetails  : o.offerDetails,
      createdAt     : o.createdAt,
      updatedAt     : o.updatedAt,
    }));

    res.json({ success: true, data: { configuredOffers: shaped, breakdown, total: shaped.length } });
  } catch (error) {
    console.error("[configured]", error.message);
    res.status(500).json({ success: false, message: "Failed to get configured offers", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Delete a configured offer (checks SurveyConfig then NonGamingOfferConfig)
// DELETE /api/non-gaming-survey/admin/configured/:id
// ─────────────────────────────────────────────────────────────────────────────

router.delete("/admin/configured/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let doc = await SurveyConfig.findByIdAndDelete(id);
    if (doc) return res.json({ success: true, message: "Survey removed successfully" });

    doc = await NonGamingOfferConfig.findByIdAndDelete(id);
    if (doc) return res.json({ success: true, message: "Non-gaming offer removed successfully" });

    return res.status(404).json({ success: false, message: "Offer not found" });
  } catch (error) {
    console.error("[configured/delete]", error.message);
    res.status(500).json({ success: false, message: "Failed to delete offer", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// URL TRACKING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Bitlabs: injects s1=userId into click URL
function injectBitlabsUserId(url, userId) {
  if (!url || !userId) return url || "";
  try {
    const u = new URL(url);
    u.searchParams.set("s1", String(userId));
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}s1=${encodeURIComponent(userId)}`;
  }
}

// Affise: injects sub1=userId (or replaces {sub1} macro)
function injectAffiseUserId(url, userId) {
  if (!url || !userId) return url || "";
  if (/\{sub1\}/i.test(url)) return url.replace(/\{sub1\}/gi, encodeURIComponent(String(userId)));
  try {
    const u = new URL(url);
    u.searchParams.set("sub1", String(userId));
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}sub1=${encodeURIComponent(userId)}`;
  }
}

// Everflow: injects sub_id1=userId
function injectEverflowUserId(url, userId) {
  if (!url || !userId) return url || "";
  try {
    const u = new URL(url);
    u.searchParams.set("sub_id1", String(userId));
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}sub_id1=${encodeURIComponent(userId)}`;
  }
}

// Besitos: URL returned by getSurveysWall(userId) already has the user token baked
// into the path (e.g. /survey/redirect/{partner}/{surveyId}/{userToken}/{uuid}).
// Do NOT append any query param — Besitos does not expect one and it breaks the redirect.

function injectUserId(url, sdkName, userId) {
  if (sdkName === "bitlabs")  return injectBitlabsUserId(url, userId);
  if (sdkName === "affise")   return injectAffiseUserId(url, userId);
  if (sdkName === "everflow") return injectEverflowUserId(url, userId);
  if (sdkName === "besitos")  return url || ""; // user already embedded in URL path by Besitos API
  return url || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROFILE HELPER
// Fetches age/gender from DB — JWT only carries userId, not profile fields.
// ─────────────────────────────────────────────────────────────────────────────

function calcAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const dob   = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

async function getUserProfile(userId) {
  try {
    const u = await User.findById(userId).select("dateOfBirth onboarding gender xp").lean();
    if (!u) return { age: null, ageRange: null, gender: null, xp: { current: 0 } };
    // Prefer numeric age from dateOfBirth; fall back to onboarding.ageRange string
    const age      = u.dateOfBirth ? calcAge(u.dateOfBirth) : null;
    const ageRange = u.onboarding?.ageRange || null; // e.g. "18-24"
    const gender   = u.onboarding?.gender || u.gender || null;
    return { age, ageRange, gender, xp: u.xp || { current: 0 } };
  } catch (_) {
    return { age: null, ageRange: null, gender: null, xp: { current: 0 } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIENCE ELIGIBILITY HELPER
// ─────────────────────────────────────────────────────────────────────────────

function isAgeInRange(userAge, rangeStr) {
  if (!userAge) return true;
  if (rangeStr === "65+") return userAge >= 65;
  const [min, max] = rangeStr.split("-").map(Number);
  return userAge >= min && userAge <= max;
}

function isEligible(user, ta) {
  if (!ta) return true;

  // Gender — empty array or ["all"] = all genders allowed
  if (ta.gender && ta.gender.length > 0 && !ta.gender.includes("all")) {
    if (!user.gender || !ta.gender.includes(user.gender)) return false;
  }

  // Age — empty array or ["all"] = all ages allowed
  if (ta.age && ta.age.length > 0 && !ta.age.includes("all")) {
    let matches = false;
    if (user.age) {
      // Numeric age from dateOfBirth — check if falls within any configured range
      matches = ta.age.some(range => isAgeInRange(user.age, range));
    } else if (user.ageRange) {
      // String range from onboarding (e.g. "18-24") — direct match
      matches = ta.age.includes(user.ageRange);
    } else {
      // No age info on user — show to them (can't restrict)
      matches = true;
    }
    if (!matches) return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER: Live non-gaming offers from nongamingofferconfigs
// GET /api/non-gaming-survey/user/non-gaming-offers
// Fetches fresh offers from each SDK with userId for tracking,
// matches against admin-configured docs by externalId, injects tracking URL.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/user/non-gaming-offers", protect, async (req, res) => {
  try {
    const { offerType, page = 1, limit = 20 } = req.query;
    const userId  = req.user.userId || req.user.id;
    const userProfile = await getUserProfile(userId);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // 1. Load admin-configured live offers from DB
    const query = { status: "live", isActive: true };
    if (offerType && offerType !== "all") query.offerType = offerType;
    const dbOffers = await NonGamingOfferConfig.find(query).sort({ createdAt: -1 }).lean();
    if (!dbOffers.length) return res.json({ success: true, data: [], total: 0, page: pageNum, limit: limitNum });

    // 2. Group DB offers by SDK so we make one API call per SDK
    const bySdk = {};
    for (const o of dbOffers) {
      (bySdk[o.sdkName] = bySdk[o.sdkName] || []).push(o);
    }

    // 3. Fetch fresh offers from each SDK (with userId for tracking)
    const freshBySdk = {};

    if (bySdk.bitlabs) {
      try {
        const bitlabsService = require("../services/bitlabs.service");
        const r = await bitlabsService.getPublisherOffers({ is_game: false, country: "US", devices: ["android", "iphone"] });
        freshBySdk.bitlabs = r.success ? (r.data || []) : [];
      } catch (_) { freshBySdk.bitlabs = []; }
    }

    if (bySdk.everflow) {
      try {
        const everflowService = require("../services/everflow.service");
        if (everflowService.isConfigured()) {
          const r = await everflowService.getOffers({ offer_status: "active", userId });
          freshBySdk.everflow = r.success ? (r.data || []) : [];
        } else { freshBySdk.everflow = []; }
      } catch (_) { freshBySdk.everflow = []; }
    }

    if (bySdk.affise) {
      try {
        const affiseService = require("../services/affise.service");
        const r = await affiseService.getOffers({ "status[]": "active" }, { admin: true });
        freshBySdk.affise = r.success ? (r.data || []) : [];
      } catch (_) { freshBySdk.affise = []; }
    }

    // 4. Match each DB offer with a fresh SDK offer by externalId → inject userId tracking URL
    const result = dbOffers.map(o => {
      const freshList = freshBySdk[o.sdkName] || [];
      const fresh = freshList.find(f => {
        const fid = String(f.offerId || f.network_offer_id || f.merchant_id || f.id || f.offer_id || "");
        return fid === String(o.externalId);
      });

      // Pick click URL: prefer fresh (live), fall back to stored
      const rawUrl = fresh
        ? (fresh.clickUrl || fresh.click_url || fresh.preview_url || fresh.url || o.clickUrl || "")
        : o.clickUrl || "";
      const trackingUrl = injectUserId(rawUrl, o.sdkName, userId);

      return {
        id             : o._id,
        externalId     : o.externalId,
        sdkName        : o.sdkName,
        title          : o.title,
        description    : o.description,
        offerType      : o.offerType,
        category       : o.category,
        coinReward     : o.coinReward,
        userRewardCoins: o.userRewardCoins,
        userRewardXP   : o.userRewardXP,
        estimatedTime  : o.estimatedTime,
        clickUrl       : trackingUrl,
        thumbnail      : o.thumbnail,
        targetAudience : o.targetAudience,
        isAvailable    : !!fresh, // true = still live in SDK right now
      };
    });

    // 5. Only return offers currently live in the SDK AND matching user's audience segment
    const available = result.filter(o => o.isAvailable && isEligible(userProfile, o.targetAudience));

    // 6. Apply XP tier multiplier — fetch once for this user, apply to all offers
    const userCurrentXP = userProfile.xp?.current || 0;
    console.log(`\n===== [XP-MULTIPLIER DEBUG][non-gaming-offers] =====`);
    console.log(`[XP-MULTIPLIER] Step 1 — User info | userId=${userId} | userXP=${userCurrentXP}`);
    const xpMultiplier = await getAccessBenefitsMultiplier(userCurrentXP);
    console.log(`[XP-MULTIPLIER] Step 2 — Multiplier resolved | multiplier=${xpMultiplier} | availableOffers=${available.length}`);
    const withXP = available.map((o, i) => {
      const originalXP = o.userRewardXP;
      const adjustedXP = originalXP > 0 ? Math.round(originalXP * xpMultiplier) : originalXP;
      console.log(`[XP-MULTIPLIER] Step 3 — Offer[${i}] "${o.title}" | baseXP=${originalXP} | ${originalXP} x ${xpMultiplier} = ${adjustedXP} | changed=${originalXP !== adjustedXP}`);
      return { ...o, userRewardXP: adjustedXP };
    });
    console.log(`[XP-MULTIPLIER] Step 4 — Done | totalProcessed=${withXP.length}`);
    console.log(`===== [XP-MULTIPLIER DEBUG END] =====\n`);

    const paginated = withXP.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    res.json({ success: true, data: paginated, total: withXP.length, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error("[user/non-gaming-offers]", error.message);
    res.status(500).json({ success: false, message: "Failed to get non-gaming offers", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: Live surveys from surveyconfigs
// GET /api/non-gaming-survey/user/surveys
// Fetches fresh surveys from Bitlabs/Besitos with userId,
// matches against admin-configured docs, injects tracking URL.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/user/surveys", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId  = req.user.userId || req.user.id;
    const userProfile = await getUserProfile(userId);
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // 1. Load admin-configured live surveys from DB
    const dbSurveys = await SurveyConfig.find({ status: "live", isActive: true, offerType: "survey" }).sort({ createdAt: -1 }).lean();
    if (!dbSurveys.length) return res.json({ success: true, data: [], total: 0, page: pageNum, limit: limitNum });

    // 2. Fetch fresh surveys from each provider
    const freshBySdk = {};

    const hasBitlabs = dbSurveys.some(s => s.sdkName === "bitlabs");
    const hasBesitos  = dbSurveys.some(s => s.sdkName === "besitos");

    if (hasBitlabs) {
      try {
        const bitlabsService = require("../services/bitlabs.service");
        const r = await bitlabsService.getSurveys({ platform: "mobile" });
        freshBySdk.bitlabs = r.success ? (r.data || []) : [];
      } catch (_) { freshBySdk.bitlabs = []; }
    }

    if (hasBesitos) {
      // Besitos URLs are user-specific — getSurveysWall(userId) generates a redirect URL
      // with the user's partner_user_id baked into the path token.
      // DB-stored URLs use "admin-preview" token and are invalid for real users.
      try {
        const besitosService = require("../services/besitos.service");
        if (besitosService.isConfigured()) {
          // Build params: pass real user IP + profile so Besitos targets correct surveys
          const userIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
                      || req.socket?.remoteAddress
                      || "127.0.0.1";
          const besitosParams = { device: "mobile", user_ip: userIp };
          if (userProfile.gender)      besitosParams.gender = userProfile.gender === "male" ? "m" : "f";
          if (userProfile.dateOfBirth) besitosParams.dob    = userProfile.dateOfBirth.toISOString().split("T")[0];

          // partner_user_id is in the PATH — Besitos generates a user-specific redirect URL
          const raw  = await besitosService.getSurveysWall(String(userId), besitosParams);
          const list = Array.isArray(raw) ? raw : (raw?.data || raw?.surveys || []);
          freshBySdk.besitos = list.map(s => ({ id: s.id?.toString() || "", clickUrl: s.url || "", url: s.url || "" }));
          console.log(`[user/surveys] Besitos returned ${list.length} surveys for userId=${userId}`);
        } else {
          console.warn("[user/surveys] Besitos is not configured — surveys hidden");
          freshBySdk.besitos = [];
        }
      } catch (err) {
        console.error("[user/surveys] Besitos getSurveysWall error:", err.message || err);
        freshBySdk.besitos = [];
      }
    }

    // 3. Match and inject userId tracking URLs
    const result = dbSurveys.map(o => {
      const freshList = freshBySdk[o.sdkName] || [];
      const fresh = freshList.find(f => String(f.id || f.surveyId || f.offerId || "") === String(o.externalId));

      const rawUrl = fresh
        ? (fresh.clickUrl || fresh.url || fresh.surveyUrl || fresh.click_url || o.clickUrl || o.surveyUrl || "")
        : (o.clickUrl || o.surveyUrl || "");
      const trackingUrl = injectUserId(rawUrl, o.sdkName, userId);

      return {
        id             : o._id,
        externalId     : o.externalId,
        sdkName        : o.sdkName,
        provider       : o.provider,
        title          : o.title,
        description    : o.description,
        offerType      : o.offerType,
        coinReward     : o.coinReward,
        userRewardCoins: o.userRewardCoins,
        userRewardXP   : o.userRewardXP,
        estimatedTime  : o.estimatedTime,
        clickUrl       : trackingUrl,
        thumbnail      : o.thumbnail,
        cpi            : o.cpi,
        loi            : o.loi,
        rating         : o.rating,
        targetAudience : o.targetAudience,
        isAvailable    : !!fresh,
      };
    });

    // 4. Only return surveys currently live in the SDK AND matching user's audience segment
    const available = result.filter(o => o.isAvailable && isEligible(userProfile, o.targetAudience));

    // 5. Apply XP tier multiplier — fetch once for this user, apply to all surveys
    const userCurrentXP = userProfile.xp?.current || 0;
    const xpMultiplier = await getAccessBenefitsMultiplier(userCurrentXP);
    console.log(`[XP-MULTIPLIER][surveys] userId=${userId} | userXP=${userCurrentXP} | multiplier=${xpMultiplier}`);
    const withXP = available.map(o => {
      const originalXP = o.userRewardXP;
      const adjustedXP = originalXP > 0 ? Math.round(originalXP * xpMultiplier) : originalXP;
      console.log(`[XP-MULTIPLIER][surveys] survey="${o.title}" | baseXP=${originalXP} | finalXP=${adjustedXP} | multiplier=${xpMultiplier}`);
      return { ...o, userRewardXP: adjustedXP };
    });

    const paginated = withXP.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    res.json({ success: true, data: paginated, total: withXP.length, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error("[user/surveys]", error.message);
    res.status(500).json({ success: false, message: "Failed to get surveys", error: error.message });
  }
});

module.exports = router;
