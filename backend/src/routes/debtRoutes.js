const express = require('express');
const {
  getDebts,
  createDebt,
  getDebtById,
  updateDebt,
  toggleDebtPaid,
  deleteDebt,
} = require('../controllers/debtController');

const router = express.Router();

router.get('/', getDebts);
router.post('/', createDebt);
router.get('/:id', getDebtById);
router.put('/:id', updateDebt);
router.patch('/:id/toggle-paid', toggleDebtPaid);
router.delete('/:id', deleteDebt);

module.exports = router;

