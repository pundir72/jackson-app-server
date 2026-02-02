const winston = require("winston");
const path = require("path");
const fs = require("fs");
const { context, trace } = require("@opentelemetry/api");

// Determine log directory: use env var, or default to ./logs for local dev, /var/log/app for Docker
const logDir = process.env.LOG_DIR || (process.env.NODE_ENV === "production" && fs.existsSync("/.dockerenv") ? "/var/log/app" : path.join(process.cwd(), "logs"));

// Ensure log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  console.warn(`Warning: Could not create log directory ${logDir}:`, err.message);
  // Fallback to current directory if log directory creation fails
  if (logDir !== process.cwd()) {
    console.warn(`Falling back to current directory for logs`);
  }
}

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
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({ filename: path.join(logDir, "app.log") }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
