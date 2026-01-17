import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("legal-tech-cyprus-api");

export const requestCounter = meter.createCounter(
  "http_requests_total",
  {
    description: "Total HTTP requests",
  }
);
