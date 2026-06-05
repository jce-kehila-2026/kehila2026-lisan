const { db } = require('../config/firebase');

exports.getAllTranscripts = async (req, res) => {
    try {

        const snapshot = await db.collection('transcripts').get();

        const transcripts = [];

        snapshot.forEach(doc => {
            transcripts.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return res.status(200).json(sortTranscripts(transcripts));

    } catch (error) {

        console.error('Error fetching transcripts:', error);

        return res.status(500).json({
            error: 'Server error'
        });
    }
};

exports.getTranscriptsByLevel = async (req, res) => {
    try {

        const { level } = req.params;

        const snapshot = await db
            .collection('transcripts')
            .where('level', '==', level)
            .get();

        const transcripts = [];

        snapshot.forEach(doc => {
            transcripts.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return res.status(200).json(sortTranscripts(transcripts));

    } catch (error) {

        console.error('Error fetching transcripts by level:', error);

        return res.status(500).json({
            error: 'Server error'
        });
    }
};

exports.searchTranscripts = async (req, res) => {
    try {

        const { q, level } = req.query;

        if (!q || q.trim() === '') {
            return res.status(400).json({
                error: 'Search query is required'
            });
        }

        const snapshot = await db.collection('transcripts').get();

        const results = [];

        snapshot.forEach(doc => {

            const data = doc.data();

            const matchesText =
                data.text &&
                data.text.includes(q);

            const matchesLevel =
                !level || data.level === level;

            if (matchesText && matchesLevel) {

                results.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        return res.status(200).json({
            query: q,
            level: level || 'all',
            count: results.length,
            results: sortTranscripts(results)
        });

    } catch (error) {

        console.error('Error searching transcripts:', error);

        return res.status(500).json({
            error: 'Server error'
        });
    }
};

function sortTranscripts(transcripts) {
    return [...transcripts].sort((left, right) => {
        const leftKey = [
            left.level || '',
            left.fileName || left.source || '',
            left.id || '',
        ].join('|');
        const rightKey = [
            right.level || '',
            right.fileName || right.source || '',
            right.id || '',
        ].join('|');

        return leftKey.localeCompare(rightKey);
    });
}
