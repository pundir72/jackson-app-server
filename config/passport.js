const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const config = require('./config');

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

function generateRandomMobile() {
    return '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
}

// Google OAuth 2.0 Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || config.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || config.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || config.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log(profile, "----------profile");
        // Check if user already exists
        let user = await User.findOne({
            $or: [
                { email: profile.emails[0].value },
                { 'social.googleId': profile.id }
            ]
        });

        if (user) {
            // Update existing user's Google info
            if (!user.social.googleId) {
                user.social.googleId = profile.id;
                user.social.googleAccessToken = accessToken;
                await user.save();
            }
            return done(null, user);
        }

        // Create new user
        const newUser = new User({
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            email: profile.emails[0].value,
            mobile: generateRandomMobile(), // Will be filled during onboarding
            password: 'google_oauth_' + Math.random().toString(36).substring(7), // Random password for OAuth users
            profile: {
                avatar: profile.photos[0]?.value || 'default-avatar.png',
                bio: '',
                theme: 'light'
            },
            social: {
                googleId: profile.id,
                googleAccessToken: accessToken,
                provider: 'google'
            },
            onboarding: {
                completed: false,
                step: 1
            },
            wallet: {
                balance: 0, // Welcome bonus
                currency: 'coins',
                lastUpdated: new Date()
            },
            xp: {
                current: 0,
                tier: 1,
                streak: 0
            },
            vip: {
                level: 'free',
                expires: null,
                benefits: {
                    bonusPercentage: 0,
                    cashback: 0,
                    exclusiveAccess: false,
                    prioritySupport: false,
                    specialOffers: false
                }
            },
            loginCount: 1, // Initialize login count for new Google users
            lastLoginAt: new Date(), // Set initial login time
            lastActive: new Date() // Set initial active time
        });

        const savedUser = await newUser.save();
        done(null, savedUser);
    } catch (error) {
        console.error('Google OAuth error:', error);
        done(error, null);
    }
}));

// Facebook OAuth Strategy
const facebookCallbackURL = (process.env.FACEBOOK_CALLBACK_URL || config.FACEBOOK_CALLBACK_URL || '').replace(/['"]/g, ''); // Remove quotes if present
const facebookAppId = (process.env.FACEBOOK_APP_ID || config.FACEBOOK_APP_ID || '').replace(/['"]/g, '');
const facebookAppSecret = (process.env.FACEBOOK_APP_SECRET || config.FACEBOOK_APP_SECRET || '').replace(/['"]/g, '');

console.log('[Passport Facebook Config]', {
    hasAppId: !!facebookAppId,
    hasAppSecret: !!facebookAppSecret,
    callbackURL: facebookCallbackURL,
    appIdPreview: facebookAppId ? facebookAppId.substring(0, 10) + '...' : 'MISSING',
    callbackURLValid: facebookCallbackURL.startsWith('http')
});

if (!facebookAppId || !facebookAppSecret || !facebookCallbackURL) {
    console.error('[Passport Facebook] Missing required configuration!', {
        hasAppId: !!facebookAppId,
        hasAppSecret: !!facebookAppSecret,
        hasCallbackURL: !!facebookCallbackURL
    });
}

passport.use(new FacebookStrategy({
    clientID: facebookAppId,
    clientSecret: facebookAppSecret,
    callbackURL: facebookCallbackURL,
    profileFields: ['id', 'displayName', 'photos', 'email', 'first_name', 'last_name'],
    scope: ['email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user already exists
        let user = await User.findOne({
            $or: [
                { email: profile.emails?.[0]?.value },
                { 'social.facebookId': profile.id }
            ]
        });

        if (user) {
            // Update existing user's Facebook info
            if (!user.social.facebookId) {
                user.social.facebookId = profile.id;
                user.social.facebookAccessToken = accessToken;
                await user.save();
            }
            return done(null, user);
        }

        // Create new user
        const newUser = new User({
            firstName: profile.name.givenName || profile.displayName.split(' ')[0],
            lastName: profile.name.familyName || profile.displayName.split(' ').slice(1).join(' '),
            email: profile.emails?.[0]?.value || `fb_${profile.id}@facebook.com`,
            mobile: generateRandomMobile(), // Will be filled during onboarding
            password: 'facebook_oauth_' + Math.random().toString(36).substring(7), // Random password for OAuth users
            profile: {
                avatar: profile.photos?.[0]?.value || 'default-avatar.png',
                bio: '',
                theme: 'light'
            },
            social: {
                facebookId: profile.id,
                facebookAccessToken: accessToken,
                provider: 'facebook'
            },
            onboarding: {
                completed: false,
                step: 1
            },
            wallet: {
                balance: 0, // Welcome bonus
                currency: 'coins',
                lastUpdated: new Date()
            },
            xp: {
                current: 0,
                tier: 1,
                streak: 0
            },
            vip: {
                level: 'free',
                expires: null,
                benefits: {
                    bonusPercentage: 0,
                    cashback: 0,
                    exclusiveAccess: false,
                    prioritySupport: false,
                    specialOffers: false
                }
            },
            loginCount: 1, // Initialize login count for new Facebook users
            lastLoginAt: new Date(), // Set initial login time
            lastActive: new Date() // Set initial active time
        });

        const savedUser = await newUser.save();
        done(null, savedUser);
    } catch (error) {
        console.error('Facebook OAuth error:', error);
        done(error, null);
    }
}));

module.exports = passport; 