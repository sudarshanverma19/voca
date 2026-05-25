import { API_URL as BASE } from '../config';

export async function getSchedules(userId, date) {
  const res = await fetch(`${BASE}/schedules/${date}?user_id=${userId}`);
  if (!res.ok) throw new Error(`Failed to fetch schedules: ${res.status}`);
  return res.json();
}

export async function createSchedule(payload) {
  const res = await fetch(`${BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Create failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteSchedule(scheduleId) {
  const res = await fetch(`${BASE}/schedules/${scheduleId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status}`);
}
