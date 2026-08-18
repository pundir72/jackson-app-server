const Sentry = require("@sentry/node");
const dotenv = require("dotenv");
const { context, trace } = require("@opentelemetry/api");

dotenv.config();

// Error tracking via Sentry (sentry.io).
// OpenTelemetry (traces/metrics) is configured separately in otel.js —
// skipOpenTelemetrySetup prevents the two from registering competing providers.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",
    release: process.env.SENTRY_RELEASE || undefined,
    skipOpenTelemetrySetup: true,
    sendDefaultPii: false,
    beforeSend(event) {
      // Correlate Sentry events with OTel traces (viewable in Tempo/Grafana)
      const span = trace.getSpan(context.active());
      if (span) {
        const spanContext = span.spanContext();
        event.tags = {
          ...event.tags,
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
        };
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
