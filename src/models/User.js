const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email!`
    }
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  dateOfBirth: {
    type: Date,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
  },
  ageRange: {
    type: String,
    enum: ['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'],
  },
  avatar: {
    type: String,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isVip: {
    type: Boolean,
    default: false,
  },
  vipExpiresAt: {
    type: Date,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  totalPoints: {
    type: Number,
    default: 0,
  },
  totalCashback: {
    type: Number,
    default: 0.00,
  },
  totalEarnings: {
    type: Number,
    default: 0.00,
  },
  lastLoginAt: {
    type: Date,
  },
  loginCount: {
    type: Number,
    default: 0,
  },
  deviceToken: {
    type: String,
  },
  pushNotifications: {
    type: Boolean,
    default: true,
  },
  emailNotifications: {
    type: Boolean,
    default: true,
  },
  smsNotifications: {
    type: Boolean,
    default: true,
  },
  locationEnabled: {
    type: Boolean,
    default: false,
  },
  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },
  timezone: {
    type: String,
  },
  language: {
    type: String,
    default: 'en',
  },
  currency: {
    type: String,
    default: 'USD',
  },
  dailyGoal: {
    type: Number,
    default: 0.00,
  },
  streakDays: {
    type: Number,
    default: 0,
  },
  lastActivityAt: {
    type: Date,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Additional indexes (unique indexes are already defined in schema)
userSchema.index({ isActive: 1 });
userSchema.index({ isVip: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateLastActivity = function() {
  this.lastActivityAt = new Date();
  return this.save();
};

userSchema.methods.addPoints = function(points) {
  this.totalPoints += points;
  return this.save();
};

userSchema.methods.addCashback = function(amount) {
  this.totalCashback += parseFloat(amount);
  this.totalEarnings += parseFloat(amount);
  return this.save();
};

userSchema.methods.isVipActive = function() {
  if (!this.isVip) return false;
  if (!this.vipExpiresAt) return false;
  return new Date() < this.vipExpiresAt;
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone });
};

userSchema.statics.findByReferralCode = function(referralCode) {
  return this.findOne({ referralCode });
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

userSchema.statics.findVipUsers = function() {
  return this.find({ isVip: true });
};

const User = mongoose.model('User', userSchema);

module.exports = User; 