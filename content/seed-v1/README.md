# Lisan Seed Dataset v1

## Overview

First structured training dataset for the Lisan AI model.

The dataset contains Hebrew A1 learning content for Arabic-speaking students.

The raw A1 transcripts were cleaned, renamed, corrected where needed, categorized, and converted into structured JSON entries that can be consumed by the AI pipeline.

## Structure

- `lisan-seed-v1.json` — Main structured dataset file
- `raw-transcripts/` — Cleaned original transcript files
- `categories.json` — Transcript categorization map
- `audio/` — MP3 pronunciation files
- `approval-signature.md` — Lisan teacher approval file

## Dataset Statistics

- Total phrases: 163
- Source transcripts: 35
- Covered transcripts: 35 / 35
- Level: A1 Beginner
- JSON status: Valid
- TODO fields: 0
- Audio files: Pending / to be added
- Approval status: Pending teacher approval

## Categories Breakdown

- daily_life
- directions
- family
- food_restaurant
- greetings
- introductions
- numbers
- shopping_market

## Audio Sources

The original source transcript recordings are included under:

`content/seed-v1/audio/source-transcripts/`

There are 35 source audio files, one for each cleaned A1 transcript.

Phrase-level audio files are still pending. For entries without phrase-level audio, the JSON field is marked as `audio_pending`.

Future phrase-level audio files should be added later under:

`content/seed-v1/audio/`

Expected phrase-level audio format:

- MP3
- 16 kHz
- Mono
- Filename matching entry ID, for example: `L1_001.mp3`

## Usage

This dataset can be used by:

- Pronunciation Assessment module
- Chat AI module
- Game Generator module
- Beginner Hebrew learning activities

## Validation

The JSON file was validated using:

`python3 -m json.tool content/seed-v1/lisan-seed-v1.json`

The dataset currently contains 163 structured phrase entries.

All 35 transcript files are covered.

All Hebrew phrases were checked against their source transcript files.

## Known Limitations

- Audio files are not yet complete.
- Teacher approval is still pending.
- The dataset currently focuses on A1 beginner content only.
- Some corrected transcript lines should still be reviewed by a Lisan teacher before final approval.

## Version History

v1.0: Initial seed dataset with 35 raw transcripts and 163 structured A1 phrases.
