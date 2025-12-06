# Facebook Privacy Consent (GDPR) Fix

## 🔍 Issue Identified

Facebook is showing a **Privacy Consent (GDPR)** page instead of the login page. This means:
- ✅ Your callback URL is correctly configured
- ✅ OAuth flow is working
- ❌ Facebook requires Privacy Policy and Terms of Service URLs

## ✅ Solution: Add Privacy Policy & Terms URLs

### Step 1: Go to Facebook App Settings

1. Go to: https://developers.facebook.com/apps/1216817840509141/settings/basic/
2. Scroll down to **"Privacy Policy URL"** and **"Terms of Service URL"**
3. Add your privacy policy and terms URLs

### Step 2: Required URLs

You need to add:

**Privacy Policy URL:**
```
https://yourdomain.com/privacy-policy
```
or
```
https://rewardsapi.hireagent.co/privacy-policy
```

**Terms of Service URL:**
```
https://yourdomain.com/terms-of-service
```
or
```
https://rewardsapi.hireagent.co/terms-of-service
```

### Step 3: If You Don't Have These Pages

**Option A: Create Simple Pages**

Create these pages on your website or use a service like:
- https://www.privacypolicygenerator.info/
- https://www.termsofservicegenerator.net/

**Option B: Use Placeholder URLs (for testing)**

For development/testing, you can use:
- Privacy Policy: `https://rewardsapi.hireagent.co/privacy`
- Terms: `https://rewardsapi.hireagent.co/terms`

Then create simple HTML pages at these routes.

### Step 4: Update Facebook App Settings

1. **Settings → Basic**
2. Scroll to **"Privacy Policy URL"**
   - Add: `https://rewardsapi.hireagent.co/privacy-policy`
3. Scroll to **"Terms of Service URL"**
   - Add: `https://rewardsapi.hireagent.co/terms-of-service`
4. **Save Changes**

### Step 5: Additional Settings to Check

In **Facebook Login → Settings**:

1. **Client OAuth Login**: ✅ Enabled (already enabled)
2. **Web OAuth Login**: ✅ Enabled (already enabled)
3. **Use Strict Mode for redirect URIs**: ✅ Enabled (good!)
4. **Valid OAuth Redirect URIs**: 
   - Should have: `https://rewardsapi.hireagent.co/api/auth/facebook/callback`
5. **Enforce HTTPS**: ✅ Enabled (good!)

## 🚀 Quick Fix: Create Simple Privacy/Terms Pages

If you need these pages quickly, create simple HTML files:

### Privacy Policy Page (`/privacy-policy`)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Privacy Policy - Jackson</title>
</head>
<body>
    <h1>Privacy Policy</h1>
    <p>Last updated: [Date]</p>
    <p>We collect and use your information to provide our services...</p>
    <!-- Add your privacy policy content here -->
</body>
</html>
```

### Terms of Service Page (`/terms-of-service`)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Terms of Service - Jackson</title>
</head>
<body>
    <h1>Terms of Service</h1>
    <p>Last updated: [Date]</p>
    <p>By using our service, you agree to these terms...</p>
    <!-- Add your terms content here -->
</body>
</html>
```

## 📝 Checklist

- [ ] Privacy Policy URL added in Facebook App Settings
- [ ] Terms of Service URL added in Facebook App Settings
- [ ] URLs are accessible (can be opened in browser)
- [ ] URLs use HTTPS (required)
- [ ] Saved changes in Facebook Developer Console
- [ ] Wait 2-3 minutes for changes to propagate
- [ ] Try Facebook login again

## 🔗 Direct Links

- **App Settings**: https://developers.facebook.com/apps/1216817840509141/settings/basic/
- **Facebook Login Settings**: https://developers.facebook.com/apps/1216817840509141/fb-login/settings/

## ⚠️ Important Notes

1. **HTTPS Required**: Both URLs must use HTTPS
2. **Publicly Accessible**: URLs must be accessible without authentication
3. **Propagation Time**: Changes may take 2-3 minutes to take effect
4. **App Review**: If your app is in Production mode, you may need to submit for App Review

## 🎯 After Adding URLs

1. Save changes in Facebook Developer Console
2. Wait 2-3 minutes
3. Clear browser cache
4. Try Facebook login again
5. You should now see the Facebook login page instead of the privacy consent page

