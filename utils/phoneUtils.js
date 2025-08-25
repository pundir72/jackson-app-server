/**
 * Phone Number Utilities
 * Handles international phone number normalization and matching
 */

/**
 * Normalize phone number by removing all non-digit characters
 * @param {string} phone - Phone number with or without country code
 * @returns {string} - Clean digits only
 */
function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

/**
 * Extract country code from phone number
 * @param {string} phone - Normalized phone number
 * @returns {string} - Country code (e.g., "91" for India)
 */
function extractCountryCode(phone) {
    const normalized = normalizePhone(phone);
    
    // Common country code patterns
    if (normalized.startsWith('1') && normalized.length === 11) {
        return '1'; // US/Canada
    } else if (normalized.startsWith('91') && normalized.length === 12) {
        return '91'; // India
    } else if (normalized.startsWith('44') && normalized.length === 12) {
        return '44'; // UK
    } else if (normalized.startsWith('61') && normalized.length === 11) {
        return '61'; // Australia
    } else if (normalized.startsWith('86') && normalized.length === 13) {
        return '86'; // China
    } else if (normalized.startsWith('81') && normalized.length === 12) {
        return '81'; // Japan
    } else if (normalized.startsWith('49') && normalized.length === 12) {
        return '49'; // Germany
    } else if (normalized.startsWith('33') && normalized.length === 11) {
        return '33'; // France
    } else if (normalized.startsWith('39') && normalized.length === 11) {
        return '39'; // Italy
    } else if (normalized.startsWith('34') && normalized.length === 11) {
        return '34'; // Spain
    } else if (normalized.startsWith('7') && normalized.length === 11) {
        return '7'; // Russia
    } else if (normalized.startsWith('55') && normalized.length === 12) {
        return '55'; // Brazil
    } else if (normalized.startsWith('52') && normalized.length === 12) {
        return '52'; // Mexico
    } else if (normalized.startsWith('27') && normalized.length === 11) {
        return '27'; // South Africa
    } else if (normalized.startsWith('971') && normalized.length === 12) {
        return '971'; // UAE
    } else if (normalized.startsWith('966') && normalized.length === 12) {
        return '966'; // Saudi Arabia
    } else if (normalized.startsWith('880') && normalized.length === 13) {
        return '880'; // Bangladesh
    } else if (normalized.startsWith('92') && normalized.length === 12) {
        return '92'; // Pakistan
    } else if (normalized.startsWith('94') && normalized.length === 11) {
        return '94'; // Sri Lanka
    } else if (normalized.startsWith('977') && normalized.length === 12) {
        return '977'; // Nepal
    } else if (normalized.startsWith('95') && normalized.length === 11) {
        return '95'; // Myanmar
    } else if (normalized.startsWith('84') && normalized.length === 11) {
        return '84'; // Vietnam
    } else if (normalized.startsWith('66') && normalized.length === 10) {
        return '66'; // Thailand
    } else if (normalized.startsWith('65') && normalized.length === 9) {
        return '65'; // Singapore
    } else if (normalized.startsWith('60') && normalized.length === 10) {
        return '60'; // Malaysia
    } else if (normalized.startsWith('62') && normalized.length === 11) {
        return '62'; // Indonesia
    } else if (normalized.startsWith('63') && normalized.length === 11) {
        return '63'; // Philippines
    } else if (normalized.startsWith('82') && normalized.length === 11) {
        return '82'; // South Korea
    } else if (normalized.startsWith('852') && normalized.length === 11) {
        return '852'; // Hong Kong
    } else if (normalized.startsWith('886') && normalized.length === 11) {
        return '886'; // Taiwan
    } else if (normalized.startsWith('91') && normalized.length === 12) {
        return '91'; // India (already covered above)
    }
    
    // Default: assume first 1-3 digits are country code
    if (normalized.length > 10) {
        const countryCodeLength = normalized.length - 10;
        return normalized.substring(0, countryCodeLength);
    }
    
    return ''; // No country code detected
}

/**
 * Get local number without country code
 * @param {string} phone - Normalized phone number
 * @returns {string} - Local number without country code
 */
function getLocalNumber(phone) {
    const normalized = normalizePhone(phone);
    const countryCode = extractCountryCode(phone);
    
    if (countryCode) {
        return normalized.substring(countryCode.length);
    }
    
    return normalized; // Already local number
}

/**
 * Generate possible phone number variations for matching
 * @param {string} phone - Phone number (any format)
 * @returns {Array} - Array of possible phone number formats
 */
function generatePhoneVariations(phone) {
    const normalized = normalizePhone(phone);
    const countryCode = extractCountryCode(phone);
    const localNumber = getLocalNumber(phone);
    
    const variations = [];
    
    // Add the normalized version
    variations.push(normalized);
    
    // Add local number (without country code)
    if (countryCode) {
        variations.push(localNumber);
    }
    
    // Add with + prefix
    variations.push(`+${normalized}`);
    
    // Add common country code variations
    if (countryCode) {
        // With + and country code
        variations.push(`+${countryCode}${localNumber}`);
        
        // With 00 and country code (international format)
        variations.push(`00${countryCode}${localNumber}`);
        
        // With country code only
        variations.push(`${countryCode}${localNumber}`);
    }
    
    // Remove duplicates and return
    return [...new Set(variations)];
}

/**
 * Check if two phone numbers match (considering variations)
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - True if they match
 */
function phonesMatch(phone1, phone2) {
    if (!phone1 || !phone2) return false;
    
    const variations1 = generatePhoneVariations(phone1);
    const variations2 = generatePhoneVariations(phone2);
    
    // Check if any variations match
    for (const v1 of variations1) {
        for (const v2 of variations2) {
            if (v1 === v2) return true;
        }
    }
    
    return false;
}

/**
 * Find user by phone number (SIMPLE & SECURE - last 10 digits)
 * @param {Object} User - User model
 * @param {string} phone - Phone number to search for
 * @returns {Object|null} - User object or null
 */
async function findUserByPhone(User, phone) {
    // Clean the phone number (remove spaces, +, etc.)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // For login, we need at least 10 digits to be secure
    if (cleanPhone.length < 10) {
        return null; // Too short, reject for security
    }
    
    // Get last 10 digits (most common mobile number length)
    const last10Digits = cleanPhone.slice(-10);
    
    // Find user whose mobile ends with these 10 digits
    const user = await User.findOne({
        mobile: { $regex: last10Digits + '$' }
    });
    
    return user;
}

/**
 * Find OTP verification by phone number (SIMPLE & SECURE - last 10 digits)
 * @param {Object} OTPVerification - OTPVerification model
 * @param {string} phone - Phone number to search for
 * @returns {Object|null} - OTPVerification object or null
 */
async function findOTPByPhone(OTPVerification, phone) {
    // Clean the phone number (remove spaces, +, etc.)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // For OTP, we need at least 10 digits to be secure
    if (cleanPhone.length < 10) {
        return null; // Too short, reject for security
    }
    
    // Get last 10 digits (most common mobile number length)
    const last10Digits = cleanPhone.slice(-10);
    
    // Find OTP whose mobile ends with these 10 digits
    const otp = await OTPVerification.findOne({
        mobile: { $regex: last10Digits + '$' }
    });
    
    return otp;
}

/**
 * Find VERIFIED OTP verification by phone number (SIMPLE & SECURE - last 10 digits)
 * @param {Object} OTPVerification - OTPVerification model
 * @param {string} phone - Phone number to search for
 * @returns {Object|null} - VERIFIED OTPVerification object or null
 */
async function findVerifiedOTPByPhone(OTPVerification, phone) {
    // Clean the phone number (remove spaces, +, etc.)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // For OTP verification, we need at least 10 digits to be secure
    if (cleanPhone.length < 10) {
        return null; // Too short, reject for security
    }
    
    // Get last 10 digits (most common mobile number length)
    const last10Digits = cleanPhone.slice(-10);
    
    // Find VERIFIED OTP whose mobile ends with these 10 digits
    const otp = await OTPVerification.findOne({
        mobile: { $regex: last10Digits + '$' },
        isVerified: true,
        expiresAt: { $gt: new Date() }
    });
    
    return otp;
}

/**
 * Standardize phone number format for storage
 * @param {string} phone - Phone number in any format
 * @returns {string} - Standardized format (with country code, no +)
 */
function standardizePhone(phone) {
    const normalized = normalizePhone(phone);
    const countryCode = extractCountryCode(phone);
    const localNumber = getLocalNumber(phone);
    
    if (countryCode) {
        return `${countryCode}${localNumber}`;
    }
    
    // If no country code detected, assume it's a local number
    // Default to India (+91) for 10-digit numbers
    if (normalized.length === 10) {
        return `91${normalized}`;
    }
    
    return normalized;
}

module.exports = {
    normalizePhone,
    extractCountryCode,
    getLocalNumber,
    generatePhoneVariations,
    phonesMatch,
    findUserByPhone,
    findOTPByPhone,
    findVerifiedOTPByPhone,
    standardizePhone
};
