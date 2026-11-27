const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

/**
 * Assigns a unique X-Request-Id to every request & emits structured JSON access logs.
 */
function requestObservability(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim()
      ? incomingId.trim().slice(0, 64)
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startNs = process.hrtime.bigint();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    const logEntry = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    };
    console.log(JSON.stringify(logEntry));
  });

  next();
}

/**
 * Recursively strips MongoDB operator keys ($...) and dotted paths to prevent NoSQL injection.
 */
function sanitizeObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      clean[key] = sanitizeObject(val);
    }
    return clean;
  }
  return value;
}

function sanitizeNoSql(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

const isTestEnv = () => process.env.NODE_ENV === 'test';

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan API. Silakan coba lagi dalam beberapa menit.',
  },
});

const aiOcrRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'Batas permintaan AI/OCR tercapai (maksimal 25 kali per 15 menit).',
  },
});

module.exports = {
  requestObservability,
  sanitizeNoSql,
  apiRateLimiter,
  aiOcrRateLimiter,
};
