# Lisan Seed Dataset v1 — B1

This folder contains the B1 seed dataset materials for the Lisan project.

## Current status

- Level: B1
- Transcript files: 15
- Structured JSON entries: 216 (lisan-seed-v1-b1.json)
- Vocabulary entries: 74 (vocabulary-b1.json)
- Transcript corrections: applied to 10_sicha-rania-sara.txt and 03_ma-yihye-im-hachom.txt
- Phrase-level audio: pending
- Source transcript audio: pending copy
- Teacher approval: pending

## Folder structure

- `raw-transcripts/` — cleaned transcript text files
- `audio/source-transcripts/` — full source transcript recordings
- `categories.json` — dataset categories for B1
- `vocabulary-b1.json` — vocabulary entries for B1
- `lisan-seed-v1-b1.json` — structured dataset entries
- `approval-signature.md` — teacher approval status

## Notes

- JSON Hebrew phrases must come exactly from the source transcript files.
- No invented Hebrew phrases should be added.
- Phrase-level `audio_reference` should stay `audio_pending` unless phrase audio files are created.
