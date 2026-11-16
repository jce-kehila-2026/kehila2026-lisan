#!/usr/bin/env python3
"""
Listen-and-choose helper for the ElevenLabs tutor voice.

Synthesizes the same 3 A1 Hebrew sentences (feminine address) for one or more
ElevenLabs voice IDs into ./tts_samples/*.mp3, so the owner can compare
voices — and compare the TTS-only feminine niqqud against plain text — by ear.

Needs ELEVENLABS_API_KEY in the environment. Each run spends real characters
(the script prints the total before calling the API).

Usage (from ai-service/):

  # 1. List voices that may suit a Hebrew female tutor
  python scripts/elevenlabs_voice_samples.py --list

  # 2. Synthesize samples (default: the voice the owner picked)
  python scripts/elevenlabs_voice_samples.py
  python scripts/elevenlabs_voice_samples.py --voices s0T0DT6EAPeX57MQpn3I otherVoiceId

  # Options
  --model eleven_v3        model id (default: the service default)
  --niqqud both|on|off     with / without the feminine niqqud layer (default: both)
  --out ./tts_samples      output folder
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.text_to_speech import (  # noqa: E402
    DEFAULT_ELEVENLABS_MODEL_ID,
    DEFAULT_ELEVENLABS_VOICE_ID,
    ELEVENLABS_API_BASE,
    ELEVENLABS_OUTPUT_FORMAT,
    _DEFAULT_ELEVENLABS_SPEED,
    _force_feminine_tts_forms,
)

# A1 level, addressed to a woman (feminine forms on purpose).
SAMPLE_SENTENCES = [
    ("01_greeting", "שלום! מה שלומך היום?"),
    ("02_question", "את רוצה לשתות קפה או תה?"),
    ("03_praise", "כל הכבוד! את מדברת עברית יפה מאוד."),
]


def _headers(api_key: str) -> dict[str, str]:
    return {"xi-api-key": api_key}


def list_voices(api_key: str) -> None:
    """Print voices that look suitable: female, and Hebrew-verified if possible."""
    seen: set[str] = set()
    rows: list[tuple[str, str, str, str]] = []
    token: str | None = None
    with httpx.Client(timeout=20) as client:
        for _ in range(10):  # at most 10 pages × 100
            params: dict[str, object] = {"page_size": 100, "gender": "female"}
            if token:
                params["next_page_token"] = token
            resp = client.get(
                f"{ELEVENLABS_API_BASE}/v2/voices",
                headers=_headers(api_key),
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            for voice in data.get("voices", []):
                vid = voice.get("voice_id", "")
                if not vid or vid in seen:
                    continue
                seen.add(vid)
                labels = voice.get("labels") or {}
                langs = {
                    (v.get("language") or "").lower()
                    for v in voice.get("verified_languages") or []
                }
                hebrew = "he" in langs or "hebrew" in langs or (
                    (labels.get("language") or "").lower() in {"he", "hebrew"}
                )
                rows.append((
                    "HE" if hebrew else "  ",
                    vid,
                    voice.get("name", ""),
                    ", ".join(
                        f"{k}={v}" for k, v in labels.items() if v
                    ),
                ))
            if not data.get("has_more"):
                break
            token = data.get("next_page_token")

    rows.sort(key=lambda r: (r[0] != "HE", r[2].lower()))
    print("HE = Hebrew listed in verified_languages / labels")
    for flag, vid, name, labels in rows:
        print(f"{flag}  {vid}  {name}  [{labels}]")
    print(f"\n{len(rows)} female voices. The library voice the owner picked: "
          f"{DEFAULT_ELEVENLABS_VOICE_ID}")


def synthesize_samples(
    api_key: str,
    voice_ids: list[str],
    model_id: str,
    niqqud: str,
    out_dir: Path,
) -> None:
    variants: list[tuple[str, bool]] = []
    if niqqud in ("both", "on"):
        variants.append(("niqqud", True))
    if niqqud in ("both", "off"):
        variants.append(("plain", False))

    jobs = []
    for voice_id in voice_ids:
        for slug, sentence in SAMPLE_SENTENCES:
            for tag, pointed in variants:
                text = _force_feminine_tts_forms(sentence) if pointed else sentence
                jobs.append((voice_id, slug, tag, text))

    total_chars = sum(len(j[3]) for j in jobs)
    print(f"{len(jobs)} requests, {total_chars} characters billed "
          f"(model {model_id}, {ELEVENLABS_OUTPUT_FORMAT}).")

    out_dir.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=30) as client:
        for voice_id, slug, tag, text in jobs:
            resp = client.post(
                f"{ELEVENLABS_API_BASE}/v1/text-to-speech/{voice_id}",
                headers={**_headers(api_key), "Accept": "audio/mpeg"},
                params={"output_format": ELEVENLABS_OUTPUT_FORMAT},
                json={
                    "text": text,
                    "model_id": model_id,
                    "language_code": "he",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.0,
                        "use_speaker_boost": True,
                        "speed": _DEFAULT_ELEVENLABS_SPEED,
                    },
                },
            )
            if resp.status_code != 200:
                print(f"FAILED {voice_id} {slug} {tag}: "
                      f"{resp.status_code} {resp.text[:200]}")
                continue
            path = out_dir / f"{voice_id}_{slug}_{tag}.mp3"
            path.write_bytes(resp.content)
            print(f"wrote {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--list", action="store_true",
                        help="list female voices (Hebrew-verified first)")
    parser.add_argument("--voices", nargs="+",
                        default=[DEFAULT_ELEVENLABS_VOICE_ID],
                        help="voice IDs to sample")
    parser.add_argument("--model", default=DEFAULT_ELEVENLABS_MODEL_ID)
    parser.add_argument("--niqqud", choices=("both", "on", "off"),
                        default="both")
    parser.add_argument("--out", default="./tts_samples")
    args = parser.parse_args()

    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        print("Set ELEVENLABS_API_KEY first.", file=sys.stderr)
        return 2

    if args.list:
        list_voices(api_key)
        return 0

    synthesize_samples(api_key, args.voices, args.model, args.niqqud,
                       Path(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
