const mongoose = require('mongoose');

const gameDisplayRuleSchema = new mongoose.Schema({
  // Rule Name - Unique identifier
  ruleName: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true
  },
  // Multi-select milestones: First-time user, Returning user, XP Tier, Membership Tier
  userMilestones: [{
    type: String,
    required: true,
    enum: ['first_time_user', 'returning_user', 'xp_tier', 'membership_tier']
  }],
  // Conditional: XP Tier (when "XP Tier" is selected in milestones)
  xpTier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'XPTier',
    required: function() {
      return this.userMilestones && this.userMilestones.includes('xp_tier');
    }
  },
  // Conditional: Membership Tier (when "Membership Tier" is selected in milestones)
  membershipTier: {
    type: String, // References VIPTier.tierId
    required: function() {
      return this.userMilestones && this.userMilestones.includes('membership_tier');
    }
  },
  maxGamesToShow: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  segmentOverrides: [{
    type: {
      type: String,
      enum: ['age', 'gender', 'country'],
      required: true
    },
    value: {
      type: String,
      required: true
    },
    maxGamesToShow: {
      type: Number,
      required: true,
      min: 1,
      max: 50
    }
  }],
  isEnabled: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  metadata: {
    description: String,
    notes: String,
    priority: {
      type: Number,
      default: 0
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt field before saving
gameDisplayRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
gameDisplayRuleSchema.index({ userMilestones: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ xpTier: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ membershipTier: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ order: 1 });
gameDisplayRuleSchema.index({ createdAt: -1 });
gameDisplayRuleSchema.index({ ruleName: 1 }); // Unique index already created above

// Virtual for status label
gameDisplayRuleSchema.virtual('status').get(function() {
  return this.isEnabled ? 'Active' : 'Inactive';
});

// Ensure virtuals are included in JSON
gameDisplayRuleSchema.set('toJSON', { virtuals: true });
gameDisplayRuleSchema.set('toObject', { virtuals: true });

// Static methods
gameDisplayRuleSchema.statics.findActive = function() {
  return this.find({ isEnabled: true }).sort({ order: 1, createdAt: 1 });
};

gameDisplayRuleSchema.statics.findByMilestone = function(milestone) {
  return this.find({ 
    userMilestones: milestone,
    isEnabled: true
  });
};

// Check for duplicate rules
gameDisplayRuleSchema.statics.findDuplicate = async function(ruleData, excludeId = null) {
  // Build base query for milestones (must have exact same milestones)
  const query = {
    userMilestones: { 
      $all: ruleData.userMilestones || [], 
      $size: (ruleData.userMilestones || []).length 
    }
  };
  
  // Add XP tier if specified (must match exactly)
  if (ruleData.xpTier) {
    query.xpTier = ruleData.xpTier;
  } else if (ruleData.userMilestones && ruleData.userMilestones.includes('xp_tier')) {
    // If xp_tier is in milestones but xpTier is not provided, it's not a duplicate
    query.xpTier = { $exists: false };
  }
  
  // Add membership tier if specified (must match exactly)
  if (ruleData.membershipTier) {
    query.membershipTier = ruleData.membershipTier;
  } else if (ruleData.userMilestones && ruleData.userMilestones.includes('membership_tier')) {
    // If membership_tier is in milestones but membershipTier is not provided, it's not a duplicate
    query.membershipTier = { $exists: false };
  }
  
  // For segment overrides, we need to check if they match
  // Since segmentOverrides is an array of objects, we need to compare them properly
  if (ruleData.segmentOverrides && ruleData.segmentOverrides.length > 0) {
    // Find all rules matching the base query first
    const candidateRules = await this.find(query);
    
    // Convert input overrides to normalized string for comparison
    const normalizeOverrides = (overrides) => {
      return (overrides || [])
        .sort((a, b) => {
          const aStr = `${a.type}-${a.value}`;
          const bStr = `${b.type}-${b.value}`;
          if (aStr !== bStr) return aStr.localeCompare(bStr);
          return a.maxGamesToShow - b.maxGamesToShow;
        })
        .map(o => `${o.type}:${o.value}:${o.maxGamesToShow}`)
        .join('|');
    };
    
    const inputOverrideString = normalizeOverrides(ruleData.segmentOverrides);
    
    // Check each candidate rule
    for (const rule of candidateRules) {
      if (excludeId && rule._id.toString() === excludeId.toString()) continue;
      
      const ruleOverrideString = normalizeOverrides(rule.segmentOverrides || []);
      
      if (inputOverrideString === ruleOverrideString) {
        return rule;
      }
    }
    return null;
  } else {
    // If no segment overrides, check for rules with no segment overrides or empty array
    // We need to handle this separately to avoid $or conflicts
    const rulesWithoutOverrides = await this.find({
      ...query,
      $or: [
        { segmentOverrides: { $exists: false } },
        { segmentOverrides: { $size: 0 } },
        { segmentOverrides: null }
      ]
    });
    
    // Exclude current rule if updating
    if (excludeId) {
      const filtered = rulesWithoutOverrides.filter(
        rule => rule._id.toString() !== excludeId.toString()
      );
      return filtered.length > 0 ? filtered[0] : null;
    }
    
    return rulesWithoutOverrides.length > 0 ? rulesWithoutOverrides[0] : null;
  }
};

// Instance methods
gameDisplayRuleSchema.methods.getMaxGamesForSegment = function(segmentType, segmentValue) {
  // Check for segment override
  const override = this.segmentOverrides.find(
    o => o.type === segmentType && o.value === segmentValue
  );
  
  return override ? override.maxGamesToShow : this.maxGamesToShow;
};

gameDisplayRuleSchema.methods.applyToUser = async function(userProfile) {
  const { age, gender, country, xp, gamesPlayed, membershipTier } = userProfile;
  
  // Check if rule applies based on milestones
  let applies = false;
  
  // Check first-time user (no games downloaded)
  if (this.userMilestones.includes('first_time_user') && gamesPlayed === 0) {
    applies = true;
  }
  
  // Check returning user (one or more games downloaded)
  if (this.userMilestones.includes('returning_user') && gamesPlayed > 0) {
    applies = true;
  }
  
  // Check XP tier
  if (this.userMilestones.includes('xp_tier') && this.xpTier) {
    // Use mongoose.model to avoid circular dependency
    const XPTier = mongoose.models.XPTier || mongoose.model('XPTier');
    const tier = await XPTier.findById(this.xpTier);
    if (tier && xp >= tier.xpMin && xp <= tier.xpMax) {
      applies = true;
    }
  }
  
  // Check membership tier
  if (this.userMilestones.includes('membership_tier') && this.membershipTier) {
    if (membershipTier === this.membershipTier) {
      applies = true;
    }
  }
  
  // If rule doesn't apply, return null
  if (!applies) {
    return null;
  }
  
  // Get max games based on segments
  let maxGames = this.maxGamesToShow;
  
  // Check age override
  if (age && this.segmentOverrides) {
    const ageGroup = this.getAgeGroup(age);
    maxGames = Math.min(maxGames, this.getMaxGamesForSegment('age', ageGroup));
  }
  
  // Check gender override
  if (gender && this.segmentOverrides) {
    maxGames = Math.min(maxGames, this.getMaxGamesForSegment('gender', gender));
  }
  
  // Check country override
  if (country && this.segmentOverrides) {
    maxGames = Math.min(maxGames, this.getMaxGamesForSegment('country', country));
  }
  
  return {
    maxGames,
    ruleId: this._id,
    ruleName: this.ruleName,
    appliedMilestones: this.userMilestones
  };
};

gameDisplayRuleSchema.methods.getAgeGroup = function(age) {
  if (age < 18) return 'under_18';
  if (age >= 18 && age <= 24) return '18_24';
  if (age >= 25 && age <= 34) return '25_34';
  if (age >= 35 && age <= 44) return '35_44';
  if (age >= 45 && age <= 54) return '45_54';
  return '55_plus';
};

const GameDisplayRule = mongoose.model('GameDisplayRule', gameDisplayRuleSchema);

module.exports = GameDisplayRule;

