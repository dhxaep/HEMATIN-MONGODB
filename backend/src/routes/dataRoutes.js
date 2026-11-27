const express = require('express');
const {
  exportAllData,
  importAllData,
  clearAllData,
} = require('../controllers/dataController');

const router = express.Router();

router.get('/export', exportAllData);
router.post('/import', importAllData);
router.delete('/clear', clearAllData);

module.exports = router;

