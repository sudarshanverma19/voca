import { useState, useEffect, useCallback } from 'react';
import { getSchedules, deleteSchedule } from '../../services/schedulesApi';
import styles from './TodayView.module.css';

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(timeStr) {
  // timeStr may be "HH:MM" or "HH:MM:SS"
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function isPast(timeStr) {
  const now = new Date();
  const [h, m] = timeStr.split(':');
  return now.getHours() > parseInt(h) || (now.getHours() === parseInt(h) && now.getMinutes() >= parseInt(m));
}

export function TodayView({ userId, onAdd }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSchedules(userId, todayISO());
      setSchedules(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch {
      // silently ignore — item stays in list
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.dateRow}>
        <span className={styles.date}>{todayLabel()}</span>
        <button className={styles.refreshBtn} onClick={load} aria-label="Refresh">↺</button>
      </div>

      {loading && <p className={styles.hint}>Loading…</p>}
      {error && <p className={styles.err}>Could not load schedules. {error}</p>}

      {!loading && !error && schedules.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No tasks today</p>
          <p className={styles.hint}>Tap <strong>+ New</strong> to add your first task.</p>
        </div>
      )}

      {!loading && schedules.length > 0 && (
        <ul className={styles.list}>
          {schedules.map(s => {
            const past = isPast(s.start_time);
            return (
              <li key={s.id} className={`${styles.card} ${past ? styles.past : ''}`}>
                <div className={styles.timeCol}>
                  <span className={styles.time}>{formatTime(s.start_time)}</span>
                </div>
                <div className={styles.info}>
                  <span className={styles.taskName}>{s.task_name}</span>
                  <span className={styles.meta}>
                    {s.duration_minutes} min
                    {s.break_after_minutes ? ` · ${s.break_after_minutes} min break` : ''}
                    {s.contact_preference !== 'default' ? ` · ${s.contact_preference}` : ''}
                  </span>
                </div>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(s.id)}
                  disabled={deleting === s.id}
                  aria-label="Delete task"
                >
                  {deleting === s.id ? '…' : '×'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button className={styles.addBtn} onClick={onAdd}>+ Add Task</button>
    </div>
  );
}
