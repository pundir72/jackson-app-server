const { metrics } = require("@opentelemetry/api");

const meter = metrics.getMeter("jackson-app-backend");

const requestCounter = meter.createCounter("http_requests_total", {
  description: "Total HTTP requests",
});

module.exports = { requestCounter };
