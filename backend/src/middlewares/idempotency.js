const IdempotencyKey = require('../models/IdempotencyKey');

/**
 * Stripe-style Idempotency-Key middleware to prevent duplicate POST submissions.
 * Clients pass header: `Idempotency-Key: <unique-uuid>`.
 */
async function idempotencyMiddleware(req, res, next) {
  const rawKey = req.headers['idempotency-key'];
  if (typeof rawKey !== 'string' || !rawKey.trim()) {
    return next();
  }

  const key = rawKey.trim().slice(0, 128);

  try {
    const existing = await IdempotencyKey.findOne({ key }).lean();
    if (existing) {
      res.setHeader('X-Idempotent-Replayed', 'true');
      return res.status(existing.statusCode).json(existing.responseBody);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const serializedBody = JSON.parse(JSON.stringify(body));
        IdempotencyKey.create({
          key,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          responseBody: serializedBody,
        }).catch(() => {
          // Ignore duplicate race condition
        });
      }
      return originalJson(body);
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { idempotencyMiddleware };
