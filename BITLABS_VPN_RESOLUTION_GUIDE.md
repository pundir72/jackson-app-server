# Bitlabs VPN Detection Resolution Guide

## Problem
Production server IP is being flagged as VPN by Bitlabs, causing empty survey results:
```json
{
  "data": {
    "restriction_reason": {
      "using_vpn": true
    },
    "surveys": []
  }
}
```

## Solution Options

### Option 1: Contact Bitlabs Support (Recommended)

#### Step 1: Gather Required Information

Before contacting support, collect the following:

1. **Publisher Account Details:**
   - Publisher ID / Account Email
   - API Token (first 8 characters only for security)
   - Account Name/Company

2. **Server Information:**
   - Production server IP address(es)
   - Server hosting provider (e.g., AWS, DigitalOcean, Hetzner)
   - Server location/country
   - Server type (dedicated, VPS, cloud instance)

3. **API Details:**
   - API endpoint being called: `/v2/client/surveys`
   - Request headers being sent
   - Sample request/response with VPN restriction

4. **Error Evidence:**
   - Screenshot/logs showing `restriction_reason: { using_vpn: true }`
   - Trace ID from Bitlabs API response
   - Timestamp of when issue occurs

#### Step 2: Contact Bitlabs Support

**Email:** support@bitlabs.ai  
**Subject:** VPN Detection Issue - Server IP Whitelist Request

**Email Template:**
```
Subject: VPN Detection Issue - Server IP Whitelist Request

Hello Bitlabs Support Team,

I am experiencing an issue where our production server IP is being incorrectly flagged as a VPN, causing the surveys API to return empty results with restriction_reason: { using_vpn: true }.

Publisher Account Information:
- Publisher ID: [YOUR_PUBLISHER_ID]
- API Token: [FIRST_8_CHARS]...
- Account Email: [YOUR_EMAIL]

Server Information:
- Production Server IP: [YOUR_SERVER_IP]
- Hosting Provider: [AWS/DigitalOcean/etc.]
- Server Location: [Country/City]
- Server Type: [Dedicated/VPS/Cloud]

API Details:
- Endpoint: GET /v2/client/surveys
- API Token: [FIRST_8_CHARS]...
- Request Headers: X-Api-Token, X-User-Id

Error Evidence:
- Trace ID: [TRACE_ID_FROM_RESPONSE]
- Error Response:
{
  "data": {
    "restriction_reason": {
      "using_vpn": true
    },
    "surveys": []
  },
  "status": "success",
  "trace_id": "[TRACE_ID]"
}

Request:
We are making API calls from our backend server to fetch surveys for our users. The server IP is a legitimate production server, not a VPN. Could you please:

1. Whitelist our server IP address(es) to prevent VPN detection
2. Or provide guidance on how to properly configure our API calls to avoid VPN detection

We have already removed client_ip and client_user_agent parameters from our requests as recommended, but the issue persists.

Thank you for your assistance.

Best regards,
[Your Name]
[Your Company]
[Contact Email]
```

#### Step 3: Alternative Contact Methods

1. **Bitlabs Dashboard:**
   - Log into your Bitlabs Publisher Dashboard
   - Look for "Support" or "Help" section
   - Submit a support ticket

2. **Bitlabs Documentation:**
   - Check: https://developer.bitlabs.ai/docs
   - Look for "Contact Support" or "Help" links

3. **Bitlabs Developer Portal:**
   - Visit: https://developer.bitlabs.ai
   - Check for support contact information

### Option 2: Technical Workarounds (Already Implemented)

We've already implemented the following workarounds:

1. **Removed Server IP from Requests:**
   - Removed `ip: req.ip || req.connection.remoteAddress` from all Bitlabs API calls
   - Removed `userAgent: req.headers["user-agent"]` from requests
   - Bitlabs now uses `X-User-Id` header for user tracking instead

2. **VPN Detection Handling:**
   - When VPN restriction is detected, we return admin-configured surveys even without fresh URLs
   - This allows users to see surveys, though they may be marked as temporarily unavailable

### Option 3: Alternative Approaches

1. **Use Proxy/CDN:**
   - Route API calls through a proxy service
   - Use a CDN that provides residential IP addresses
   - **Note:** This may violate Bitlabs terms of service - check first

2. **Separate API Server:**
   - Deploy a separate server with a different IP
   - Use a server in a location less likely to be flagged
   - **Note:** May still be flagged if using cloud providers

3. **Client-Side API Calls:**
   - Make API calls directly from client (mobile app/web)
   - Use user's actual IP address
   - **Note:** Requires exposing API token to client (security risk)

## Current Implementation Status

✅ **Completed:**
- Removed `ip` parameter from all Bitlabs API calls
- Removed `userAgent` parameter from requests
- Added VPN detection handling in survey routes
- Added logging for VPN restriction detection

## Testing After Support Resolution

Once Bitlabs support whitelists your IP:

1. **Test API Call:**
   ```bash
   curl -X GET "https://api.bitlabs.ai/v2/client/surveys" \
     -H "X-Api-Token: YOUR_API_TOKEN" \
     -H "X-User-Id: test-user-id" \
     -H "Accept: application/json"
   ```

2. **Check Response:**
   - Should NOT contain `restriction_reason: { using_vpn: true }`
   - Should return surveys array with data

3. **Monitor Logs:**
   - Check server logs for VPN restriction warnings
   - Verify surveys are being returned

## Additional Resources

- **Bitlabs API Documentation:** https://developer.bitlabs.ai/docs
- **Bitlabs Support:** support@bitlabs.ai
- **Bitlabs Dashboard:** https://publisher.bitlabs.ai (or your dashboard URL)

## Notes

- **Response Time:** Bitlabs support typically responds within 24-48 hours
- **IP Whitelisting:** May take 1-2 business days to process
- **Alternative:** If support is slow, the current workaround (removing IP) should work for most cases
- **Long-term:** Consider using Bitlabs webhook/callback system instead of polling API

## Environment Variables Reference

Current Bitlabs configuration:
```env
BITLABS_BASE_URL=https://api.bitlabs.ai
BITLABS_API_TOKEN=your_api_token_here
BITLABS_SECRET_KEY=your_secret_key_here
BITLABS_SERVER_TO_SERVER_KEY=your_server_to_server_key_here
```

## Code Locations

Files modified to remove IP:
- `routes/non-game-offers.js` (lines 1568, 1811, 221)
- `utils/bitlabs-non-games.js` (removed client_ip, client_user_agent)
- `services/bitlabs.service.js` (removed client_ip, client_user_agent)
