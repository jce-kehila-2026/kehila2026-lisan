const express = require('express');

const router = express.Router();

const transcriptsController = require('../controllers/transcriptsController');
const { requireUserOrInternalSecret } = require('../middleware/internalSecret');

// Course material: logged-in users, or the ai-service with the internal secret.
router.use(requireUserOrInternalSecret);

router.get('/', transcriptsController.getAllTranscripts);
router.get('/search', transcriptsController.searchTranscripts);
router.get('/level/:level', transcriptsController.getTranscriptsByLevel);

module.exports = router;
