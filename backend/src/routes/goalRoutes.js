const express = require('express');
const {
  getGoals,
  createGoal,
  getGoalById,
  updateGoal,
  depositGoal,
  deleteGoal,
} = require('../controllers/goalController');

const router = express.Router();

router.get('/', getGoals);
router.post('/', createGoal);
router.get('/:id', getGoalById);
router.put('/:id', updateGoal);
router.patch('/:id/deposit', depositGoal);
router.delete('/:id', deleteGoal);

module.exports = router;

