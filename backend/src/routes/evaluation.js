const express = require('express');

const router = express.Router();

const evaluationController = require('../controllers/evaluationController');

router.get('/context', evaluationController.getContext);
router.post('/attempts', evaluationController.saveAttempt);

module.exports = router;