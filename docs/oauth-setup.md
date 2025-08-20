# OAuth Setup Guide for Jackson App

This guide explains how to set up and use Google and Facebook OAuth login in your Jackson App backend.

## 🚀 What's Been Implemented

### ✅ Backend Implementation
- **Passport.js Configuration** - `config/passport.js`
- **OAuth Routes** - Added to `routes/auth.js`
- **User Model Updates** - Social login fields added
- **Server Integration** - Passport initialized in `server.js`

### 🔑 New API Endpoints
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/facebook` - Initiate Facebook OAuth
- `GET /api/auth/facebook/callback` - Facebook OAuth callback
- `GET /api/auth/social/status` - Check social login status
- `POST /api/auth/social/disconnect` - Disconnect social account

## 📋 Prerequisites

### 1. Google OAuth 2.0 Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set Application Type to "Web application"
6. Add Authorized redirect URIs:
   - `http://localhost:4001/api/auth/google/callback` (development)
   - `https://yourdomain.com/api/auth/google/callback` (production)
7. Copy Client ID and Client Secret

### 2. Facebook OAuth Setup
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing one
3. Add Facebook Login product
4. Go to "Settings" → "Basic"
5. Copy App ID and App Secret
6. Add Valid OAuth Redirect URIs:
   - `http://localhost:4001/api/auth/facebook/callback` (development)
   - `https://yourdomain.com/api/auth/facebook/callback` (production)

## ⚙️ Environment Configuration

Create a `.env` file in your project root with these variables:

```env
# OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:4001/api/auth/google/callback

FACEBOOK_APP_ID=your_facebook_app_id_here
FACEBOOK_APP_SECRET=your_facebook_app_secret_here
FACEBOOK_CALLBACK_URL=http://localhost:4001/api/auth/facebook/callback

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here
```

## 🔄 How OAuth Flow Works

### 1. User Initiates Login
```
Frontend → GET /api/auth/google or /api/auth/facebook
```

### 2. OAuth Provider Redirects
```
Google/Facebook → User authenticates → Redirects to callback URL
```

### 3. Backend Processes Callback
```
Callback URL → Passport authenticates → Creates/updates user → Generates JWT
```

### 4. Frontend Receives Token
```
Backend → Redirects to frontend with JWT token
```

## 📱 Frontend Integration

### 1. Login Buttons
```html
<!-- Google Login -->
<a href="/api/auth/google" class="btn btn-google">
  <i class="fab fa-google"></i> Login with Google
</a>

<!-- Facebook Login -->
<a href="/api/auth/facebook" class="btn btn-facebook">
  <i class="fab fa-facebook"></i> Login with Facebook
</a>
```

### 2. Handle OAuth Callback
```javascript
// In your frontend auth callback component
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const provider = urlParams.get('provider');
  const userId = urlParams.get('userId');
  
  if (token) {
    // Store token in localStorage or state
    localStorage.setItem('token', token);
    
    // Redirect to dashboard or home
    window.location.href = '/dashboard';
  }
}, []);
```

### 3. Check Social Login Status
```javascript
const checkSocialStatus = async (email, provider) => {
  try {
    const response = await fetch(`/api/auth/social/status?email=${email}&provider=${provider}`);
    const data = await response.json();
    return data.connected;
  } catch (error) {
    console.error('Error checking social status:', error);
    return false;
  }
};
```

### 4. Disconnect Social Account
```javascript
const disconnectSocial = async (userId, provider) => {
  try {
    const response = await fetch('/api/auth/social/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': localStorage.getItem('token')
      },
      body: JSON.stringify({ userId, provider })
    });
    
    const data = await response.json();
    console.log(data.message);
  } catch (error) {
    console.error('Error disconnecting social account:', error);
  }
};
```

## 🗄️ Database Schema Updates

The User model now includes social login fields:

```javascript
social: {
  googleId: String,
  facebookId: String,
  googleAccessToken: String,
  facebookAccessToken: String,
  provider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  }
}
```

## 🔒 Security Features

### ✅ Implemented Security Measures
- **JWT Tokens** - Secure authentication tokens
- **OAuth 2.0** - Industry standard authentication
- **Access Token Storage** - Secure token management
- **User Validation** - Prevents duplicate accounts
- **Session Management** - Stateless authentication

### 🛡️ Best Practices
- Store sensitive credentials in environment variables
- Use HTTPS in production
- Implement proper error handling
- Validate user data before saving
- Regular token rotation

## 🧪 Testing

### 1. Test Google OAuth
```bash
# Start your server
npm run dev

# Visit in browser
http://localhost:4001/api/auth/google
```

### 2. Test Facebook OAuth
```bash
# Visit in browser
http://localhost:4001/api/auth/facebook
```

### 3. Check Database
```bash
# Check if user was created
mongo
use jackson-app
db.users.find({ "social.provider": { $in: ["google", "facebook"] } })
```

## 🚨 Troubleshooting

### Common Issues

#### 1. "Invalid redirect URI" Error
- Check if callback URLs match exactly in OAuth provider settings
- Ensure no trailing slashes or typos

#### 2. "Client ID not found" Error
- Verify environment variables are set correctly
- Check if .env file is loaded

#### 3. "Passport not initialized" Error
- Ensure passport.initialize() is called in server.js
- Check if passport config file is imported correctly

#### 4. Database Connection Issues
- Verify MongoDB is running
- Check MONGODB_URI in environment variables

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=passport:*
```

## 📚 Additional Resources

- [Passport.js Documentation](http://www.passportjs.org/)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Facebook Login Guide](https://developers.facebook.com/docs/facebook-login/)
- [JWT Best Practices](https://jwt.io/introduction)

## 🎯 Next Steps

1. **Set up OAuth credentials** in Google Cloud Console and Facebook Developers
2. **Configure environment variables** with your credentials
3. **Test OAuth flow** with development URLs
4. **Update frontend** to handle OAuth callbacks
5. **Deploy to production** with proper HTTPS URLs

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all environment variables are set
3. Check browser console and server logs
4. Ensure OAuth provider settings match your callback URLs

---

**Happy OAuth Implementation! 🚀** 