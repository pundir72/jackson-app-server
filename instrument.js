const Sentry = require("@sentry/node");
const dotenv = require("dotenv");

dotenv.config();

// Error tracking via Sentry (sentry.io).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",
    release: process.env.SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
  });
  console.log(
    `✅ Sentry error tracking initialized (env: ${
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development"
    })`,
  );
} else {
  console.log("ℹ️ Sentry error tracking disabled (SENTRY_DSN not set)");
}

module.exports = Sentry;
