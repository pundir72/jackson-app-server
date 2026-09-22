# OAuth configuration

Provider strategies are defined in `config/passport.js`; entry and callback
routes are in `routes/auth.js`.

| Provider | Entry route | Callback route |
| --- | --- | --- |
| Google | `/api/auth/google` | `/api/auth/google/callback` |
| Facebook | `/api/auth/facebook` | `/api/auth/facebook/callback` |

Provision client-owned OAuth applications. Configure the corresponding client
ID, secret, and callback URL from `.env.example` through deployment secrets.
The callback URLs registered with each provider must exactly match the values
used by this service, including scheme, hostname, port, and path.

Local callback URLs use port 4001 in the template. Set `FRONTEND_URL` and
`IOS_AUTH_URL_SCHEME` to the intended client destinations. Inspect the callback
handlers when integrating a client: they issue an application JWT after
resolving the provider identity.

The Google strategy is initialized during startup, so its configuration is
required even if a local test does not exercise Google login. Do not commit
provider access tokens or real callback responses as examples.

Test login with dedicated test accounts. Verify account linking, redirects,
and failed authorization flows before enabling an environment for users. See
`REVIEW.md` for authentication issues still requiring remediation.
