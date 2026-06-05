import styles from './IncomingCallScreen.module.css';

export function IncomingCallScreen({ taskName, onAccept, onReject }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-label="Incoming session call">

        {/* Pulsing ripple + wiggling phone icon */}
        <div className={styles.iconWrap}>
          <div className={styles.iconCircle}>📞</div>
        </div>

        <p className={styles.title}>Incoming Session</p>
        <h2 className={styles.taskName}>{taskName}</h2>

        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.reject}`} onClick={onReject}>
            ✕ Reject
          </button>
          <button className={`${styles.btn} ${styles.accept}`} onClick={onAccept}>
            ✓ Accept
          </button>
        </div>

      </div>
    </div>
  );
}
