package com.deen.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native Capacitor bridge for:
 * 1. Dynamic Android system status/navigation bar Light & Dark theme synchronization
 * 2. Foreground audio keep-alive service during Quran recitation
 * 3. Local Prayer & Morning/Evening Azkar AlarmManager scheduling
 */
@CapacitorPlugin(
    name = "DeenSystem",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class DeenSystemPlugin extends Plugin {

    @PluginMethod
    public void setSystemTheme(PluginCall call) {
        String theme = call.getString("theme", "dark");
        boolean isLight = "light".equalsIgnoreCase(theme);
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> MainActivity.applySystemTheme(activity, isLight));
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setBackgroundAudio(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        String title = call.getString("title", "دين — القرآن الكريم");
        String subtitle = call.getString("subtitle", "");

        Context context = getContext();
        if (context != null) {
            try {
                Intent svcIntent = new Intent(context, QuranAudioService.class);
                if (active) {
                    svcIntent.setAction(QuranAudioService.ACTION_START_OR_UPDATE);
                    svcIntent.putExtra(QuranAudioService.EXTRA_TITLE, title);
                    svcIntent.putExtra(QuranAudioService.EXTRA_SUBTITLE, subtitle);
                    ContextCompat.startForegroundService(context, svcIntent);
                } else {
                    context.stopService(svcIntent);
                }
            } catch (Exception ignored) {
                // Gracefully ignore background start limits on strict OEM profiles
            }
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsPermCallback");
                return;
            }
        }
        applyScheduledAlarms(call);
    }

    @PermissionCallback
    private void notificationsPermCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }
        applyScheduledAlarms(call);
    }

    private void applyScheduledAlarms(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }

        PrayerAlarmReceiver.cancelAllSavedAlarms(context);

        JSArray alarms = call.getArray("alarms");
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        JSONArray persisted = new JSONArray();
        long now = System.currentTimeMillis();

        if (alarms != null && am != null) {
            int limit = Math.min(alarms.length(), 60);
            for (int i = 0; i < limit; i++) {
                try {
                    JSONObject item = alarms.getJSONObject(i);
                    long triggerAt = item.optLong("triggerAt", 0L);
                    if (triggerAt <= now + 5000L) continue;

                    int id = item.optInt("id", 1000 + i);
                    String title = item.optString("title", "دين");
                    String body = item.optString("body", "");

                    PrayerAlarmReceiver.scheduleSingleAlarm(context, am, id, triggerAt, title, body);
                    persisted.put(item);
                } catch (Exception ignored) {
                }
            }
        }

        SharedPreferences prefs =
            context.getSharedPreferences(PrayerAlarmReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PrayerAlarmReceiver.KEY_ALARMS_JSON, persisted.toString()).apply();

        JSObject ret = new JSObject();
        ret.put("granted", true);
        ret.put("scheduled", persisted.length());
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelNotifications(PluginCall call) {
        Context context = getContext();
        if (context != null) {
            PrayerAlarmReceiver.cancelAllSavedAlarms(context);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
