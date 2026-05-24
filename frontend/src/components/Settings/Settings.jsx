import { useState } from 'react';
import styles from './Settings.module.css';

const OPTIONS = [
  { value: 'call',         label: 'Call',         desc: 'Ring via WebRTC inside the app' },
  { value: 'notification', label: 'Notification',  desc: 'Push notification to this device' },
];

const STORAGE_KEY = 'vf_contact_default';

function load() {
  return localStorage.getItem(STORAGE_KEY) || 'call';
}

export function Settings() {
  const [pref, setPref] = useState(load);
  const [saved, setSaved] = useState(false);

  const select = (value) => {
    setPref(value);
    localStorage.setItem(STORAGE_KEY, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Settings</h2>

      <section className={styles.section}>
        <p className={styles.sectionTitle}>Default Contact Mode</p>
        <p className={styles.sectionDesc}>
          How VocaFlow reaches you at the start of each session.
          Can be overridden per task when creating a schedule.
        </p>

        <div className={styles.options}>
          {OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.option} ${pref === o.value ? styles.optionActive : ''}`}
              onClick={() => select(o.value)}
            >
              <span className={styles.radio}>{pref === o.value ? '●' : '○'}</span>
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{o.label}</span>
                <span className={styles.optionDesc}>{o.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {saved && <p className={styles.saved}>Saved</p>}
      </section>

      <section className={styles.section}>
        <p className={styles.sectionTitle}>Test Mode</p>
        <p className={styles.sectionDesc}>
          To test the full pipeline, set <code>_TEST_DELAY_SECS = 30</code> in{' '}
          <code>backend/services/scheduler.py</code> and restart the server. Any new task will
          trigger in 30 seconds regardless of the scheduled time.
        </p>
      </section>
    </div>
  );
}
