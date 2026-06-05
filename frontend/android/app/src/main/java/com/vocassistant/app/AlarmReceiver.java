package com.vocassistant.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        switch (action) {
            case "com.vocassistant.app.ALARM_FIRE":
                fireAlarm(context, intent);
                break;

            // Reschedule all saved alarms after device reboot
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_LOCKED_BOOT_COMPLETED:
                rescheduleOnBoot(context);
                break;
        }
    }

    private void fireAlarm(Context context, Intent intent) {
        String taskName   = intent.getStringExtra("taskName");
        String scheduleId = intent.getStringExtra("scheduleId");

        Intent svc = new Intent(context, AlarmService.class)
                .setAction(AlarmService.ACTION_FIRE)
                .putExtra("taskName",   taskName)
                .putExtra("scheduleId", scheduleId);

        // startForegroundService required on API 26+ (Android 8+)
        ContextCompat.startForegroundService(context, svc);
    }

    private void rescheduleOnBoot(Context context) {
        long now = System.currentTimeMillis();

        for (AlarmStorage.AlarmEntry entry : AlarmStorage.loadAll(context)) {
            // Only reschedule future alarms
            if (entry.triggerAtMs <= now) {
                AlarmStorage.remove(context, entry.scheduleId);
                continue;
            }

            android.app.AlarmManager am =
                    (android.app.AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

            Intent intent = new Intent(context, AlarmReceiver.class)
                    .setAction("com.vocassistant.app.ALARM_FIRE")
                    .putExtra("taskName",   entry.taskName)
                    .putExtra("scheduleId", entry.scheduleId);

            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            }

            android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(
                    context, entry.scheduleId.hashCode(), intent, flags);

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, entry.triggerAtMs, pi);
            } else {
                am.setExact(android.app.AlarmManager.RTC_WAKEUP, entry.triggerAtMs, pi);
            }
        }
    }
}
