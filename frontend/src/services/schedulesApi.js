/**
 * schedulesApi.js
 *
 * All requests to the backend for schedule operations.
 */
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

export async function copyPreviousSchedule(userId, targetDate) {
  const res = await fetch(`${BASE}/schedules/copy-previous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, target_date: targetDate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Copy failed: ${res.status}`);
  }
  return res.json();
}
