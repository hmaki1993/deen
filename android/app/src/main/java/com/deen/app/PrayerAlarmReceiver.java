package com.deen.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.AlarmManagerCompat;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Fires local Prayer Time & Morning/Evening Azkar notifications and automatically
 * restores saved alarms on device reboot or app update.
 */
public class PrayerAlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_FIRE_ALARM = "com.deen.app.FIRE_PRAYER_ALARM";
    public static final String PREFS_NAME = "deen_prayer_alarms_prefs";
    public static final String KEY_ALARMS_JSON = "scheduled_alarms_json";
    private static final String CHANNEL_ID = "deen_prayer_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            rescheduleSavedAlarms(context);
            return;
        }

        if (ACTION_FIRE_ALARM.equals(action)) {
            int id = intent.getIntExtra("id", 7860);
            String title = intent.getStringExtra("title");
            String body = intent.getStringExtra("body");
            if (title == null || title.isEmpty()) title = "دين";
            if (body == null) body = "";
            showNotification(context, id, title, body);
        }
    }

    private void showNotification(Context context, int id, String title, String body) {
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "تنبيهات الصلاة والأذكار",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("تنبيهات مواقيت الصلوات الخمس وأذكار الصباح والمساء");
                channel.enableVibration(true);
                nm.createNotificationChannel(channel);
            }
        }

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent contentIntent = PendingIntent.getActivity(context, id, launchIntent, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setColor(0xFFC9A84C)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        try {
            nm.notify(id, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS revoked by user
        }
    }

    public static void rescheduleSavedAlarms(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_ALARMS_JSON, null);
        if (raw == null || raw.isEmpty()) return;

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                long triggerAt = item.optLong("triggerAt", 0L);
                if (triggerAt <= now + 5000L) continue;

                int id = item.optInt("id", 1000 + i);
                String title = item.optString("title", "دين");
                String body = item.optString("body", "");
                scheduleSingleAlarm(context, am, id, triggerAt, title, body);
            }
        } catch (Exception ignored) {
        }
    }

    public static void scheduleSingleAlarm(
        Context context,
        AlarmManager am,
        int id,
        long triggerAt,
        String title,
        String body
    ) {
        Intent alarmIntent = new Intent(context, PrayerAlarmReceiver.class);
        alarmIntent.setAction(ACTION_FIRE_ALARM);
        alarmIntent.putExtra("id", id);
        alarmIntent.putExtra("title", title);
        alarmIntent.putExtra("body", body);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(context, id, alarmIntent, piFlags);
        AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, triggerAt, pi);
    }

    public static void cancelAllSavedAlarms(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_ALARMS_JSON, null);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (raw != null && am != null) {
            try {
                JSONArray arr = new JSONArray(raw);
                int piFlags = PendingIntent.FLAG_NO_CREATE
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item == null) continue;
                    int id = item.optInt("id", 1000 + i);
                    Intent alarmIntent = new Intent(context, PrayerAlarmReceiver.class);
                    alarmIntent.setAction(ACTION_FIRE_ALARM);
                    PendingIntent pi = PendingIntent.getBroadcast(context, id, alarmIntent, piFlags);
                    if (pi != null) {
                        am.cancel(pi);
                        pi.cancel();
                    }
                }
            } catch (Exception ignored) {
            }
        }
        prefs.edit().remove(KEY_ALARMS_JSON).apply();
    }
}
