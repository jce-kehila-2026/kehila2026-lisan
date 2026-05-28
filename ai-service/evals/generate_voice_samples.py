"""
generate_voice_samples.py

Creates synthetic WAV files for voice eval without a microphone.
Uses only Python stdlib (wave, struct, math) — no extra dependencies.

Each file is a valid 16-bit mono 16kHz WAV that Azure Speech / Whisper
will accept. The audio content is either silence or a sine-wave tone;
the real transcript comes from the STT service when run against actual
speech. For CI / offline testing the eval script mocks STT and reads
the expected transcript from voice_eval_cases.json directly.

Run once:
    python evals/generate_voice_samples.py
"""
from __future__ import annotations

import json
import math
import struct
import wave
from pathlib import Path

EVALS_DIR   = Path(__file__).parent
CASES_FILE  = EVALS_DIR / "voice_eval_cases.json"
OUTPUT_DIR  = EVALS_DIR / "voice_cases"

SAMPLE_RATE  = 16_000   # Hz  — Azure Speech / Whisper default
CHANNELS     = 1        # mono
SAMPLE_WIDTH = 2        # bytes (16-bit)
DURATION_S   = 1.5      # seconds per file — short enough to be fast


def _silence_frames(n_frames: int) -> bytes:
    return b"\x00\x00" * n_frames


def _tone_frames(n_frames: int, freq: float = 440.0, amplitude: float = 0.3) -> bytes:
    frames = []
    for i in range(n_frames):
        sample = amplitude * math.sin(2 * math.pi * freq * i / SAMPLE_RATE)
        frames.append(struct.pack("<h", int(sample * 32767)))
    return b"".join(frames)


def write_wav(path: Path, frames: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(frames)


def main() -> None:
    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    n_frames = int(SAMPLE_RATE * DURATION_S)

    for case in cases:
        rel_path = case["audio_path"]
        # audio_path is relative to the ai-service root
        out_path = EVALS_DIR.parent / rel_path
        tts_text = case.get("tts_text", "")

        if out_path.exists():
            print(f"  skip  {out_path.name}  (already exists)")
            continue

        # silence.wav → pure silence; all others → 440 Hz tone
        if not tts_text:
            frames = _silence_frames(n_frames)
            label = "silence"
        else:
            frames = _tone_frames(n_frames)
            label = "tone"

        write_wav(out_path, frames)
        print(f"  wrote {out_path.name}  [{label}, {DURATION_S}s, {SAMPLE_RATE}Hz mono 16-bit]")

    print(f"\nDone — {len(cases)} files processed in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
