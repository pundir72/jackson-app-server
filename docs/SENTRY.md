# Error monitoring

The backend initializes Sentry in `instrument.js`. Leave `SENTRY_DSN` empty to
disable reporting. Configure a client-owned project through deployment secrets:

```dotenv
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=
```

Use a commit identifier or build number for `SENTRY_RELEASE`. Do not copy account
identifiers or ingestion URLs from another environment into this repository.

Route errors are captured by the error middleware in `server.js`. A
`/debug-sentry` endpoint is available when `NODE_ENV` is not `production`; it
intentionally returns an error to exercise reporting. Restrict access to
non-production environments.

Check the client-owned monitoring console for the expected environment and
release after deployment. Review event contents for sensitive request data
before enabling reporting for real users.
