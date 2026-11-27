const express = require('express');
const {
  createTransaction,
  getTransactions,
  getTransactionSummary,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTrashTransactions,
  restoreTransaction,
  bulkDeleteTransactions,
} = require('../controllers/transactionController');
const {
  validate,
  createTransactionSchema,
  updateTransactionSchema,
} = require('../middlewares/validate');
const { idempotencyMiddleware } = require('../middlewares/idempotency');

const router = express.Router();

// Penting: /summary dan /trash harus didaftarkan sebelum /:id
router.get('/summary', getTransactionSummary);
router.get('/trash', getTrashTransactions);

router.post('/', idempotencyMiddleware, validate({ body: createTransactionSchema }), createTransaction);
router.get('/', getTransactions);
router.delete('/', bulkDeleteTransactions);

router.post('/:id/restore', restoreTransaction);
router.get('/:id', getTransactionById);
router.put('/:id', validate({ body: updateTransactionSchema }), updateTransaction);
router.patch('/:id', validate({ body: updateTransactionSchema }), updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;
