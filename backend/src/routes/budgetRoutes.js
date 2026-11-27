const express = require('express');
const {
  getBudget,
  updateBudget,
  setDailyLimit,
  deleteDailyLimit,
  resetBudget,
  runAutoSave,
} = require('../controllers/budgetController');

const router = express.Router();

router.get('/', getBudget);
router.put('/', updateBudget);
router.patch('/daily-limit/:date', setDailyLimit);
router.delete('/daily-limit/:date', deleteDailyLimit);
router.post('/auto-save', runAutoSave);
router.delete('/reset', resetBudget);

module.exports = router;

