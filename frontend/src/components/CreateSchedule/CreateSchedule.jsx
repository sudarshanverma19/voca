import { useState } from 'react';
import { createSchedule } from '../../services/schedulesApi';
import styles from './CreateSchedule.module.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextRoundHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

const CONTACT_OPTIONS = [
  { value: 'default', label: 'Default', desc: 'Use your global setting' },
  { value: 'call',         label: 'Call',    desc: 'Ring via WebRTC' },
  { value: 'notification', label: 'Notify',  desc: 'Push notification' },
];

export function CreateSchedule({ userId, onDone }) {
  const [form, setForm] = useState({
    task_name: '',
    date: todayISO(),
    start_time: nextRoundHour(),
    duration_minutes: 60,
    break_after_minutes: '',
    contact_preference: 'default',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!form.task_name.trim()) { setError('Task name is required.'); return; }
    if (!form.start_time) { setError('Start time is required.'); return; }
    if (!form.duration_minutes || form.duration_minutes < 1) { setError('Duration must be at least 1 minute.'); return; }

    setLoading(true);
    try {
      const payload = {
        user_id: userId,
        task_name: form.task_name.trim(),
        date: form.date,
        start_time: form.start_time,
        duration_minutes: parseInt(form.duration_minutes, 10),
        break_after_minutes: form.break_after_minutes ? parseInt(form.break_after_minutes, 10) : null,
        contact_preference: form.contact_preference,
        created_via: 'manual',
      };
      const result = await createSchedule(payload);
      if (!result.scheduled && form.date === todayISO()) {
        setNotice('Task saved, but the start time is already past — it will not trigger today.');
        setTimeout(onDone, 2800);
      } else {
        onDone();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>New Task</h2>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task_name">Task Name</label>
          <input
            id="task_name"
            className={styles.input}
            type="text"
            placeholder="e.g. Deep Work"
            value={form.task_name}
            onChange={e => set('task_name', e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="date">Date</label>
            <input
              id="date"
              className={styles.input}
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              min={todayISO()}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="start_time">Start Time</label>
            <input
              id="start_time"
              className={styles.input}
              type="time"
              value={form.start_time}
              onChange={e => set('start_time', e.target.value)}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="duration">Duration (min)</label>
            <input
              id="duration"
              className={styles.input}
              type="number"
              min="1"
              max="480"
              placeholder="60"
              value={form.duration_minutes}
              onChange={e => set('duration_minutes', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="break">Break after (min)</label>
            <input
              id="break"
              className={styles.input}
              type="number"
              min="0"
              max="120"
              placeholder="None"
              value={form.break_after_minutes}
              onChange={e => set('break_after_minutes', e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Contact Mode</label>
          <div className={styles.contactGroup}>
            {CONTACT_OPTIONS.map(o => (
              <label key={o.value} className={`${styles.contactOption} ${form.contact_preference === o.value ? styles.contactSelected : ''}`}>
                <input
                  type="radio"
                  name="contact"
                  value={o.value}
                  checked={form.contact_preference === o.value}
                  onChange={() => set('contact_preference', o.value)}
                  className={styles.radioHidden}
                />
                <span className={styles.contactLabel}>{o.label}</span>
                <span className={styles.contactDesc}>{o.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {notice && <p className={styles.notice}>{notice}</p>}

        <button className={styles.submitBtn} type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Create Task'}
        </button>

        <button type="button" className={styles.cancelBtn} onClick={onDone} disabled={loading}>
          Cancel
        </button>
      </form>
    </div>
  );
}
