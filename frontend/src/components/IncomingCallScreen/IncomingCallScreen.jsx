import styles from './IncomingCallScreen.module.css';

export function IncomingCallScreen({ taskName, onAccept, onReject }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-label="Incoming session call">
        <span className={styles.icon}>📞</span>
        <h2 className={styles.title}>Incoming Session Call</h2>
        <p className={styles.taskName}>{taskName}</p>
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.accept}`} onClick={onAccept}>
            Accept
          </button>
          <button className={`${styles.btn} ${styles.reject}`} onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
