const mongoose = require('mongoose');

const gameTipSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    // enum: ['getting_started', 'pro_strategies', 'leveling_tips', 'advanced_tactics', 'general_tips'],
    default: 'general_tips'
  },
  categoryDisplayName: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    default: 0,
    min: 0
  },
  difficulty: {
    type: String,
    // enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  estimatedReadTime: {
    type: Number,
    default: 2, // minutes
    min: 1,
    max: 10
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  // Optional media content
  media: {
    image: {
      url: String,
      alt: String
    },
    video: {
      url: String,
      thumbnail: String,
      duration: Number // seconds
    }
  },
  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    bookmarks: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    helpfulVotes: {
      type: Number,
      default: 0
    },
    notHelpfulVotes: {
      type: Number,
      default: 0
    }
  },
  // SEO and metadata
  seo: {
    metaDescription: {
      type: String,
      maxlength: 160
    },
    keywords: [{
      type: String,
      trim: true,
      lowercase: true
    }]
  },
  // Content management
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedAt: {
    type: Date,
    default: Date.now
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
gameTipSchema.index({ gameId: 1, category: 1, isActive: 1 });
gameTipSchema.index({ gameId: 1, order: 1 });
gameTipSchema.index({ isFeatured: 1, isActive: 1 });
gameTipSchema.index({ tags: 1 });
gameTipSchema.index({ publishedAt: -1 });

// Update the lastModifiedAt field before saving
gameTipSchema.pre('save', function(next) {
  this.lastModifiedAt = Date.now();
  next();
});

// Static methods
gameTipSchema.statics.findByGame = function(gameId, options = {}) {
  const query = { gameId, isActive: true };
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.difficulty) {
    query.difficulty = options.difficulty;
  }
  
  if (options.featured) {
    query.isFeatured = true;
  }
  
  return this.find(query)
    .sort({ order: 1, publishedAt: -1 })
    .select('-analytics -seo');
};

gameTipSchema.statics.findFeatured = function(gameId) {
  return this.find({ 
    gameId, 
    isFeatured: true, 
    isActive: true 
  }).sort({ order: 1, publishedAt: -1 });
};

gameTipSchema.statics.findByCategory = function(gameId, category) {
  return this.find({ 
    gameId, 
    category, 
    isActive: true 
  }).sort({ order: 1, publishedAt: -1 });
};

gameTipSchema.statics.searchTips = function(gameId, searchTerm) {
  const regex = new RegExp(searchTerm, 'i');
  return this.find({
    gameId,
    isActive: true,
    $or: [
      { title: regex },
      { content: regex },
      { tags: { $in: [regex] } }
    ]
  }).sort({ order: 1, publishedAt: -1 });
};

// Instance methods
gameTipSchema.methods.incrementViews = function() {
  this.analytics.views += 1;
  return this.save();
};

gameTipSchema.methods.incrementBookmarks = function() {
  this.analytics.bookmarks += 1;
  return this.save();
};

gameTipSchema.methods.incrementShares = function() {
  this.analytics.shares += 1;
  return this.save();
};

gameTipSchema.methods.voteHelpful = function() {
  this.analytics.helpfulVotes += 1;
  return this.save();
};

gameTipSchema.methods.voteNotHelpful = function() {
  this.analytics.notHelpfulVotes += 1;
  return this.save();
};

gameTipSchema.methods.getSummary = function() {
  return {
    id: this._id,
    gameId: this.gameId,
    title: this.title,
    content: this.content,
    category: this.category,
    categoryDisplayName: this.categoryDisplayName,
    difficulty: this.difficulty,
    estimatedReadTime: this.estimatedReadTime,
    tags: this.tags,
    isFeatured: this.isFeatured,
    media: this.media,
    analytics: {
      views: this.analytics.views,
      bookmarks: this.analytics.bookmarks,
      shares: this.analytics.shares,
      helpfulVotes: this.analytics.helpfulVotes,
      notHelpfulVotes: this.analytics.notHelpfulVotes
    },
    publishedAt: this.publishedAt,
    lastModifiedAt: this.lastModifiedAt
  };
};

// Virtual for helpfulness ratio
gameTipSchema.virtual('helpfulnessRatio').get(function() {
  const total = this.analytics.helpfulVotes + this.analytics.notHelpfulVotes;
  return total > 0 ? (this.analytics.helpfulVotes / total) * 100 : 0;
});

module.exports = mongoose.model('GameTip', gameTipSchema);
