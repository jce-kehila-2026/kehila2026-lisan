"""
Audio transcoding for the Azure Speech engines.

Browsers (MediaRecorder) record audio as **webm/opus**, but Azure Speech's
file/stream input — and the pronunciation assessor — expect **16 kHz mono
16-bit PCM WAV**. The stdlib ``wave`` module cannot read webm/opus, so we
decode with PyAV (the ffmpeg bindings already pulled in by faster-whisper).
This runs fully in-process: no external ``ffmpeg`` binary, no subprocess —
which keeps deployments portable.

The local faster-whisper engine does its own decoding, so it does NOT need
this; only the Azure STT + pronunciation paths call it.
"""
from __future__ import annotations

import io
import wave

TARGET_RATE = 16_000  # Hz — Azure Speech / pronunciation expect this
TARGET_WIDTH = 2      # bytes (16-bit)


def is_canonical_wav(audio_bytes: bytes) -> bool:
    """True if bytes are already 16 kHz / 16-bit / mono PCM WAV (no transcode)."""
    try:
        with io.BytesIO(audio_bytes) as buf, wave.open(buf, "rb") as w:
            return (
                w.getnchannels() == 1
                and w.getsampwidth() == TARGET_WIDTH
                and w.getframerate() == TARGET_RATE
            )
    except (wave.Error, EOFError):
        return False


def to_wav_pcm16(audio_bytes: bytes) -> bytes:
    """Decode arbitrary audio (webm/opus, mp4, ogg, wav…) to 16 kHz mono
    16-bit PCM WAV bytes.

    Already-canonical WAV is returned untouched (fast path). Anything else is
    decoded + resampled via PyAV. Raises ValueError if the input has no
    decodable audio stream.
    """
    if is_canonical_wav(audio_bytes):
        return audio_bytes

    import av  # lazy — keeps PyAV out of memory unless an Azure path is used

    resampler = av.AudioResampler(format="s16", layout="mono", rate=TARGET_RATE)
    pcm = bytearray()

    with io.BytesIO(audio_bytes) as in_buf, av.open(in_buf, mode="r") as container:
        audio_stream = next(
            (s for s in container.streams if s.type == "audio"), None
        )
        if audio_stream is None:
            raise ValueError("input has no audio stream")

        def _drain(frame):
            for resampled in resampler.resample(frame):
                # packed s16 mono → ndarray shape (1, samples) int16
                pcm.extend(resampled.to_ndarray().tobytes())

        for frame in container.decode(audio_stream):
            _drain(frame)
        _drain(None)  # flush the resampler

    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(TARGET_WIDTH)
        w.setframerate(TARGET_RATE)
        w.writeframes(bytes(pcm))
    return out.getvalue()


__all__ = ["to_wav_pcm16", "is_canonical_wav"]
