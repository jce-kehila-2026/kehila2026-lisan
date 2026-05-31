const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

router.post('/generate', async (req, res) => {
  try {
    const { transcript, level, category } = req.body;

    if (!transcript || !level || !category) {
      return res.status(400).json({ error: 'Missing required fields: transcript, level, or category' });
    }

    const systemPrompt = `You are a linguistic AI assistant acting as the brain for an educational dataset generator.
Your task is to take a raw Hebrew audio transcript and perform the following:
1. Slice the provided Hebrew transcript into logical, individual sentences.
2. Translate each sentence into Arabic.
3. Extract key vocabulary words from the text (translating them to Arabic, providing English transliteration, and part of speech).
4. Return a STRICT JSON object containing two arrays: "sentences" and "vocabulary".

Ensure you adhere to this EXACT JSON schema for the output:
{
  "sentences": [
    {
      "id": "L2_[RANDOM_3_DIGIT_NUM]",
      "level": "${level}",
      "category": "${category}",
      "hebrew": "[Sliced Hebrew Sentence]",
      "arabic": "[Arabic Translation]",
      "transliteration": "",
      "phonetic_breakdown": [],
      "audio_reference": "audio_pending",
      "difficulty_score": 2,
      "context_usage": "",
      "source_transcript": "generated.mp3",
      "approved_responses": [],
      "related_vocabulary": [],
      "common_mistakes": [],
      "game_usage": { "fill_in_blank": "", "options": [], "correct": "", "matching_pair": "" }
    }
  ],
  "vocabulary": [
    {
      "id": "A2V_[RANDOM_3_DIGIT_NUM]",
      "level": "${level}",
      "hebrew": "[Extracted Word/Phrase]",
      "arabic": "[Arabic Translation]",
      "transliteration": "[English Transliteration]",
      "part_of_speech": "[noun/verb/adjective/etc]",
      "source_transcript": "generated.mp3"
    }
  ]
}
`;

    const completion = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Transcript:\n${transcript}`,
      config: {
        responseMimeType: 'application/json',
        systemInstruction: systemPrompt
      }
    });

    const responseContent = completion.text;
    const parsedData = JSON.parse(responseContent);

    res.json(parsedData);
  } catch (error) {
    console.error('Error generating dataset via Gemini:', error);
    res.status(500).json({ error: 'Failed to generate dataset', details: error.message });
  }
});

module.exports = router;
