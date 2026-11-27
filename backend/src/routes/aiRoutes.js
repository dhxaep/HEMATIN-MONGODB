const express = require('express');
const { askAdvisor } = require('../controllers/aiController');

const router = express.Router();

router.post('/advisor', askAdvisor);

module.exports = router;

