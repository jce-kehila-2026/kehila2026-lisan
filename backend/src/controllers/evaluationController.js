const {
    getEvaluationContext,
    saveStudentAttempt
} = require('../services/evaluationContextService');

const STAFF_ROLES = ['admin', 'teacher'];

exports.getContext = async (req, res) => {
    try {
        const { activityId, turnId } = req.query;

        // Students only ever read their own context. Admins/teachers may
        // pass ?userId= to read a student's context.
        const isStaff = STAFF_ROLES.includes(req.user?.role);
        const userId = isStaff && req.query.userId
            ? String(req.query.userId)
            : req.user?.uid;

        if (!userId || !activityId) {
            return res.status(400).json({
                success: false,
                error: 'activityId is required',
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
            activityId,
            turnId,
            recognizedTextHe,
            aiEvaluation,
            usage
        } = req.body;

        // Attempts are always recorded for the authenticated user; any
        // userId in the body is ignored.
        const userId = req.user?.uid;

        if (!userId || !activityId || !recognizedTextHe) {
            return res.status(400).json({
                success: false,
                error: 'activityId and recognizedTextHe are required',
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