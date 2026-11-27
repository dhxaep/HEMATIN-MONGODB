const express = require('express');
const { parseReceipt } = require('../controllers/ocrController');

const router = express.Router();

router.post('/parse', parseReceipt);

module.exports = router;

