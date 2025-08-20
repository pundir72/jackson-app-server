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

// Google OAuth 2.0 Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || config.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || config.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || config.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log(profile,"----------profile");
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
            mobile: '9639973580', // Will be filled during onboarding
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
                balance: 100, // Welcome bonus
                currency: 'coins',
                lastUpdated: new Date()
            },
            xp: {
                current: 50,
                tier: 1,
                streak: 0
            },
            vip: {
                level: 'BRONZE',
                expires: null,
                benefits: {
                    bonusPercentage: 0,
                    cashback: 0,
                    exclusiveAccess: false,
                    prioritySupport: false,
                    specialOffers: false
                }
            }
        });

        const savedUser = await newUser.save();
        done(null, savedUser);
    } catch (error) {
        console.error('Google OAuth error:', error);
        done(error, null);
    }
}));

// Facebook OAuth Strategy
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || config.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET || config.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || config.FACEBOOK_CALLBACK_URL,
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
            mobile: '', // Will be filled during onboarding
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
                balance: 100, // Welcome bonus
                currency: 'coins',
                lastUpdated: new Date()
            },
            xp: {
                current: 50,
                tier: 1,
                streak: 0
            },
            vip: {
                level: 'BRONZE',
                expires: null,
                benefits: {
                    bonusPercentage: 0,
                    cashback: 0,
                    exclusiveAccess: false,
                    prioritySupport: false,
                    specialOffers: false
                }
            }
        });

        const savedUser = await newUser.save();
        done(null, savedUser);
    } catch (error) {
        console.error('Facebook OAuth error:', error);
        done(error, null);
    }
}));

module.exports = passport; 