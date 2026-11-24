package com.deen.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Safe, crash-proof media-only volume helper for voice memorization.
 *
 * - NEVER modifies STREAM_NOTIFICATION or STREAM_SYSTEM (avoids silencing
 *   phone notifications / DND SecurityExceptions).
 * - Persists the saved STREAM_MUSIC level in SharedPreferences so even if the
 *   process is killed or crashes while muted, the original level is restored on
 *   pause, stop, destroy, or next app startup.
 */
@CapacitorPlugin(name = "VolumeControl")
public class VolumeControl extends Plugin {
    private static final String PREFS_NAME = "deen_volume_control_prefs";
    private static final String KEY_MUTED = "is_muted";
    private static final String KEY_ORIGINAL_MUSIC_VOL = "original_music_vol";

    private int originalMusicVol = -1;
    private boolean isMuted = false;

    @Override
    public void load() {
        super.load();
        // Recover cleanly if a previous run died while muted
        restoreOrphanedMuteIfNeeded();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        restoreMediaVolumeInternal();
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        restoreMediaVolumeInternal();
    }

    @Override
    protected void handleOnDestroy() {
        restoreMediaVolumeInternal();
        super.handleOnDestroy();
    }

    private void restoreOrphanedMuteIfNeeded() {
        Context context = getContext();
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_MUTED, false)) {
            int saved = prefs.getInt(KEY_ORIGINAL_MUSIC_VOL, -1);
            originalMusicVol = saved;
            isMuted = true;
            restoreMediaVolumeInternal();
        }
    }

    private synchronized void restoreMediaVolumeInternal() {
        Context context = getContext();
        if (context == null) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (!isMuted && !prefs.getBoolean(KEY_MUTED, false)) {
            return;
        }

        int targetVol = originalMusicVol != -1
            ? originalMusicVol
            : prefs.getInt(KEY_ORIGINAL_MUSIC_VOL, -1);

        try {
            AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null && targetVol >= 0) {
                int currentVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                // Only restore if the user didn't manually raise volume themselves
                if (currentVol == 0) {
                    int maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    audioManager.setStreamVolume(
                        AudioManager.STREAM_MUSIC,
                        Math.min(targetVol, maxVol),
                        0
                    );
                }
            }
        } catch (Exception e) {
            System.err.println("VolumeControl: Failed to restore STREAM_MUSIC: " + e.getMessage());
        } finally {
            isMuted = false;
            originalMusicVol = -1;
            prefs.edit().remove(KEY_MUTED).remove(KEY_ORIGINAL_MUSIC_VOL).apply();
        }
    }

    @PluginMethod
    public synchronized void mute(PluginCall call) {
        try {
            Context context = getContext();
            AudioManager audioManager = context != null
                ? (AudioManager) context.getSystemService(Context.AUDIO_SERVICE)
                : null;

            if (audioManager != null && !isMuted) {
                int current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                originalMusicVol = current;
                if (current > 0) {
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit()
                        .putBoolean(KEY_MUTED, true)
                        .putInt(KEY_ORIGINAL_MUSIC_VOL, current)
                        .apply();
                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
                }
                isMuted = true;
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to mute media stream", e);
        }
    }

    @PluginMethod
    public synchronized void unmute(PluginCall call) {
        try {
            restoreMediaVolumeInternal();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to unmute media stream", e);
        }
    }
}
