import { pipeline, env } from '@huggingface/transformers';

// Disable local model caching since we are running in the browser
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;

async function getTranscriber(progress_callback) {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      progress_callback,
    });
  }
  return transcriber;
}

self.addEventListener('message', async (event) => {
  const { type, audio } = event.data;
  
  if (type === 'transcribe' && audio) {
    try {
      // 1. Get the transcriber and report progress during model loading
      const transcriber = await getTranscriber((data) => {
        self.postMessage({ status: 'progress', data });
      });

      // 2. Notify that transcription has started
      self.postMessage({ status: 'transcribing' });

      // 3. Perform transcription using the Whisper model
      // We pass the audio data which should be a Float32Array at 16kHz
      const result = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'hebrew',
        task: 'transcribe',
        return_timestamps: true,
      });

      // 4. Send back the final transcription
      const formattedText = result.text.replace(/([.?!])\s*/g, '$1\n').trim();
      self.postMessage({ status: 'completed', transcription: formattedText });
      
    } catch (error) {
      console.error('Whisper worker error:', error);
      self.postMessage({ status: 'error', error: error.message || String(error) });
    }
  }
});
