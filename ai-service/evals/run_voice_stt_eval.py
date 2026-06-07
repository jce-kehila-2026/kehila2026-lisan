"""
run_voice_stt_eval.py  —  REAL speech-to-text voice eval.

Unlike run_voice_eval.py (which feeds the expected transcript straight to the
chat engine, mocking STT), this harness exercises the **full production voice
pipeline on real audio**:

    audio (webm/opus) → real STT (Azure) → pronunciation scoring → chat engine

For each case it measures and reports:
  • STT transcript + accuracy (similarity vs the spoken text)
  • pronunciationScore (0-100, when Azure pronunciation is enabled)
  • STT latency and chat latency (ms)
  • teacher-response quality (non-empty, Hebrew-only, word count)

Audio is generated once with Azure TTS (Hebrew/Arabic/English voices) plus
procedural silence / white-noise / low-volume clips, encoded to webm/opus to
mirror exactly what the browser uploads. Clips are cached under
evals/voice_stt_audio/ so reruns are cheap (pass --regen to rebuild them).

Usage:
  python evals/run_voice_stt_eval.py            # generate (if missing) + run
  python evals/run_voice_stt_eval.py --regen    # force-rebuild audio
  python evals/run_voice_stt_eval.py --no-pron  # skip pronunciation scoring

Requires AZURE_SPEECH_KEY/REGION and STT_ENGINE=azure in .env. ffmpeg is used
only to *encode* the test clips; STT itself decodes webm in-process via PyAV.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import statistics
import subprocess
import sys
import time
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# --- path bootstrap (must precede local imports) ---
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Force UTF-8 stdout so Hebrew doesn't crash Windows cp1252 terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EVALS_DIR = Path(__file__).parent
CASES_FILE = EVALS_DIR / "voice_stt_cases.json"
AUDIO_DIR = EVALS_DIR / "voice_stt_audio"
REPORTS_DIR = EVALS_DIR / "reports"

SAMPLE_RATE = 16_000
LATENCY_BUDGET_MS = 6000  # Azure STT (~1-2s) + Gemini can occasionally approach ~4s.

ARABIC_RE = re.compile(r"[؀-ۿ]")
LATIN_RE = re.compile(r"[A-Za-z]")
NIQQUD_RE = re.compile(r"[֑-ׇ]")

TTS_VOICE = {
    "he": "he-IL-HilaNeural",
    "ar": "ar-SA-ZariyahNeural",
    "en": "en-US-JennyNeural",
}

FINAL_FORMS = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}


# ---------------------------------------------------------------------------
# .env loader (keeps the script standalone)
# ---------------------------------------------------------------------------

def _load_env() -> None:
    env_path = _ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        import os
        os.environ.setdefault(key.strip(), val.strip())


# ---------------------------------------------------------------------------
# Text normalization + similarity
# ---------------------------------------------------------------------------

def _normalize_he(text: str) -> str:
    text = NIQQUD_RE.sub("", text or "")
    text = "".join(FINAL_FORMS.get(c, c) for c in text)
    text = re.sub(r"[^א-ת0-9A-Za-z؀-ۿ ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _similarity(expected: str, actual: str) -> float:
    import difflib
    a, b = _normalize_he(expected), _normalize_he(actual)
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(a=a, b=b).ratio()


def _hebrew_word_count(text: str) -> int:
    return len([w for w in _normalize_he(text).split() if re.search(r"[א-ת]", w)])


# ---------------------------------------------------------------------------
# Audio generation
# ---------------------------------------------------------------------------

def _tts_pcm(text: str, lang: str) -> bytes:
    """Synthesize `text` with Azure TTS → raw 16k mono s16le PCM bytes."""
    import os
    import azure.cognitiveservices.speech as sdk

    cfg = sdk.SpeechConfig(
        subscription=os.environ["AZURE_SPEECH_KEY"],
        region=os.environ["AZURE_SPEECH_REGION"],
    )
    cfg.speech_synthesis_voice_name = TTS_VOICE.get(lang, TTS_VOICE["he"])
    cfg.set_speech_synthesis_output_format(
        sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
    )
    syn = sdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
    result = syn.speak_text_async(text).get()
    if result.reason != sdk.ResultReason.SynthesizingAudioCompleted:
        raise RuntimeError(f"TTS failed for {text!r}: {result.reason}")
    # result.audio_data is a RIFF WAV — strip header → raw PCM frames
    with wave.open(io.BytesIO(result.audio_data), "rb") as w:
        return w.readframes(w.getnframes())


def _silence_pcm(seconds: float = 1.2) -> bytes:
    return b"\x00\x00" * int(SAMPLE_RATE * seconds)


def _noise_pcm(seconds: float = 1.5) -> bytes:
    import numpy as np
    n = int(SAMPLE_RATE * seconds)
    samples = (np.random.uniform(-0.18, 0.18, n) * 32767).astype("<i2")
    return samples.tobytes()


def _attenuate_pcm(pcm: bytes, factor: float = 0.12) -> bytes:
    import numpy as np
    arr = np.frombuffer(pcm, dtype="<i2").astype("float32") * factor
    return arr.astype("<i2").tobytes()


def _pcm_to_webm(pcm: bytes) -> bytes:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not on PATH — needed to encode test clips")
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error",
         "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
         "-c:a", "libopus", "-f", "webm", "pipe:1"],
        input=pcm, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {proc.stderr.decode(errors='replace')[:200]}")
    return proc.stdout


def _build_pcm(case: dict) -> bytes:
    kind = case["kind"]
    if kind == "silence":
        return _silence_pcm()
    if kind == "noise":
        return _noise_pcm()
    if kind == "lowvol":
        return _attenuate_pcm(_tts_pcm(case["text"], case["lang"]))
    return _tts_pcm(case["text"], case["lang"])  # "speech"


def ensure_audio(case: dict, regen: bool) -> bytes:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    path = AUDIO_DIR / f"{case['id']}.webm"
    if path.exists() and not regen:
        return path.read_bytes()
    webm = _pcm_to_webm(_build_pcm(case))
    path.write_bytes(webm)
    return webm


# ---------------------------------------------------------------------------
# Pipeline + checks
# ---------------------------------------------------------------------------

@dataclass
class CaseOutcome:
    id: str
    kind: str
    transcript: str = ""
    similarity: float = 0.0
    pron_score: int | None = None
    stt_ms: int = 0
    chat_ms: int = 0
    answer: str = ""
    answer_words: int = 0
    fallback_used: bool = False
    fallback_reason: str | None = None
    status: str = "PASS"
    errors: list[str] = field(default_factory=list)


def _run_stt(webm: bytes, case_id: str) -> tuple[str, int, str | None]:
    """Returns (transcript, latency_ms, stt_error_code|None)."""
    from services.stt import transcribe_audio
    from services.speech_to_text import STTError
    t0 = time.perf_counter()
    try:
        text = transcribe_audio(webm, f"{case_id}.webm")
        return text, int((time.perf_counter() - t0) * 1000), None
    except STTError as exc:
        code = getattr(exc, "fallback_code", "STT_FAILED")
        return "", int((time.perf_counter() - t0) * 1000), code


def _run_pron(webm: bytes, reference: str, level: str) -> int | None:
    try:
        from services.pronunciation import assess_pronunciation
        result = assess_pronunciation(webm, reference, level)
        if result.get("success"):
            return int(round(result["scores"]["pronunciation"]))
    except Exception:
        return None
    return None


def _run_chat(transcript: str, level: str) -> tuple[str, int, bool, str | None]:
    from services.chat_engine import generate_chat_response
    from services.chat_schemas import ChatRequest
    t0 = time.perf_counter()
    resp = generate_chat_response(
        ChatRequest(message=transcript, level=level, includeArabic=False, voiceMode=True)
    )
    ms = resp.latencyMs or int((time.perf_counter() - t0) * 1000)
    return resp.answerHe, ms, resp.fallbackUsed, resp.fallbackReason


def _evaluate(case: dict, o: CaseOutcome) -> None:
    kind, lang = case["kind"], case["lang"]
    errors: list[str] = []

    answer_is_hebrew_only = bool(o.answer.strip()) and not ARABIC_RE.search(o.answer) and not LATIN_RE.search(o.answer)

    if kind == "silence":
        # Must NOT hallucinate words from silence → expect empty transcript.
        if o.transcript.strip():
            errors.append(f"silence produced transcript {o.transcript!r}")
    elif kind == "noise":
        # Graceful: either no transcript, or a Hebrew-only teacher answer.
        if o.transcript.strip() and not answer_is_hebrew_only and not o.fallback_used:
            errors.append("noise handled ungracefully (non-Hebrew answer, no fallback)")
    elif lang in ("ar", "en"):
        # Foreign speech: guardrail must keep the answer Hebrew-only or fall back.
        if not answer_is_hebrew_only and not o.fallback_used:
            errors.append(f"{lang} input did not stay Hebrew-only / fallback (answer={o.answer!r})")
    elif kind == "lowvol":
        if not o.transcript.strip():
            errors.append("low-volume clip transcribed to nothing")
    else:  # clean Hebrew speech
        if not o.transcript.strip():
            errors.append("STT returned empty transcript")
        expect = case.get("expect_word", "")
        if expect and _normalize_he(expect) not in _normalize_he(o.transcript):
            errors.append(f"transcript {o.transcript!r} missing expected word {expect!r}")
        if not o.answer.strip():
            errors.append("teacher answer empty")
        elif not answer_is_hebrew_only:
            errors.append(f"teacher answer not Hebrew-only: {o.answer!r}")
        max_w = case.get("answer_max_words", 14)
        if o.answer_words > max_w:
            errors.append(f"answer has {o.answer_words} words, max {max_w}")

    if o.stt_ms + o.chat_ms > LATENCY_BUDGET_MS:
        errors.append(f"total latency {o.stt_ms + o.chat_ms}ms exceeds {LATENCY_BUDGET_MS}ms")

    o.errors = errors
    o.status = "FAIL" if errors else "PASS"


def run_case(case: dict, webm: bytes, do_pron: bool) -> CaseOutcome:
    o = CaseOutcome(id=case["id"], kind=case["kind"])
    level = case.get("level", "A1")

    transcript, o.stt_ms, stt_err = _run_stt(webm, case["id"])
    o.transcript = transcript
    if stt_err:
        o.fallback_used, o.fallback_reason = True, stt_err
    if case["kind"] == "speech" and case["text"]:
        o.similarity = round(_similarity(case["text"], transcript), 3)

    if do_pron and case["lang"] == "he" and case["kind"] in ("speech", "lowvol") and transcript.strip():
        o.pron_score = _run_pron(webm, transcript, level)

    if transcript.strip():
        answer, o.chat_ms, fb, reason = _run_chat(transcript, level)
        o.answer = answer
        o.answer_words = _hebrew_word_count(answer)
        if fb:
            o.fallback_used, o.fallback_reason = True, reason
    else:
        # No transcript → production returns an STT fallback without calling chat.
        o.fallback_used = True
        o.fallback_reason = o.fallback_reason or "STT_EMPTY"

    _evaluate(case, o)
    return o


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def _pctl(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = (len(s) - 1) * p
    lo = int(idx)
    hi = min(len(s) - 1, lo + 1)
    return round(s[lo] + (s[hi] - s[lo]) * (idx - lo), 1)


def build_summary(outcomes: list[CaseOutcome]) -> dict:
    passed = sum(1 for o in outcomes if o.status == "PASS")
    he_sims = [o.similarity for o in outcomes if o.kind == "speech" and o.similarity]
    prons = [o.pron_score for o in outcomes if o.pron_score is not None]
    stt_lat = [o.stt_ms for o in outcomes if o.stt_ms]
    chat_lat = [o.chat_ms for o in outcomes if o.chat_ms]
    return {
        "runAt": datetime.now(timezone.utc).isoformat(),
        "totalCases": len(outcomes),
        "passed": passed,
        "failed": len(outcomes) - passed,
        "latencyBudgetMs": LATENCY_BUDGET_MS,
        "sttAccuracyAvg": round(statistics.mean(he_sims), 3) if he_sims else None,
        "pronScoreAvg": round(statistics.mean(prons), 1) if prons else None,
        "sttLatency": {"avgMs": round(statistics.mean(stt_lat), 1) if stt_lat else 0,
                       "p95Ms": _pctl(stt_lat, 0.95), "maxMs": max(stt_lat, default=0)},
        "chatLatency": {"avgMs": round(statistics.mean(chat_lat), 1) if chat_lat else 0,
                        "p95Ms": _pctl(chat_lat, 0.95), "maxMs": max(chat_lat, default=0)},
        "cases": [vars(o) for o in outcomes],
    }


def render_markdown(s: dict) -> str:
    lines = [
        "# Real-STT Voice Eval Report",
        "",
        f"- Run at: `{s['runAt']}`",
        f"- Cases: `{s['totalCases']}` | Passed: `{s['passed']}` | Failed: `{s['failed']}`",
        f"- STT accuracy (Hebrew speech, avg similarity): "
        f"`{s['sttAccuracyAvg'] if s['sttAccuracyAvg'] is not None else 'n/a'}`",
        f"- Pronunciation score (avg): `{s['pronScoreAvg'] if s['pronScoreAvg'] is not None else 'n/a'}`",
        f"- STT latency: avg `{s['sttLatency']['avgMs']}ms` "
        f"/ p95 `{s['sttLatency']['p95Ms']}ms` / max `{s['sttLatency']['maxMs']}ms`",
        f"- Chat latency: avg `{s['chatLatency']['avgMs']}ms` "
        f"/ p95 `{s['chatLatency']['p95Ms']}ms` / max `{s['chatLatency']['maxMs']}ms`",
        "",
        "| ID | Kind | Status | Transcript | Sim | Pron | STT ms | Chat ms | Ans words |",
        "| --- | --- | :---: | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for c in s["cases"]:
        tr = (c["transcript"] or "—").replace("|", "/")
        pron = c["pron_score"] if c["pron_score"] is not None else "—"
        sim = c["similarity"] if c["similarity"] else "—"
        lines.append(
            f"| `{c['id']}` | {c['kind']} | {c['status']} | {tr} | {sim} | {pron} "
            f"| {c['stt_ms']} | {c['chat_ms']} | {c['answer_words']} |"
        )
    failing = [c for c in s["cases"] if c["status"] == "FAIL"]
    if failing:
        lines += ["", "## Failing Details", ""]
        for c in failing:
            lines.append(f"### `{c['id']}`")
            lines.append(f"- transcript: `{c['transcript']}`")
            lines.append(f"- answer: `{c['answer']}`")
            lines.append(f"- fallback: `{c['fallback_used']}` / `{c['fallback_reason']}`")
            for e in c["errors"]:
                lines.append(f"- FAIL: {e}")
            lines.append("")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Real-STT voice eval")
    parser.add_argument("--regen", action="store_true", help="Rebuild audio clips")
    parser.add_argument("--no-pron", action="store_true", help="Skip pronunciation scoring")
    args = parser.parse_args()

    _load_env()
    import os
    if os.getenv("STT_ENGINE", "whisper").lower() != "azure":
        print("WARNING: STT_ENGINE is not 'azure' — this eval targets the Azure path.\n")

    try:
        from services.voice_circuits import stt_circuit, tts_circuit
        stt_circuit.reset()
        tts_circuit.reset()
    except Exception:
        pass

    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Real-STT Voice Eval — {len(cases)} cases (pron={'off' if args.no_pron else 'on'})\n")

    outcomes: list[CaseOutcome] = []
    for case in cases:
        webm = ensure_audio(case, args.regen)
        o = run_case(case, webm, do_pron=not args.no_pron)
        outcomes.append(o)
        tag = "PASS" if o.status == "PASS" else "FAIL"
        pron = f" pron={o.pron_score}" if o.pron_score is not None else ""
        print(f"  [{tag}] {o.id:24s} stt={o.stt_ms}ms chat={o.chat_ms}ms"
              f" sim={o.similarity or '-'}{pron}  tr={o.transcript!r}")
        for e in o.errors:
            print(f"          * {e}")

    summary = build_summary(outcomes)
    md = render_markdown(summary)
    ts = int(time.time())
    (REPORTS_DIR / f"voice_stt_eval_{ts}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path = REPORTS_DIR / "voice_stt_eval_latest.md"
    md_path.write_text(md, encoding="utf-8")

    print(f"\n{'=' * 56}")
    print(f"Results: {summary['passed']} passed / {summary['failed']} failed (total {len(cases)})")
    print(f"STT accuracy avg: {summary['sttAccuracyAvg']} | pron avg: {summary['pronScoreAvg']}")
    print(f"STT latency avg/p95/max: {summary['sttLatency']['avgMs']}/"
          f"{summary['sttLatency']['p95Ms']}/{summary['sttLatency']['maxMs']} ms")
    print(f"Report -> {md_path}")
    sys.exit(1 if summary["failed"] else 0)


if __name__ == "__main__":
    main()
