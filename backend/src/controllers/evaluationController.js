const {
    getEvaluationContext,
    saveStudentAttempt
} = require('../services/evaluationContextService');

exports.getContext = async (req, res) => {
    try {
        const { userId, activityId, turnId } = req.query;

        if (!userId || !activityId) {
            return res.status(400).json({
                success: false,
                error: 'userId and activityId are required',
                code: 'MISSING_REQUIRED_PARAMS'
            });
        }

        const context = await getEvaluationContext({
            userId,
            activityId,
            turnId
        });

        return res.status(200).json({
            success: true,
            context
        });
    } catch (error) {
        return res.status(404).json({
            success: false,
            error: error.message || 'Context not found',
            code: error.code || 'CONTEXT_NOT_FOUND'
        });
    }
};

exports.saveAttempt = async (req, res) => {
    try {
        const {
            userId,
            activityId,
            turnId,
            recognizedTextHe,
            aiEvaluation,
            usage
        } = req.body;

        if (!userId || !activityId || !recognizedTextHe) {
            return res.status(400).json({
                success: false,
                error: 'userId, activityId, and recognizedTextHe are required',
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        const attempt = await saveStudentAttempt({
            userId,
            activityId,
            turnId,
            recognizedTextHe,
            aiEvaluation,
            usage
        });

        return res.status(201).json({
            success: true,
            attempt
        });
    } catch (error) {
        console.error('Save attempt error:', error);

        return res.status(500).json({
            success: false,
            error: 'Server error',
            code: 'SERVER_ERROR'
        });
    }
};