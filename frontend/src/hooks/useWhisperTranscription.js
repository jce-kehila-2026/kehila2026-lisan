import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * React hook that owns the Whisper web-worker and audio decoding pipeline.
 *
 * Exposes:
 *   status      – 'idle' | 'loading-model' | 'transcribing' | 'done' | 'error'
 *   progress    – 0-100 (model download %)
 *   transcript  – final transcription string
 *   error       – error message or null
 *   transcribe  – async (blob) => void
 *   reset       – () => void  (clear status/transcript without touching the worker)
 */
export function useWhisperTranscription() {
  const workerRef = useRef(null);

  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);

  // ── Create the worker once ──────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('../whisper.worker.js', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.status) {
        case 'progress': {
          setStatus('loading-model');
          // msg.data comes from @huggingface/transformers progress_callback.
          // It may contain { progress } (0-100) on download events.
          const pct = msg.data?.progress;
          if (typeof pct === 'number') {
            setProgress(Math.round(pct));
          }
          break;
        }

        case 'transcribing':
          setStatus('transcribing');
          break;

        case 'completed':
          setStatus('done');
          setTranscript(msg.transcription ?? '');
          break;

        case 'error':
          setStatus('error');
          setError(msg.error ?? 'Transcription failed');
          break;

        default:
          break;
      }
    });

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Public transcribe function ──────────────────────────────────────
  const transcribe = useCallback(async (blob) => {
    if (!blob) return;

    setStatus('loading-model');
    setProgress(0);
    setTranscript('');
    setError(null);

    try {
      // 1. Decode the webm/opus blob into raw PCM
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();

      // 2. Resample to 16 kHz mono using OfflineAudioContext
      const targetSampleRate = 16000;
      const offlineLength = Math.ceil(decoded.duration * targetSampleRate);
      const offline = new OfflineAudioContext(1, offlineLength, targetSampleRate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      const float32 = rendered.getChannelData(0);

      // 3. Send to worker
      const worker = workerRef.current;
      if (!worker) {
        setStatus('error');
        setError('Whisper worker is not available.');
        return;
      }

      worker.postMessage({ type: 'transcribe', audio: float32 });
    } catch (err) {
      console.error('Audio decode error:', err);
      setStatus('error');
      setError('שגיאה בפענוח קובץ האודיו. נסו שוב.');
    }
  }, []);

  // ── Reset state (does NOT terminate the worker) ─────────────────────
  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setTranscript('');
    setError(null);
  }, []);

  return { status, progress, transcript, error, transcribe, reset };
}
