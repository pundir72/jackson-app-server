/**
 * Affise Routes
 * API routes for Affise integration
 * @module routes/affise
 */

const express = require("express");
const router = express.Router();
const affiseController = require("../controllers/affise.controller");
const protect = require("../middleware/auth");
const { adminAuth } = require("../middleware/adminAuth");

/**
 * @route   GET /api/affise/health
 * @desc    Health check for Affise API
 * @access  Public
 */
router.get("/health", affiseController.healthCheck);

/**
 * @route   GET /api/affise/offers
 * @desc    Get available Affise offers (affiliate endpoint)
 * @access  Private (requires authentication)
 */
router.get("/offers", protect, affiseController.getOffers);

/**
 * @route   GET /api/affise/admin/offers
 * @desc    Get all active Affise offers via Admin API (for admin panel configuration)
 * @access  Private (Admin only)
 */
router.get("/admin/offers", adminAuth, affiseController.getAdminOffers);

/**
 * @route   GET /api/affise/stats/custom
 * @desc    Get custom Affise statistics (Admin only)
 * @access  Private (Admin only)
 */
router.get("/stats/custom", protect, adminAuth, affiseController.getStatsCustom);

/**
 * @route   GET /api/affise/stats/conversions
 * @desc    Get Affise conversions (Admin only)
 * @access  Private (Admin only)
 */
router.get("/stats/conversions", protect, adminAuth, affiseController.getConversions);

/**
 * @route   GET /api/affise/stats/clicks
 * @desc    Get Affise clicks (Admin only)
 * @access  Private (Admin only)
 */
router.get("/stats/clicks", protect, adminAuth, affiseController.getClicks);

module.exports = router;
