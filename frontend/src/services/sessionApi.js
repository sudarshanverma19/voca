import { API_URL as BASE_URL } from '../config';

export async function fetchActiveSession(userId) {
  const res = await fetch(`${BASE_URL}/active-session/${userId}`);
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
  return res.json();
}

export async function postTransitionDecision({ userId, scheduleId, decision, extensionMinutes }) {
  const body = { user_id: userId, schedule_id: scheduleId, decision };
  if (decision === 'extend' && extensionMinutes != null) {
    body.extension_minutes = extensionMinutes;
  }

  const res = await fetch(`${BASE_URL}/transition-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Transition failed: ${res.status}`);
  return res.json();
}

export async function postVoiceDecision({ audioBlob }) {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');

  const res = await fetch(`${BASE_URL}/voice-decision`, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Voice decision failed: ${res.status}`);
  }
  return res.json();
}
