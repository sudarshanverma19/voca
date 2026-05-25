import { API_URL as BASE } from '../config';

export async function transcribeAudio(audioBlob, context = 'schedule') {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  form.append('context', context);

  const res = await fetch(`${BASE}/stt`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `STT failed: ${res.status}`);
  }
  return res.json(); // { text: string }
}
