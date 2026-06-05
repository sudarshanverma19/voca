package com.vocassistant.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {

    private static final String TAG = "AlarmPlugin";

    // JS: AlarmPlugin.scheduleAlarm({ taskName, scheduleId, triggerAtMs })
    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        String taskName   = call.getString("taskName", "Session");
        String scheduleId = call.getString("scheduleId", "0");
        
        Log.d(TAG, "Raw call data: " + call.getData().toString());

        Long triggerAtMs = null;
        try {
            // Capacitor's getDouble/getLong can be strict. Let's try raw access if needed.
            if (call.hasOption("triggerAtMs")) {
                Object obj = call.getData().get("triggerAtMs");
                if (obj instanceof Number) {
                    triggerAtMs = ((Number) obj).longValue();
                } else if (obj instanceof String) {
                    triggerAtMs = Long.parseLong((String) obj);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing triggerAtMs: " + e.getMessage());
        }

        if (triggerAtMs == null) {
            Log.e(TAG, "scheduleAlarm failed: triggerAtMs is null or could not be parsed");
            call.reject("triggerAtMs is required and must be a valid number");
            return;
        }

        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);

        // Check permission on Android 12+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            Log.w(TAG, "SCHEDULE_EXACT_ALARM not granted — alarm will NOT fire in background!");
            call.reject("EXACT_ALARM_PERMISSION_DENIED: grant in Settings > Special app access > Alarms");
            return;
        }

        PendingIntent pi = buildPendingIntent(ctx, scheduleId, taskName);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
        }

        Log.d(TAG, "Alarm scheduled: scheduleId=" + scheduleId
                + " triggerAt=" + new java.util.Date(triggerAtMs));

        // Persist so AlarmReceiver can reschedule on boot
        AlarmStorage.save(ctx, scheduleId, taskName, triggerAtMs);
        call.resolve();
    }

    // JS: AlarmPlugin.cancelAlarm({ scheduleId })
    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        String scheduleId = call.getString("scheduleId", "0");
        Context ctx = getContext();

        int flags = PendingIntent.FLAG_NO_CREATE
                  | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent intent = new Intent(ctx, AlarmReceiver.class)
                .setAction("com.vocassistant.app.ALARM_FIRE");
        PendingIntent pi = PendingIntent.getBroadcast(ctx, scheduleId.hashCode(), intent, flags);

        if (pi != null) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            am.cancel(pi);
            pi.cancel();
        }

        AlarmStorage.remove(ctx, scheduleId);
        call.resolve();
    }

    // JS: AlarmPlugin.dismissAlarm()  — stops the currently ringing service
    @PluginMethod
    public void dismissAlarm(PluginCall call) {
        Intent stop = new Intent(getContext(), AlarmService.class)
                .setAction(AlarmService.ACTION_DISMISS);
        getContext().startService(stop);
        call.resolve();
    }

    // JS: AlarmPlugin.canScheduleExactAlarms()  — check before scheduling
    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        boolean can = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            can = am.canScheduleExactAlarms();
        }
        call.resolve(new com.getcapacitor.JSObject().put("value", can));
    }

    /**
     * JS: AlarmPlugin.requestAlarmPermissions()
     *
     * Opens TWO system dialogs in sequence:
     *   1. Battery optimisation exemption  — lets the app wake the device reliably.
     *   2. Exact-alarm permission (Android 12+) — required for setExactAndAllowWhileIdle.
     *
     * Must be called once on first launch (e.g. in App.jsx useEffect).
     */
    @PluginMethod
    public void requestAlarmPermissions(PluginCall call) {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();

        // ── 1. Battery optimisation exemption ──────────────────────────────────
        // Without this, Doze mode can delay or swallow the alarm broadcast.
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
            Intent batteryIntent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:" + pkg))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(batteryIntent);
            Log.d(TAG, "Requested battery optimisation exemption");
        } else {
            Log.d(TAG, "Battery optimisation already exempted");
        }

        // ── 2. Exact-alarm permission (Android 12+ / API 31+) ──────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (!am.canScheduleExactAlarms()) {
                Intent alarmIntent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                        .setData(Uri.parse("package:" + pkg))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(alarmIntent);
                Log.d(TAG, "Opened exact-alarm settings page");
            } else {
                Log.d(TAG, "Exact-alarm permission already granted");
            }
        }

        call.resolve();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private PendingIntent buildPendingIntent(Context ctx, String scheduleId, String taskName) {
        Intent intent = new Intent(ctx, AlarmReceiver.class)
                .setAction("com.vocassistant.app.ALARM_FIRE")
                .putExtra("taskName",   taskName)
                .putExtra("scheduleId", scheduleId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                  | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        return PendingIntent.getBroadcast(ctx, scheduleId.hashCode(), intent, flags);
    }
}
