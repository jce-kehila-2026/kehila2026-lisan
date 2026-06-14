import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, Play, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import PageHeader from '../../components/PageHeader.jsx';
import BottomNav from '../../components/BottomNav.jsx';

function DatasetUploader() {
  const [audioFile, setAudioFile] = useState(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState(null);
  const [isGeneratingJSON, setIsGeneratingJSON] = useState(false);
  const [arabicTranslation, setArabicTranslation] = useState('');
  const [level, setLevel] = useState('A2');
  const [category, setCategory] = useState('family');
  
  const workerRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../../whisper.worker.js', import.meta.url), {
      type: 'module',
    });

    workerRef.current.addEventListener('message', (e) => {
      const { status, data, transcription: resultText, error: errMessage } = e.data;

      switch (status) {
        case 'progress':
          if (data.status === 'initiate') {
            setLoadingModel(true);
            setLoadingProgress(0);
          } else if (data.status === 'progress') {
            // data.progress is 0-100
            setLoadingProgress(Math.round(data.progress));
          } else if (data.status === 'done') {
            setLoadingModel(false);
            setLoadingProgress(100);
          }
          break;
        case 'transcribing':
          setTranscribing(true);
          break;
        case 'completed':
          setTranscribing(false);
          setTranscription(resultText);
          break;
        case 'error':
          setTranscribing(false);
          setLoadingModel(false);
          setError(errMessage || 'An error occurred during transcription.');
          break;
        default:
          break;
      }
    });

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);
      setTranscription('');
      setError(null);
    }
  };

  const processAudioFile = async () => {
    if (!audioFile) return;

    setError(null);
    setTranscribing(true); // Keep UI busy while decoding audio

    try {
      // Decode audio to PCM using Web Audio API
      const arrayBuffer = await audioFile.arrayBuffer();
      // AudioContext is usually supported on window
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000 // Whisper requires 16kHz audio
      });

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
      
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start(0);

      const renderedBuffer = await offlineContext.startRendering();
      const audioData = renderedBuffer.getChannelData(0); // Float32Array at 16kHz

      // Send to web worker
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'transcribe', audio: audioData });
      }
    } catch (err) {
      console.error('Audio processing error:', err);
      setError('שגיאה בעיבוד קובץ השמע. ודאי שהקובץ בפורמט נתמך ונסה שוב.');
      setTranscribing(false);
    }
  };

  const generateJSON = async () => {
    setIsGeneratingJSON(true);
    setError(null);
    try {
      const response = await fetch('/api/dataset/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transcript: transcription,
          level,
          category
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate dataset. Please try again.');
      }

      const datasetData = await response.json();
      
      const zip = new JSZip();
      const timestamp = Date.now();
      
      zip.file(`lisan-seed-${timestamp}.json`, JSON.stringify(datasetData.sentences || [], null, 2));
      zip.file(`vocabulary-${timestamp}.json`, JSON.stringify(datasetData.vocabulary || [], null, 2));
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `dataset_export_${timestamp}.zip`);
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during dataset generation.');
    } finally {
      setIsGeneratingJSON(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F5F3FF_0%,#ECFEFF_100%)] px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="relative mx-auto min-h-[calc(100vh-2.5rem)] max-w-xl pb-28 sm:min-h-[780px]" dir="rtl">
        <PageHeader showBack />

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#56CFE1]/20 text-[#6930C3]">
              <Upload className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">העלאת קבצי שמע</h1>
              <p className="mt-1 text-sm text-slate-600">
                העלי הקלטה או קובץ שמע. המערכת תבצע תמלול אוטומטי במכשיר שלך באמצעות בינה מלאכותית (Whisper).
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#56CFE1]/40 bg-[#56CFE1]/10 p-5 text-center transition hover:border-[#56CFE1] hover:bg-[#56CFE1]/20">
            <input 
              type="file" 
              accept="audio/*" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <FileAudio className="h-10 w-10 text-[#4EA8DE]" />
            <p className="mt-4 text-sm font-bold text-slate-700">
              {audioFile ? audioFile.name : 'לחצי כאן לבחירת קובץ שמע'}
            </p>
            {!audioFile && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                WAV, MP3, M4A
              </p>
            )}
          </label>

          {audioFile && (
            <button
              type="button"
              onClick={processAudioFile}
              disabled={transcribing || loadingModel}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#7400B8] to-[#5E60CE] px-4 py-3 text-sm font-bold text-white shadow-[0_4px_14px_0_rgba(116,0,184,0.39)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
            >
              {(transcribing || loadingModel) ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
              {transcribing ? 'מתמלל את השמע...' : 'התחילי תמלול'}
            </button>
          )}

          {/* Model Loading State */}
          {loadingModel && (
            <div className="mt-4 rounded-2xl bg-amber-50 p-4 border border-amber-100">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800">מוריד מודל זיהוי קולי</p>
                  <p className="mt-1 text-xs text-amber-700">בפעם הראשונה זה עשוי לקחת קצת זמן (~75MB).</p>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-200/50">
                <div 
                  className="h-full bg-amber-500 transition-all duration-300 ease-out" 
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <p className="mt-2 text-left text-xs font-bold text-amber-800">{loadingProgress}%</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-red-50 p-4 border border-red-100">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          )}
        </section>

        {/* Transcription Results */}
        {transcription && (
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-2 text-[#5E60CE]">
              <CheckCircle2 className="h-5 w-5 text-[#64DFDF]" />
              <h2 className="font-bold">תמלול הושלם</h2>
            </div>
            
            <textarea
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              className="mt-4 min-h-[250px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-800 outline-none focus:border-[#4EA8DE] focus:bg-white"
              dir="auto"
            />
            
            <p className="mt-2 text-xs text-slate-500">
              ניתן לערוך את הטקסט למעלה במידת הצורך.
            </p>
          </section>
        )}

        {/* Metadata and Generation */}
        {transcription && (
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-card sm:p-6">
            <h2 className="text-xl font-bold text-slate-900">הוספת מידע וייצוא</h2>
            
            <label className="mt-5 block">
              <span className="text-sm font-bold text-slate-800">תרגום לערבית</span>
              <textarea
                value={arabicTranslation}
                onChange={(e) => setArabicTranslation(e.target.value)}
                placeholder="أدخل الترجمة هنا..."
                className="mt-2 min-h-[100px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-800 outline-none focus:border-[#4EA8DE] focus:bg-white"
                dir="rtl"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-800">רמה</span>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#4EA8DE] focus:bg-white"
                >
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="C">C</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-800">קטגוריה</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#4EA8DE] focus:bg-white"
                  dir="ltr"
                >
                  <option value="family">family</option>
                  <option value="daily_life">daily_life</option>
                  <option value="travel">travel</option>
                  <option value="health">health</option>
                  <option value="school">school</option>
                  <option value="food_restaurant">food_restaurant</option>
                  <option value="shopping_leisure">shopping_leisure</option>
                  <option value="work_jobs">work_jobs</option>
                  <option value="culture_music">culture_music</option>
                  <option value="past_events">past_events</option>
                  <option value="animals_nature">animals_nature</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={generateJSON}
              disabled={isGeneratingJSON}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#7400B8] to-[#5E60CE] px-4 py-4 text-base font-bold text-white shadow-[0_4px_14px_0_rgba(116,0,184,0.39)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingJSON ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Download className="h-5 w-5" />
              )}
              {isGeneratingJSON ? 'מייצר נתונים...' : 'הורדת קובץ JSON למאגר'}
            </button>
          </section>
        )}

        <BottomNav />
      </div>
    </main>
  );
}

export default DatasetUploader;
