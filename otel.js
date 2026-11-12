const dotenv = require("dotenv");
const { redactUrl } = require("./utils/redactUrl");
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");
const {
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

dotenv.config();

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]:
    process.env.OTEL_SERVICE_NAME || "jackson-app-backend",
  [SemanticResourceAttributes.SERVICE_VERSION]:
    process.env.OTEL_SERVICE_VERSION || "1.0.0",
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
    process.env.OTEL_ENVIRONMENT || process.env.NODE_ENV || "development",
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
    }),
    exportIntervalMillis: 5000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": {
        enabled: true,
        // Keep callback secrets (?token=) out of exported spans
        requestHook: (span, request) => {
          // Incoming requests only (IncomingMessage has url + headers)
          if (typeof request.url !== "string" || !request.headers) return;
          const target = redactUrl(request.url);
          if (target === request.url) return;
          const scheme = request.socket?.encrypted ? "https" : "http";
          span.setAttribute("http.target", target);
          span.setAttribute("url.query", target.slice(target.indexOf("?") + 1));
          span.setAttribute("http.url", `${scheme}://${request.headers.host}${target}`);
        },
      },
      "@opentelemetry/instrumentation-express": {
        enabled: true,
      },
      "@opentelemetry/instrumentation-axios": {
        enabled: true,
      },
      "@opentelemetry/instrumentation-mysql2": {
        enabled: true,
      },
      "@opentelemetry/instrumentation-pg": {
        enabled: true,
      },
    }),
  ],
});

sdk.start();
console.log("✅ OpenTelemetry initialized (traces + metrics)");

process.on("SIGTERM", () => {
  sdk.shutdown().catch(() => {});
});
process.on("SIGINT", () => {
  sdk.shutdown().catch(() => {});
});
