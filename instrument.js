const Sentry = require("@sentry/node");
const dotenv = require("dotenv");
const { context, trace } = require("@opentelemetry/api");
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");
const {
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

dotenv.config();

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
const serviceName =
  process.env.OTEL_SERVICE_NAME || "jackson-app-backend";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
    }),
    exportIntervalMillis: 5000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log("✅ OpenTelemetry initialized (traces + metrics)");

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
