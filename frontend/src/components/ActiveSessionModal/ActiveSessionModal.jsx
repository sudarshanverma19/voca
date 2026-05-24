import { useState, useEffect, useRef } from 'react';
import { fetchActiveSession, postTransitionDecision, postVoiceDecision } from '../../services/sessionApi';
import { IncomingCallScreen } from '../IncomingCallScreen/IncomingCallScreen';
import { useWebRTC } from '../../hooks/useWebRTC';
import styles from './ActiveSessionModal.module.css';

const POLL_INTERVAL_MS = 5000;

export function ActiveSessionModal({ userId }) {
  const [activeSession, setActiveSession] = useState(null);
  const [showSessionPopup, setShowSessionPopup] = useState(false);
  const [ignoredSessionId, setIgnoredSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extensionMinutes, setExtensionMinutes] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('idle'); // 'idle' | 'recording' | 'processing'
  const [voiceTranscript, setVoiceTranscript] = useState(null);
  const [needsDuration, setNeedsDuration] = useState(false);

  const { callState, incomingSessionId, connectedCount, startCall, acceptCall, hangUp } = useWebRTC(userId);

  const isIncomingCall = callState === 'ringing';
  const isCallActive = callState !== 'idle';

  // Refs so async callbacks always see the latest values without stale closures
  const callStateRef = useRef(callState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  const ignoredSessionIdRef = useRef(ignoredSessionId);
  useEffect(() => { ignoredSessionIdRef.current = ignoredSessionId; }, [ignoredSessionId]);
  // Always points at the latest handleDecision so onstop callbacks don't go stale
  const handleDecisionRef = useRef(null);

  // 5-second voice recording starts the moment the session popup opens.
  // Uses a separate getUserMedia stream (not the WebRTC one) per spec.
  useEffect(() => {
    if (!showSessionPopup || !activeSession) return;

    let recorder;
    let stream;
    let cancelled = false;

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        const chunks = [];

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setVoiceStatus('processing');
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          try {
            const result = await postVoiceDecision({ audioBlob: blob });
            setVoiceTranscript({ text: result.text, intent: result.intent });

            if (result.needs_repeat) {
              setError(result.message);
            } else if (result.needs_duration) {
              // Extend heard but no duration spoken — ask the user
              setNeedsDuration(true);
            } else if (result.intent === 'extend' && result.duration) {
              handleDecisionRef.current('extend', result.duration);
            } else if (result.intent) {
              handleDecisionRef.current(result.intent);
            }
            // intent=null, needs_repeat=false → manual buttons stay visible
          } catch (err) {
            setError(`Voice input failed: ${err.message}`);
          } finally {
            setVoiceStatus('idle');
          }
        };

        // Wait for TTS announcement to finish before recording user's voice
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (cancelled) return;

        recorder.start();
        setVoiceStatus('recording');
        setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 5000);
      } catch (err) {
        console.error('[ActiveSessionModal] mic access error:', err);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (recorder && recorder.state === 'recording') recorder.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setNeedsDuration(false);
      setVoiceTranscript(null);
    };
  }, [showSessionPopup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll when idle. connectedCount is included so a reconnect immediately
  // re-polls — this recovers events missed while the socket was disconnected.
  // Guard connectedCount === 0 so we never call startCall before userSocket has
  // registered with the signaling server (race condition: poll fires on mount
  // before the socket handshake completes, making call:start arrive before
  // register, so the signaling server can't find the callee).
  useEffect(() => {
    if (isCallActive || showSessionPopup || connectedCount === 0) return;

    const poll = async () => {
      try {
        const data = await fetchActiveSession(userId);
        // Guard callState at resolution time to prevent duplicate startCall
        if (
          data.active &&
          data.data.schedule_id !== ignoredSessionIdRef.current &&
          callStateRef.current === 'idle'
        ) {
          setActiveSession(data.data);
          startCall(data.data.schedule_id);
        }
      } catch (err) {
        console.error('[ActiveSessionModal] poll error:', err);
      }
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [userId, isCallActive, showSessionPopup, connectedCount, startCall]); // ignoredSessionId via ref

  const handleAccept = () => {
    acceptCall(incomingSessionId);
    setShowSessionPopup(true);
    if ('speechSynthesis' in window && activeSession?.task) {
      const utterance = new SpeechSynthesisUtterance(`Your next task is ${activeSession.task}`);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleReject = async () => {
    setIgnoredSessionId(activeSession.schedule_id);
    hangUp(incomingSessionId);
    try {
      await postTransitionDecision({
        userId,
        scheduleId: activeSession.schedule_id,
        decision: 'skip',
        extensionMinutes: null,
      });
    } catch (err) {
      console.error('[ActiveSessionModal] reject/skip post failed:', err);
    }
    setActiveSession(null);
  };

  // Auto-reject after 30 seconds if user doesn't respond
  useEffect(() => {
    if (!isIncomingCall || !activeSession) return;
    const scheduleId = activeSession.schedule_id;
    const sessionId = incomingSessionId;
    const timer = setTimeout(() => {
      setIgnoredSessionId(scheduleId);
      hangUp(sessionId);
      postTransitionDecision({ userId, scheduleId, decision: 'skip', extensionMinutes: null })
        .catch((err) => console.error('[ActiveSessionModal] auto-reject post failed:', err));
      setActiveSession(null);
    }, 30000);
    return () => clearTimeout(timer);
  }, [isIncomingCall]); // eslint-disable-line react-hooks/exhaustive-deps

  // extensionMinsOverride lets voice bypass the controlled input state
  const handleDecision = async (decision, extensionMinsOverride = null) => {
    setLoading(true);
    setError(null);
    try {
      await postTransitionDecision({
        userId,
        scheduleId: activeSession.schedule_id,
        decision,
        extensionMinutes: decision === 'extend'
          ? (extensionMinsOverride ?? (Number(extensionMinutes) || null))
          : null,
      });
      hangUp(incomingSessionId);
      setShowSessionPopup(false);
      setActiveSession(null);
      setExtensionMinutes('');
      setNeedsDuration(false);
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  handleDecisionRef.current = handleDecision;

  // Follow-up recording triggered when user says "extend" without a duration.
  // Sends audio to the same endpoint; any duration found in speech is used as
  // the extension time without requiring the word "extend" a second time.
  const handleDurationVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setVoiceStatus('processing');
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        try {
          const result = await postVoiceDecision({ audioBlob: blob });
          setVoiceTranscript({ text: result.text, intent: result.intent });
          if (result.needs_repeat) {
            setError(result.message);
          } else if (result.duration) {
            handleDecisionRef.current('extend', result.duration);
          } else {
            setError('Duration not detected. Please type it below.');
          }
        } catch (err) {
          setError(`Voice input failed: ${err.message}`);
        } finally {
          setVoiceStatus('idle');
        }
      };

      recorder.start();
      setVoiceStatus('recording');
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 5000);
    } catch {
      setError('Could not access microphone.');
    }
  };

  if (isIncomingCall && activeSession) {
    return (
      <IncomingCallScreen
        taskName={activeSession.task}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    );
  }

  if (!showSessionPopup || !activeSession) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <h2 className={styles.task}>{activeSession.task}</h2>
        <p className={styles.message}>{activeSession.message}</p>
        <p className={styles.question}>{activeSession.question}</p>

        {needsDuration && (
          <div className={styles.durationPrompt}>
            <p className={styles.question}>How much time do you need?</p>
            <button
              className={`${styles.btn} ${styles.extend}`}
              onClick={handleDurationVoice}
              disabled={voiceStatus !== 'idle'}
            >
              {voiceStatus === 'recording' ? 'Listening…' : 'Speak'}
            </button>
            <p className={styles.loadingText} style={{ fontSize: '0.75rem' }}>
              or type minutes below and click Extend
            </p>
          </div>
        )}

        <div className={styles.extendRow}>
          <label htmlFor="ext-mins" className={styles.extendLabel}>
            Extend by (minutes):
          </label>
          <input
            id="ext-mins"
            type="number"
            min="1"
            value={extensionMinutes}
            onChange={(e) => setExtensionMinutes(e.target.value)}
            className={styles.extendInput}
            placeholder="e.g. 15"
          />
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.completed}`}
            onClick={() => handleDecision('completed')}
            disabled={loading}
          >
            Completed
          </button>
          <button
            className={`${styles.btn} ${styles.extend}`}
            onClick={() => handleDecision('extend')}
            disabled={loading || !extensionMinutes}
          >
            Extend
          </button>
          <button
            className={`${styles.btn} ${styles.skip}`}
            onClick={() => handleDecision('skip')}
            disabled={loading}
          >
            Skip
          </button>
        </div>

        {voiceStatus === 'recording' && <p className={styles.loadingText}>Listening…</p>}
        {voiceStatus === 'processing' && <p className={styles.loadingText}>Processing voice…</p>}
        {voiceTranscript && (
          <p className={styles.loadingText} style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            Heard: &ldquo;{voiceTranscript.text}&rdquo;
            {voiceTranscript.intent
              ? ` → ${voiceTranscript.intent} ✓`
              : ' → no intent detected, use buttons'}
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {loading && <p className={styles.loadingText}>Submitting…</p>}
      </div>
    </div>
  );
}
