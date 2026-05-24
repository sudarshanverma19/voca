import { useState, useRef } from 'react';
import { transcribeAudio } from '../../services/sttApi';
import { createSchedule } from '../../services/schedulesApi';
import styles from './VoiceSchedule.module.css';

function todayISO() { return new Date().toISOString().slice(0, 10); }

// Try to parse "9 AM", "10:30", "14:00", "2 o'clock" → "HH:MM"
function parseSpokenTime(text) {
  const t = text.toLowerCase().trim();
  let m;
  m = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = m[2];
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  m = t.match(/(\d{1,2})\s*(am|pm)/i);
  if (m) {
    let h = parseInt(m[1]);
    if (m[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m[2].toLowerCase() === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

// Try to parse "45 minutes", "1 hour", "90 mins" → number of minutes
function parseSpokenDuration(text) {
  const t = text.toLowerCase().trim();
  let m;
  m = t.match(/(\d+)\s*hours?\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  m = t.match(/(\d+(?:\.\d+)?)\s*hours?/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = t.match(/(\d+)\s*(?:minutes?|mins?)/);
  if (m) return parseInt(m[1]);
  m = t.match(/^(\d+)$/);
  if (m) return parseInt(m[1]);
  return null;
}

const STEPS = [
  { key: 'task_name',            title: 'Task Name',          question: 'What do you want to work on?',        type: 'text',   placeholder: 'e.g. Deep Work' },
  { key: 'start_time',           title: 'Start Time',         question: 'When does it start?',                 type: 'time',   placeholder: 'e.g. 10:00 AM' },
  { key: 'duration_minutes',     title: 'Duration',           question: 'How long will you work?',             type: 'number', placeholder: 'e.g. 60 mins or 1 hour' },
  { key: 'break_after_minutes',  title: 'Break After',        question: 'Any break after? (say "skip" to skip)', type: 'number', placeholder: 'e.g. 15 minutes or skip', optional: true },
];

export function VoiceSchedule({ userId, onDone }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ task_name: '', start_time: '', duration_minutes: '', break_after_minutes: '' });
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parseError, setParseError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const mediaRef = useRef(null);
  const recorderRef = useRef(null);

  const current = STEPS[step];
  const isReview = step === STEPS.length;

  const startRecording = async () => {
    setTranscript('');
    setParseError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setProcessing(true);
        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          const result = await transcribeAudio(blob, 'schedule');
          const text = result.text || '';
          setTranscript(text);
          applyTranscript(text);
        } catch (e) {
          setParseError('Could not transcribe audio. Please type instead.');
        } finally {
          setProcessing(false);
        }
      };
      recorder.start();
      setRecording(true);
      // auto-stop after 6 seconds
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); setRecording(false); }, 6000);
    } catch {
      setParseError('Microphone access denied. Please type instead.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      setRecording(false);
    }
  };

  const applyTranscript = (text) => {
    const key = STEPS[step]?.key;
    if (!key) return;
    if (key === 'task_name') {
      setValues(v => ({ ...v, task_name: text }));
    } else if (key === 'start_time') {
      const parsed = parseSpokenTime(text);
      if (parsed) {
        setValues(v => ({ ...v, start_time: parsed }));
      } else {
        setParseError('Could not parse time — please type it in HH:MM format.');
      }
    } else if (key === 'duration_minutes') {
      const parsed = parseSpokenDuration(text);
      if (parsed) {
        setValues(v => ({ ...v, duration_minutes: String(parsed) }));
      } else {
        setParseError('Could not parse duration — please type the number of minutes.');
      }
    } else if (key === 'break_after_minutes') {
      if (/skip|no|none|0/i.test(text)) {
        setValues(v => ({ ...v, break_after_minutes: '' }));
      } else {
        const parsed = parseSpokenDuration(text);
        if (parsed) {
          setValues(v => ({ ...v, break_after_minutes: String(parsed) }));
        } else {
          setParseError('Could not parse duration — please type the minutes, or leave blank to skip.');
        }
      }
    }
  };

  const canAdvance = () => {
    const v = values[current?.key];
    if (current?.optional) return true;
    return v && String(v).trim() !== '';
  };

  const handleNext = () => {
    setTranscript('');
    setParseError('');
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setTranscript('');
    setParseError('');
    setStep(s => Math.max(0, s - 1));
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await createSchedule({
        user_id: userId,
        task_name: values.task_name.trim(),
        date: todayISO(),
        start_time: values.start_time,
        duration_minutes: parseInt(values.duration_minutes, 10),
        break_after_minutes: values.break_after_minutes ? parseInt(values.break_after_minutes, 10) : null,
        contact_preference: 'default',
        created_via: 'voice',
      });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Review screen ────────────────────────────────────────────────────────
  if (isReview) {
    return (
      <div className={styles.page}>
        <h2 className={styles.heading}>Review Task</h2>
        <div className={styles.reviewCard}>
          {STEPS.map(s => (
            <div key={s.key} className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{s.title}</span>
              <span className={styles.reviewValue}>
                {values[s.key] || <em className={styles.none}>—</em>}
              </span>
              <button className={styles.editBtn} onClick={() => { setStep(STEPS.findIndex(x => x.key === s.key)); }}>Edit</button>
            </div>
          ))}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primaryBtn} onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Task'}
        </button>
        <button className={styles.ghostBtn} onClick={() => setStep(STEPS.length - 1)}>Back</button>
      </div>
    );
  }

  // ── Step screen ──────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.stepIndicator}>
        {STEPS.map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === step ? styles.dotActive : i < step ? styles.dotDone : ''}`} />
        ))}
      </div>

      <h2 className={styles.heading}>{current.title}</h2>
      <p className={styles.question}>{current.question}</p>

      <button
        className={`${styles.micBtn} ${recording ? styles.micActive : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        disabled={processing}
        aria-label="Hold to speak"
      >
        {recording ? 'Release to stop' : processing ? 'Processing…' : 'Hold to speak'}
      </button>

      {transcript && (
        <p className={styles.transcript}>Heard: <em>"{transcript}"</em></p>
      )}
      {parseError && <p className={styles.parseError}>{parseError}</p>}

      <div className={styles.orDivider}>
        <span>or type it</span>
      </div>

      {current.type === 'time' ? (
        <input
          className={styles.input}
          type="time"
          value={values[current.key]}
          onChange={e => setValues(v => ({ ...v, [current.key]: e.target.value }))}
        />
      ) : current.type === 'number' ? (
        <input
          className={styles.input}
          type="number"
          min="1"
          placeholder={current.optional ? 'Leave blank to skip' : current.placeholder}
          value={values[current.key]}
          onChange={e => setValues(v => ({ ...v, [current.key]: e.target.value }))}
        />
      ) : (
        <input
          className={styles.input}
          type="text"
          placeholder={current.placeholder}
          value={values[current.key]}
          onChange={e => setValues(v => ({ ...v, [current.key]: e.target.value }))}
          autoFocus
        />
      )}

      <div className={styles.navRow}>
        {step > 0 && (
          <button className={styles.ghostBtn} onClick={handleBack}>Back</button>
        )}
        <button
          className={styles.primaryBtn}
          style={{ flex: 1 }}
          onClick={handleNext}
          disabled={!canAdvance()}
        >
          {step === STEPS.length - 1 ? 'Review' : 'Next'}
        </button>
      </div>
    </div>
  );
}
