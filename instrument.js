const Sentry = require("@sentry/node");
const dotenv = require("dotenv");
const { redactUrl } = require("./utils/redactUrl");

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
    beforeSend(event) {
      // Keep callback secrets (?token=) out of error reports
      if (event.request) {
        event.request.url = redactUrl(event.request.url);
        if (typeof event.request.query_string === "string") {
          event.request.query_string = redactUrl(`?${event.request.query_string}`).slice(1);
        }
      }
      return event;
    },
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
