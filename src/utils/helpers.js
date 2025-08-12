const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

// Password hashing
const hashPassword = async (password) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return await bcrypt.hash(password, saltRounds);
};

// Password verification
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// JWT token generation
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// JWT token verification
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Generate OTP
const generateOTP = (length = 6) => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate random string
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate UUID
const generateUUID = () => {
  return uuidv4();
};

// Format currency
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Calculate points from amount
const calculatePoints = (amount) => {
  // 1 point per dollar spent
  return Math.floor(amount * 1);
};

// Calculate cashback from points
const calculateCashback = (points) => {
  // 100 points = $1 cashback
  return points / 100;
};

// Validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate phone number
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone);
};

// Sanitize phone number
const sanitizePhone = (phone) => {
  return phone.replace(/[\s\-\(\)]/g, '');
};

// Generate referral code
const generateReferralCode = (userId) => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${userId}${timestamp}${random}`.toUpperCase();
};

// Calculate age from date of birth
const calculateAge = (dateOfBirth) => {
  return moment().diff(moment(dateOfBirth), 'years');
};

// Get age range from age
const getAgeRange = (age) => {
  if (age < 18) return 'under_18';
  if (age >= 18 && age <= 24) return '18_24';
  if (age >= 25 && age <= 34) return '25_34';
  if (age >= 35 && age <= 44) return '35_44';
  if (age >= 45 && age <= 54) return '45_54';
  if (age >= 55) return '55_plus';
  return 'unknown';
};

// Format date
const formatDate = (date, format = 'YYYY-MM-DD') => {
  return moment(date).format(format);
};

// Get start of day
const getStartOfDay = (date = new Date()) => {
  return moment(date).startOf('day').toDate();
};

// Get end of day
const getEndOfDay = (date = new Date()) => {
  return moment(date).endOf('day').toDate();
};

// Check if date is today
const isToday = (date) => {
  return moment(date).isSame(moment(), 'day');
};

// Check if date is this week
const isThisWeek = (date) => {
  return moment(date).isSame(moment(), 'week');
};

// Check if date is this month
const isThisMonth = (date) => {
  return moment(date).isSame(moment(), 'month');
};

// Generate pagination info
const generatePagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null,
  };
};

// Generate success response
const successResponse = (data, message = 'Success', statusCode = 200) => {
  return {
    success: true,
    message,
    data,
    statusCode,
  };
};

// Generate error response
const errorResponse = (message, statusCode = 400, errors = null) => {
  return {
    success: false,
    message,
    errors,
    statusCode,
  };
};

// Validate file type
const isValidFileType = (file, allowedTypes) => {
  return allowedTypes.includes(file.mimetype);
};

// Validate file size
const isValidFileSize = (file, maxSize) => {
  return file.size <= maxSize;
};

// Generate file name
const generateFileName = (originalName, prefix = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  const extension = originalName.split('.').pop();
  return `${prefix}${timestamp}_${random}.${extension}`;
};

// Calculate distance between two coordinates
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

// Check if location is within radius
const isWithinRadius = (lat1, lon1, lat2, lon2, radiusKm) => {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= radiusKm;
};

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateOTP,
  generateRandomString,
  generateUUID,
  formatCurrency,
  calculatePoints,
  calculateCashback,
  isValidEmail,
  isValidPhone,
  sanitizePhone,
  generateReferralCode,
  calculateAge,
  getAgeRange,
  formatDate,
  getStartOfDay,
  getEndOfDay,
  isToday,
  isThisWeek,
  isThisMonth,
  generatePagination,
  successResponse,
  errorResponse,
  isValidFileType,
  isValidFileSize,
  generateFileName,
  calculateDistance,
  isWithinRadius,
}; 