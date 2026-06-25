import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, Play, Loader2, CheckCircle2, AlertCircle, Download, FilePlus2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
import AdminHeroVisual from '../../components/admin/AdminHeroVisual.jsx';

const recentUploads = [
  {
    id: 'conversation-a2',
    name: 'תרגול שיחה במסעדה',
    uploadDate: '19.06.2026',
    teacher: 'מרים אבו חסן',
    level: 'A2',
  },
  {
    id: 'daily-b1',
    name: 'אוצר מילים לחיי יום-יום',
    uploadDate: '17.06.2026',
    teacher: 'סמאח חורי',
    level: 'B1',
  },
  {
    id: 'family-a1',
    name: 'משפחה והיכרות בסיסית',
    uploadDate: '15.06.2026',
    teacher: 'נור אבו ריא',
    level: 'A1',
  },
];

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
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

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
    <main className="lisan-admin-page min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(221,214,254,0.54),transparent_30%),linear-gradient(180deg,#FBF8FF_0%,#FFF8FC_48%,#F4EEFF_100%)] px-3 py-3 text-slate-900 md:px-6 md:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-12" dir="rtl">
        <AdminPageHeader icon={FilePlus2} label="העלאת חומרים" />

        <section
          className="relative mt-8 overflow-hidden rounded-[24px] border border-violet-100/70 bg-white/75 shadow-[0_16px_42px_rgba(109,40,217,0.1)] md:mt-10 md:rounded-[28px]"
          style={{ maxHeight: '140px' }}
        >
          <div className="flex h-full min-h-[140px] items-stretch" dir="ltr">
            <div className="relative w-[34%] shrink-0 overflow-hidden" aria-hidden="true">
              <AdminHeroVisual type="materials" />
            </div>

            <div
              className="flex flex-1 flex-col justify-center text-right"
              style={{ paddingLeft: '4px', paddingRight: '20px' }}
              dir="rtl"
            >
              <p className="mb-1 inline-flex w-full items-center justify-start gap-2 text-right text-xs font-black text-violet-700">
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                ניהול חומרי למידה
              </p>
              <h1 className="text-2xl font-black leading-tight text-slate-950 md:text-3xl">
                העלאת קבצי שמע וחומרי תרגול
              </h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                העלי הקלטה או קובץ שמע, צרי תמלול אוטומטי, והפיקי קובצי נתונים לתרגול במערכת ליסאן.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:mt-5 sm:p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-violet-200 bg-violet-50/65 p-5 text-center transition hover:border-violet-300 hover:bg-violet-100/60">
            <input 
              type="file" 
              accept="audio/*" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <FileAudio className="h-10 w-10 text-violet-600" />
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

        <section className="mt-4 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:mt-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-violet-700">העלאות אחרונות</p>
              <h2 className="mt-1 text-lg font-black text-slate-950 sm:text-xl">חומרי תרגול שעלו לאחרונה</h2>
            </div>
            <span className="w-fit rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
              {recentUploads.length ? `${recentUploads.length} פריטים` : 'אין פריטים'}
            </span>
          </div>

          {recentUploads.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentUploads.map((material) => (
                <article
                  key={material.id}
                  className="rounded-[24px] border border-violet-100/80 bg-violet-50/55 p-4 shadow-[0_10px_28px_rgba(109,40,217,0.08)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white/85"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.12)]">
                      <FileAudio className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-slate-950">{material.name}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">הועלה בתאריך {material.uploadDate}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm">מורה: {material.teacher}</span>
                    <span className="rounded-full bg-violet-600 px-3 py-1 text-white shadow-sm">רמה {material.level}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-violet-200 bg-violet-50/60 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-[0_12px_28px_rgba(109,40,217,0.12)]">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-sm font-black text-slate-950">עדיין לא הועלו חומרי תרגול</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">לאחר העלאה, החומרים האחרונים יוצגו כאן בצורה מסודרת.</p>
            </div>
          )}
        </section>

        {/* Transcription Results */}
        {transcription && (
          <section className="mt-5 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:p-6">
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
          <section className="mt-5 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-[0_22px_60px_rgba(91,33,182,0.11)] backdrop-blur sm:p-6">
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

      </div>
    </main>
  );
}

export default DatasetUploader;
