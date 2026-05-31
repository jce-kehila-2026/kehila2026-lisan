import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_MIME_TYPE = 'audio/webm';

function createRecorderError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getSupportedMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return null;
  }

  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];

  for (const mimeType of preferredTypes) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return DEFAULT_MIME_TYPE;
}

export function useAudioRecorder() {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const isTransitioningRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const interruptHandledRef = useRef(false);

  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);

  const supportedMimeType = useMemo(() => getSupportedMimeType(), []);
  const isSupported = supportedMimeType !== null
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);

  const cleanupStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
  }, []);

  const resetRecorder = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopRequestedRef.current = false;
    interruptHandledRef.current = false;
    isTransitioningRef.current = false;
    cleanupStream();
  }, [cleanupStream]);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const failRecording = useCallback((code, nextStatus = 'error', message = code) => {
    setError(createRecorderError(code, message));
    setStatus(nextStatus);
    resetRecorder();
  }, [resetRecorder]);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      failRecording('UNSUPPORTED', 'unsupported', 'Audio recording is not supported on this device.');
      return false;
    }

    if (isTransitioningRef.current || status === 'recording' || status === 'requesting' || status === 'stopping') {
      return false;
    }

    isTransitioningRef.current = true;
    setError(null);
    setAudioBlob(null);
    setStatus('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, supportedMimeType ? { mimeType: supportedMimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      stopRequestedRef.current = false;
      interruptHandledRef.current = false;

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!stopRequestedRef.current && !interruptHandledRef.current) {
            interruptHandledRef.current = true;
            failRecording('RECORDER_INTERRUPTED', 'error', 'Recording was interrupted.');
          }
        };
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        failRecording('RECORDER_ERROR', 'error', 'Recording failed.');
      };

      recorder.onstop = () => {
        const nextBlob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: recorder.mimeType || supportedMimeType || DEFAULT_MIME_TYPE })
          : null;

        setAudioBlob(nextBlob);
        setStatus(nextBlob ? 'idle' : 'error');
        if (!nextBlob) {
          setError(createRecorderError('EMPTY_RECORDING', 'Recording did not capture any audio.'));
        }
        resetRecorder();
      };

      recorder.start();
      setStatus('recording');
      return true;
    } catch (caughtError) {
      const denied = caughtError?.name === 'NotAllowedError' || caughtError?.name === 'SecurityError';
      const unavailable = caughtError?.name === 'NotFoundError' || caughtError?.name === 'DevicesNotFoundError';
      if (denied) {
        failRecording('MICROPHONE_DENIED', 'denied', 'Microphone permission was denied.');
      } else if (unavailable) {
        failRecording('MICROPHONE_UNAVAILABLE', 'error', 'No microphone is available.');
      } else {
        failRecording('RECORDER_ERROR', 'error', 'Unable to start recording.');
      }
      return false;
    } finally {
      isTransitioningRef.current = false;
    }
  }, [failRecording, isSupported, resetRecorder, status, supportedMimeType]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording' || isTransitioningRef.current) {
      return false;
    }

    isTransitioningRef.current = true;
    stopRequestedRef.current = true;
    setStatus('stopping');

    try {
      recorder.stop();
      return true;
    } catch {
      failRecording('RECORDER_ERROR', 'error', 'Unable to stop recording.');
      return false;
    } finally {
      isTransitioningRef.current = false;
    }
  }, [failRecording]);

  const toggleRecording = useCallback(async () => {
    if (status === 'recording') {
      return stopRecording();
    }

    return startRecording();
  }, [startRecording, status, stopRecording]);

  useEffect(() => () => {
    resetRecorder();
  }, [resetRecorder]);

  return {
    audioBlob,
    clearAudio,
    clearError,
    error,
    isSupported,
    startRecording,
    status,
    stopRecording,
    toggleRecording,
  };
}
