package com.vocassistant.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class AlarmService extends Service {

    public static final String ACTION_FIRE    = "com.vocassistant.app.ACTION_FIRE";
    public static final String ACTION_DISMISS = "com.vocassistant.app.ACTION_DISMISS";

    private static final String CHANNEL_ID       = "vocaflow_alarm";
    private static final int    NOTIF_ID         = 1001;
    private static final long   AUTO_DISMISS_MS  = 60_000L; // auto-stop after 60 s

    private Ringtone ringtone;
    private Vibrator vibrator;
    private Thread   autoStopThread;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }

        if (ACTION_DISMISS.equals(intent.getAction())) {
            dismissAndStop();
            return START_NOT_STICKY;
        }

        if (ACTION_FIRE.equals(intent.getAction())) {
            String taskName   = intent.getStringExtra("taskName");
            String scheduleId = intent.getStringExtra("scheduleId");
            if (taskName == null) taskName = "Session";

            createChannel();
            // startForeground must be called within 5 s of startForegroundService
            startForeground(NOTIF_ID, buildNotification(taskName, scheduleId));

            startRingtone();
            startVibration();
            scheduleAutoStop();
        }

        return START_NOT_STICKY;
    }

    @Nullable @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() { dismissAndStop(); super.onDestroy(); }

    // ── Notification ──────────────────────────────────────────────────────────

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "VocaFlow Alarms", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Session start alarms");
            ch.setSound(null, null);           // audio handled by Ringtone
            ch.enableVibration(false);         // vibration handled manually
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String taskName, String scheduleId) {
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        // Tapping the notification opens the app
        Intent openApp = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("fromAlarm", true)
                .putExtra("scheduleId", scheduleId);
        PendingIntent openPI = PendingIntent.getActivity(this, 0, openApp, piFlags);

        // Dismiss action stops the service without opening the app
        Intent dismissIntent = new Intent(this, AlarmService.class).setAction(ACTION_DISMISS);
        PendingIntent dismissPI = PendingIntent.getService(this, 1, dismissIntent, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("⏰  " + taskName)
                .setContentText("Your scheduled session is starting now. Tap to open.")
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(openPI, true)   // ← shows on locked screen
                .setContentIntent(openPI)
                .addAction(0, "Dismiss", dismissPI)
                .setOngoing(true)
                .setAutoCancel(false)
                .build();
    }

    // ── Ringtone ──────────────────────────────────────────────────────────────

    private void startRingtone() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

            ringtone = RingtoneManager.getRingtone(this, uri);
            if (ringtone == null) return;

            // Max alarm volume
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setStreamVolume(AudioManager.STREAM_ALARM,
                        am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ringtone.setLooping(true);
                ringtone.setVolume(1.0f);
            }
            ringtone.play();
        } catch (Exception ignored) { /* vibration still works */ }
    }

    // ── Vibration ─────────────────────────────────────────────────────────────

    private void startVibration() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) vibrator = vm.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }

        if (vibrator == null || !vibrator.hasVibrator()) return;

        long[] pattern = { 0, 1000, 600, 1000, 600 };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0 /* repeat index */));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    // ── Auto-stop ─────────────────────────────────────────────────────────────

    private void scheduleAutoStop() {
        autoStopThread = new Thread(() -> {
            try { Thread.sleep(AUTO_DISMISS_MS); dismissAndStop(); }
            catch (InterruptedException ignored) {}
        });
        autoStopThread.setDaemon(true);
        autoStopThread.start();
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    private void dismissAndStop() {
        if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        if (vibrator != null) vibrator.cancel();
        if (autoStopThread != null) autoStopThread.interrupt();

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ID);

        stopForeground(true);
        stopSelf();
    }
}
