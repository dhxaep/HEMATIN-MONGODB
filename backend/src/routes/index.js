const express = require('express');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');

const transactionRoutes = require('./transactionRoutes');
const budgetRoutes = require('./budgetRoutes');
const goalRoutes = require('./goalRoutes');
const debtRoutes = require('./debtRoutes');
const ocrRoutes = require('./ocrRoutes');
const aiRoutes = require('./aiRoutes');
const dataRoutes = require('./dataRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const { aiOcrRateLimiter } = require('../middlewares/securityAndObservability');
const { swaggerDocument } = require('../config/swagger');

const router = express.Router();

router.get('/health', async (req, res) => {
  const readyState = mongoose.connection.readyState;
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  let dbLatencyMs = null;
  if (readyState === 1 && mongoose.connection.db) {
    try {
      const start = process.hrtime.bigint();
      await mongoose.connection.db.admin().ping();
      dbLatencyMs = Number((Number(process.hrtime.bigint() - start) / 1e6).toFixed(2));
    } catch {
      dbLatencyMs = null;
    }
  }

  const mem = process.memoryUsage();
  return res.status(200).json({
    success: true,
    message: 'Hematin REST API is running',
    data: {
      status: 'ok',
      version: '2.1.0',
      database: statusMap[readyState] || 'unknown',
      dbLatencyMs,
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMB: Number((mem.rss / 1024 / 1024).toFixed(1)),
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// Interactive OpenAPI 3.0 / Swagger Docs
router.get('/docs.json', (_req, res) => res.status(200).json(swaggerDocument));
router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

router.use('/analytics', analyticsRoutes);
router.use('/transactions', transactionRoutes);
router.use('/budget', budgetRoutes);
router.use('/goals', goalRoutes);
router.use('/debts', debtRoutes);
router.use('/ocr', aiOcrRateLimiter, ocrRoutes);
router.use('/ai', aiOcrRateLimiter, aiRoutes);
router.use('/data', dataRoutes);

module.exports = router;
