import * as Sentry from "@sentry/node";
import dotenv from "dotenv";
import { context, trace } from "@opentelemetry/api";

dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,

  beforeSend(event) {
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
