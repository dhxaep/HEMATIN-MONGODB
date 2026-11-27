const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const apiRoutes = require('./routes');
const { notFoundHandler, globalErrorHandler } = require('./middlewares/errorHandler');
const {
  requestObservability,
  sanitizeNoSql,
  apiRateLimiter,
} = require('./middlewares/securityAndObservability');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false, // agar Swagger UI di /api/docs bisa memuat aset inline
  })
);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3099'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    exposedHeaders: ['X-Request-Id', 'X-Idempotent-Replayed'],
  })
);

app.use(requestObservability);
app.use(express.json({ limit: '2mb' }));
app.use(sanitizeNoSql);

app.get('/', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Selamat datang di Hematin REST API (Node.js + ExpressJS + MongoDB)',
    requestId: req.requestId,
    data: {
      version: '2.1.0',
      healthCheck: '/api/health',
      swaggerDocs: '/api/docs',
      openApiJson: '/api/docs.json',
      endpoints: {
        analytics: '/api/analytics/summary',
        transactions: '/api/transactions',
        transactionSummary: '/api/transactions/summary',
        transactionTrash: '/api/transactions/trash',
        budget: '/api/budget',
        goals: '/api/goals',
        debts: '/api/debts',
        ocrParser: '/api/ocr/parse',
        aiAdvisor: '/api/ai/advisor',
        dataBackup: '/api/data/export',
      },
    },
  });
});

app.use('/api', apiRateLimiter, apiRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
