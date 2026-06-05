/**
 * AlarmPlugin.js — JS bridge to the native Android AlarmPlugin.
 *
 * On web / iOS the calls are safe no-ops so the same code runs everywhere.
 */
import { registerPlugin } from '@capacitor/core';

const _NativeAlarm = registerPlugin('AlarmPlugin');

// ── Low-level bridge (mirrors Java @PluginMethod names exactly) ───────────────
export const AlarmPlugin = _NativeAlarm;

/**
 * Call this ONCE on app startup (App.jsx useEffect).
 * Opens system dialogs for:
 *   - Battery optimisation exemption (Doze bypass)
 *   - Exact-alarm permission (Android 12+)
 * Both are required for alarms to fire when screen is off / app is closed.
 */
export async function requestAlarmPermissions() {
  if (!isAndroid()) return;
  try {
    await _NativeAlarm.requestAlarmPermissions();
  } catch (err) {
    console.error('[AlarmPlugin] requestAlarmPermissions failed:', err);
  }
}

/**
 * Schedule a native alarm from a schedule object returned by the backend.
 *
 * @param {{ id: string|number, task_name: string, date: string, start_time: string }} schedule
 */
export async function scheduleNativeAlarm(schedule) {
  if (!isAndroid()) return;

  console.log('[AlarmPlugin] scheduleNativeAlarm called with:', JSON.stringify(schedule));

  let triggerAtMs = 0;
  try {
    // Robust parsing: "2026-05-28" + "14:30"
    const [year, month, day] = schedule.date.split('-').map(Number);
    const [hour, minute]     = schedule.start_time.split(':').map(Number);

    const date = new Date();
    date.setFullYear(year, month - 1, day);
    date.setHours(hour, minute, 0, 0);

    triggerAtMs = date.getTime();
  } catch (err) {
    console.error('[AlarmPlugin] Failed to parse schedule date/time:', err);
    return;
  }

  if (!triggerAtMs || isNaN(triggerAtMs)) {
    console.error('[AlarmPlugin] triggerAtMs is invalid (NaN/0)');
    return;
  }

  if (triggerAtMs <= Date.now()) {
    console.warn('[AlarmPlugin] trigger time is in the past — skipping native alarm');
    return;
  }

  try {
    await _NativeAlarm.scheduleAlarm({
      taskName:    schedule.task_name,
      scheduleId:  String(schedule.id),
      triggerAtMs,
    });
    console.log(
      '[AlarmPlugin] SUCCESS: alarm scheduled for',
      new Date(triggerAtMs).toLocaleString(),
      '— task:', schedule.task_name,
    );
  } catch (err) {
    // EXACT_ALARM_PERMISSION_DENIED → guide user to Settings
    if (String(err.message).includes('EXACT_ALARM_PERMISSION_DENIED')) {
      console.warn('[AlarmPlugin] exact-alarm permission missing. Direct user to Settings › Alarms & reminders.');
    } else {
      console.error('[AlarmPlugin] scheduleAlarm failed:', err);
    }
  }
}

/**
 * Cancel a previously scheduled native alarm by schedule ID.
 */
export async function cancelNativeAlarm(scheduleId) {
  if (!isAndroid()) return;
  try {
    await _NativeAlarm.cancelAlarm({ scheduleId: String(scheduleId) });
  } catch (err) {
    console.error('[AlarmPlugin] cancelAlarm failed:', err);
  }
}

/**
 * Stop the currently ringing alarm service (call from Accept / Dismiss handlers).
 */
export async function dismissNativeAlarm() {
  if (!isAndroid()) return;
  try {
    await _NativeAlarm.dismissAlarm();
  } catch (err) {
    console.error('[AlarmPlugin] dismissAlarm failed:', err);
  }
}

/**
 * Returns true only when running inside a real Android APK (not browser/iOS).
 */
function isAndroid() {
  return !!(window.Capacitor?.isNativePlatform?.() &&
            window.Capacitor?.getPlatform?.() === 'android');
}
