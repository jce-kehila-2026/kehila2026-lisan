const express = require('express');

const router = express.Router();

const transcriptsController = require('../controllers/transcriptsController');

router.get('/', transcriptsController.getAllTranscripts);
router.get('/search', transcriptsController.searchTranscripts);
router.get('/level/:level', transcriptsController.getTranscriptsByLevel);

module.exports = router;