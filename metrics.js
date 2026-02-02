const { metrics } = require("@opentelemetry/api");

const meter = metrics.getMeter("jackson-app-backend");

const requestCounter = meter.createCounter("http_requests_total", {
  description: "Total HTTP requests",
});

const serverRequestCounter = meter.createCounter("http_server_requests_total", {
  description: "Total inbound HTTP requests",
});

const requestDurationHistogram = meter.createHistogram(
  "http_server_duration_milliseconds",
  {
    description: "Inbound HTTP request duration in milliseconds",
    unit: "ms",
  }
);

module.exports = {
  requestCounter,
  serverRequestCounter,
  requestDurationHistogram,
};
