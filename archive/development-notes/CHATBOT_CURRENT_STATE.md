# Chatbot Current State

## Summary

The current chatbot is a constrained RAG-lite Hebrew tutor POC.
It retrieves lesson chunks from transcript text files, builds one system message that includes approved vocabulary and approved curriculum context, sends that to an LLM, then replaces unsafe answers with a fixed fallback.

## Input and Output

- Input: one user question string.
- Output: one short Hebrew answer string.
- Optional behavior in the prompt: add a short Arabic translation only if explicitly requested by the caller.
- Actual POC normalization: only the first non-empty line of the model output is kept.

## Provider and Model

- Provider used in the saved run: `gemini`
- Model used in the saved run: `gemini-2.5-flash-lite`
- The script also contains adapters for `openai` with `gpt-4o-mini` and `anthropic` with `claude-3-5-haiku-latest`.

## Retrieval

- Data source in the saved run: `ai-service/data/transcripts/A1`
- Transcript count in the saved run: 35 files
- Chunks created in the saved run: 100
- Retrieval type: lexical overlap over Hebrew tokens
- Selection rule:
  - tokenize the question into normalized Hebrew tokens
  - compute overlap with each chunk token set
  - sort by overlap score, then chunk token count
  - keep up to 5 chunks with overlap > 0
  - if no overlap exists, return the first 5 chunks

## Vocabulary Leakage Check

- Approved vocabulary is extracted from the transcript corpus itself.
- After the model responds, Hebrew tokens from the answer are normalized and compared against the approved vocabulary set.
- If any Hebrew token is outside the approved vocabulary, the answer is replaced with the fixed fallback.
- The fallback tokens themselves are treated as approved.

## Fallback Behavior

The current POC has one fixed fallback:

`אני לא יודע את זה עדיין`

Fallback is used in these cases:

- immediate fallback before the model call if the question contains Latin letters
- immediate fallback before the model call if the question contains Arabic letters
- post-generation fallback if the model answer leaks vocabulary outside the approved list

There is no structured fallback reason field in the POC.

## Prompt Rules

The current system prompt enforces:

- Hebrew-only main answer
- approved vocabulary only
- approved curriculum context only
- 1 or 2 short sentences
- no English or Arabic in the main answer
- exact fallback if the question is outside scope

## Quality and Cost

Saved run metrics from `results.json`:

- Average latency: 4.83s
- P95 latency: 8.81s
- Best latency: 0.00s
- Worst latency: 10.69s
- Total cost for 10 requests: $0.0020445
- Estimated 1000 daily requests: about $0.20445
- Vocabulary leakage count: 0

## Evaluation

- The current evaluation set contains 10 prompts in `test-prompts.json`.
- Labels are simple:
  - `answer_from_curriculum`
  - `fallback`
- Verdict logic is basic:
  - `Good` for correct fallback or acceptable curriculum response
  - `Acceptable` for safe fallback where a richer answer may exist
  - `Bad` for empty response, vocabulary leakage, or wrong fallback behavior

## Current Limitations

- No API endpoint yet in the original POC
- No multi-turn memory
- No caching
- No structured response schema
- No explicit fallback reason
- No timeout wrapper for every provider
- Retrieval is lexical only, not semantic
