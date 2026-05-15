const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const adRewardConfigSchema = new Schema(
  {
    coins: {
      type: Number,
      required: true,
      default: 50,
      min: 0,
    },
    cooldownHours: {
      type: Number,
      required: true,
      default: 4,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      default: "Watch ads and earn coins",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

adRewardConfigSchema.statics.getActiveConfig = async function () {
  let config = await this.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (!config) {
    config = await this.create({
      coins: 50,
      cooldownHours: 4,
      isActive: true,
      description: "Watch ads and earn coins",
    });
  }
  return config;
};

module.exports = mongoose.model("AdRewardConfig", adRewardConfigSchema);
