const express = require('express');
const router = express.Router();
const probeController = require('../controllers/probeController');

// POST /api/probe
router.post('/probe', probeController.probe);

module.exports = router;
