# Cloudflare Turnstile Setup Guide

This guide explains how to configure and use Cloudflare Turnstile captcha verification in the backend.

## 📋 Prerequisites

1. Cloudflare account (free tier works)
2. Access to Cloudflare Dashboard
3. Site domain registered with Cloudflare (optional, can use test keys)

## 🔧 Configuration

### Step 1: Get Turnstile Keys from Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile** section (or visit: https://dash.cloudflare.com/?to=/:account/turnstile)
3. Click **"Add Site"** or **"Create"**
4. Fill in:
   - **Site Name**: Your app name (e.g., "Padel Rewards App")
   - **Domain**: Your domain (e.g., `yourdomain.com`) or use `localhost` for testing
   - **Widget Mode**: Choose:
     - **Managed** (recommended) - Cloudflare handles everything
     - **Non-interactive** - No user interaction required
     - **Invisible** - Completely invisible to users
5. Click **"Create"**
6. Copy the **Site Key** and **Secret Key**

### Step 2: Add Environment Variables

Add these to your `.env` file:

```env
# Cloudflare Turnstile
CLOUDFLARE_TURNSTILE_SITE_KEY=your_site_key_here
CLOUDFLARE_TURNSTILE_SECRET_KEY=your_secret_key_here
```

**Important:**
- **Site Key** is public and safe to expose in frontend code
- **Secret Key** is private and must only be used in backend

### Step 3: Install Dependencies

The utility uses `axios` which is already in your `package.json`. No additional installation needed.

## 🚀 Usage

### Backend: Add Middleware to Routes

#### Option 1: Required Verification (Recommended for sensitive endpoints)

```javascript
const { verifyTurnstile } = require('../middleware/cloudflareTurnstile');

// Example: Protect login endpoint
router.post('/login', 
  verifyTurnstile, // Add this middleware
  async (req, res) => {
    // Your login logic here
    // Turnstile token is already verified
  }
);
```

#### Option 2: Optional Verification

```javascript
const { optionalTurnstile } = require('../middleware/cloudflareTurnstile');

// Example: Optional verification for less sensitive endpoints
router.post('/some-endpoint',
  optionalTurnstile, // Add this middleware
  async (req, res) => {
    // Your logic here
    // Request will proceed even if token is missing
  }
);
```

### Frontend: Implement Turnstile Widget

#### 1. Add Turnstile Script to HTML

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

#### 2. Add Turnstile Widget in Your Form

```html
<!-- In your login/signup form -->
<form id="loginForm">
  <!-- Your form fields -->
  <input type="email" name="email" />
  <input type="password" name="password" />
  
  <!-- Turnstile Widget -->
  <div class="cf-turnstile" 
       data-sitekey="YOUR_SITE_KEY" 
       data-callback="onTurnstileSuccess"
       data-error-callback="onTurnstileError">
  </div>
  
  <button type="submit">Login</button>
</form>

<script>
let turnstileToken = null;

function onTurnstileSuccess(token) {
  turnstileToken = token;
  console.log('Turnstile verified:', token);
}

function onTurnstileError() {
  turnstileToken = null;
  console.error('Turnstile error');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!turnstileToken) {
    alert('Please complete the captcha');
    return;
  }
  
  const formData = new FormData(e.target);
  formData.append('turnstileToken', turnstileToken);
  
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  // Handle response
});
</script>
```

#### 3. React/React Native Example

```jsx
import { useEffect, useRef } from 'react';

function LoginForm() {
  const turnstileRef = useRef(null);
  const [turnstileToken, setTurnstileToken] = useState(null);

  useEffect(() => {
    // Load Turnstile script
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!turnstileToken) {
      alert('Please complete the captcha');
      return;
    }
    
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: e.target.email.value,
        password: e.target.password.value,
        turnstileToken: turnstileToken
      })
    });
    
    const result = await response.json();
    // Handle response
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" name="email" />
      <input type="password" name="password" />
      
      <div
        className="cf-turnstile"
        data-sitekey={process.env.REACT_APP_TURNSTILE_SITE_KEY}
        data-callback={(token) => setTurnstileToken(token)}
        data-error-callback={() => setTurnstileToken(null)}
        ref={turnstileRef}
      />
      
      <button type="submit">Login</button>
    </form>
  );
}
```

## 📝 Example: Adding to Login Endpoint

Here's how to add Turnstile verification to your login endpoint:

```javascript
// routes/auth.js
const { verifyTurnstile } = require('../middleware/cloudflareTurnstile');

router.post(
  "/login",
  verifyTurnstile, // Add Turnstile verification
  body("emailOrMobile").trim().notEmpty(),
  body("password").trim().notEmpty(),
  async (req, res) => {
    try {
      // Turnstile is already verified at this point
      const { emailOrMobile, password } = req.body;
      
      // Your existing login logic...
      // ...
    } catch (error) {
      // Error handling
    }
  }
);
```

## 🔍 Request Format

The middleware accepts Turnstile token in three ways:

1. **Request Body** (recommended):
   ```json
   {
     "email": "user@example.com",
     "password": "password123",
     "turnstileToken": "0.abc123..."
   }
   ```

2. **Alternative body field name**:
   ```json
   {
     "cfTurnstileToken": "0.abc123..."
   }
   ```

3. **Header**:
   ```
   X-Turnstile-Token: 0.abc123...
   ```

## ✅ Verification Response

When verification succeeds, the middleware attaches verification data to `req.turnstileVerification`:

```javascript
{
  success: true,
  challenge_ts: "2024-01-01T12:00:00.000Z",
  hostname: "yourdomain.com",
  action: "login", // If using action mode
  cdata: "custom-data" // If using custom data
}
```

## 🛠️ Development Mode

In development mode (`NODE_ENV=development`), if Turnstile is not configured:
- Requests will be allowed (bypass verification)
- Warning will be logged to console
- This allows development without Cloudflare setup

## 📚 Additional Resources

- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Server-side Validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Widget Modes](https://developers.cloudflare.com/turnstile/get-started/widget-modes/)
- [Customization](https://developers.cloudflare.com/turnstile/get-started/customization/)

## 🐛 Troubleshooting

### Error: "Turnstile token is required"
- Make sure frontend is sending `turnstileToken` in request body or `X-Turnstile-Token` header
- Check that Turnstile widget is properly loaded and completed

### Error: "Invalid or expired Turnstile token"
- Token may have expired (tokens expire after a few minutes)
- Token may have been used already (tokens are single-use)
- Regenerate token by resetting the widget

### Error: "Turnstile verification not configured"
- Add `CLOUDFLARE_TURNSTILE_SECRET_KEY` to your `.env` file
- Restart your server after adding environment variables

### Widget not showing
- Check browser console for errors
- Verify `data-sitekey` matches your Site Key
- Ensure Turnstile script is loaded: `https://challenges.cloudflare.com/turnstile/v0/api.js`

## 🔒 Security Notes

1. **Never expose Secret Key** in frontend code
2. **Always verify on backend** - frontend verification can be bypassed
3. **Use HTTPS** in production for secure token transmission
4. **Rate limit** endpoints that use Turnstile to prevent abuse
5. **Log verification failures** for security monitoring

