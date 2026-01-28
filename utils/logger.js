const winston = require("winston");
const { context, trace } = require("@opentelemetry/api");

const addTraceContext = winston.format((info) => {
  const span = trace.getSpan(context.active());
  if (span) {
    const spanContext = span.spanContext();
    info.trace_id = spanContext.traceId;
    info.span_id = spanContext.spanId;
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    addTraceContext(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: "/var/log/app/error.log",
      level: "error",
    }),
    new winston.transports.File({ filename: "/var/log/app/app.log" }),
    new winston.transports.Console(),
  ],
});

module.exports = logger;
