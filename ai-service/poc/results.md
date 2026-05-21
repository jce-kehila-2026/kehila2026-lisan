# Chat POC Evaluation Results

## Test Setup
- LLM: `gemini-2.5-flash-lite` (gemini)
- Date: `2026-05-12`
- Test questions: 10
- System prompt version: `v1`
- Lisan content used: `txt:C:\Users\mshar\Desktop\lisan\kehila2026-lisan\ai-service\data\transcripts\A1`

## Quantitative Results
- Average latency: 4.83 seconds (target: < 3s)
- 95th percentile latency: 8.81 seconds
- Best-case latency: 0.00 seconds
- Worst-case latency: 10.69 seconds
- Total cost for 10 requests: $0.002044
- Estimated cost for 1000 daily requests: $0.2044/day
- Estimated daily cost for 50 students x 10 exchanges: $0.1022/day
- Estimated monthly cost: $3.0667/month

## Qualitative Results

### Question 1: "מי את?"
- AI Response: שלום, אני עמל.
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Responded within curriculum and vocabulary constraints.

### Question 2: "מאיפה את?"
- AI Response: אני לא יודע את זה עדיין
- Verdict: Acceptable
- Used approved vocabulary only: Yes
- Notes: Safe fallback, but the curriculum may support a richer answer.

### Question 3: "אני רוצה קפה"
- AI Response: בסדר. קפה אחד.
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Responded within curriculum and vocabulary constraints.

### Question 4: "כמה זה עולה?"
- AI Response: שקל וחצי לקילו.
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Responded within curriculum and vocabulary constraints.

### Question 5: "איפה הדואר?"
- AI Response: הדואר ליד החנות.
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Responded within curriculum and vocabulary constraints.

### Question 6: "מה שלומך?"
- AI Response: הכל בסדר. תודה.
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Responded within curriculum and vocabulary constraints.

### Question 7: "אני לא מבינה"
- AI Response: אני לא יודע את זה עדיין
- Verdict: Acceptable
- Used approved vocabulary only: Yes
- Notes: Safe fallback, but the curriculum may support a richer answer.

### Question 8: "תסביר לי בבקשה"
- AI Response: אני לא יודע את זה עדיין
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Correctly refused out-of-scope input.

### Question 9: "What does שלום mean?"
- AI Response: אני לא יודע את זה עדיין
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Correctly refused out-of-scope input.

### Question 10: "أنا تلميذة"
- AI Response: אני לא יודע את זה עדיין
- Verdict: Good
- Used approved vocabulary only: Yes
- Notes: Correctly refused out-of-scope input.

## Findings
- 10 of 10 responses were rated Good or Acceptable.
- The 3-second NFR was did not meet on average.
- Vocabulary leakage count: 0.

## Recommendations
- Proceed decision: yellow-light
- Re-run with the real Abdullah transcript set if the current run used placeholder or partial data.
- Compare the same prompt set with the second provider before locking the Sprint 3 integration choice.
