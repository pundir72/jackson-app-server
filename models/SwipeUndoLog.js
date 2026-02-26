const mongoose = require("mongoose");

const swipeUndoLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameId: {
      type: String,
      default: null,
    },
    gameTitle: {
      type: String,
      default: null,
    },
    undoCount: {
      type: Number,
      required: true,
    },
    maxUndoLimit: {
      type: Number,
      required: true,
    },
    tier: {
      type: String,
      enum: ["Free", "Bronze", "Gold", "Platinum"],
      required: true,
      index: true,
    },
    restoredFromIndex: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true },
);

swipeUndoLogSchema.index({ userId: 1, createdAt: -1 });
swipeUndoLogSchema.index({ gameId: 1, createdAt: -1 });

module.exports = mongoose.model("SwipeUndoLog", swipeUndoLogSchema);
