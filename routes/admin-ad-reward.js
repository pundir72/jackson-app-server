const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/adminAuth");
const AdRewardConfig = require("../models/AdRewardConfig");

router.get("/config", adminAuth, async (req, res) => {
  try {
    const config = await AdRewardConfig.findOne().sort({ createdAt: -1 });
    if (!config) {
      return res.json({
        success: true,
        data: null,
        message: "No ad reward config found",
      });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error("Error getting ad reward config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get ad reward config",
    });
  }
});

router.post("/config", adminAuth, async (req, res) => {
  try {
    const { coins, cooldownHours, isActive, description } = req.body;

    const config = await AdRewardConfig.create({
      coins: coins ?? 50,
      cooldownHours: cooldownHours ?? 4,
      isActive: isActive !== undefined ? isActive : true,
      description: description || "Watch ads and earn coins",
      createdBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      data: config,
      message: "Ad reward config created successfully",
    });
  } catch (error) {
    console.error("Error creating ad reward config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create ad reward config",
    });
  }
});

router.put("/config/:id", adminAuth, async (req, res) => {
  try {
    const { coins, cooldownHours, isActive, description } = req.body;

    const updateData = {};
    if (coins !== undefined) updateData.coins = coins;
    if (cooldownHours !== undefined) updateData.cooldownHours = cooldownHours;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (description !== undefined) updateData.description = description;
    updateData.updatedBy = req.user.userId;

    const config = await AdRewardConfig.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true },
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        error: "Ad reward config not found",
      });
    }

    res.json({
      success: true,
      data: config,
      message: "Ad reward config updated successfully",
    });
  } catch (error) {
    console.error("Error updating ad reward config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update ad reward config",
    });
  }
});

router.get("/config/history", adminAuth, async (req, res) => {
  try {
    const configs = await AdRewardConfig.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: configs });
  } catch (error) {
    console.error("Error getting ad reward config history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get ad reward config history",
    });
  }
});

module.exports = router;
