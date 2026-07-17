package com.deen.app;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VolumeControl")
public class VolumeControl extends Plugin {
    private int originalMusicVol = -1;
    private int originalSystemVol = -1;
    private int originalNotificationVol = -1;
    private boolean isMuted = false;

    @PluginMethod
    public void mute(PluginCall call) {
        try {
            Context context = getContext();
            AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null && !isMuted) {
                // Mute Music Stream (Media)
                try {
                    originalMusicVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
                } catch (Exception e) {
                    System.err.println("Failed to mute STREAM_MUSIC: " + e.getMessage());
                }

                // Mute System Stream (System Beeps)
                try {
                    originalSystemVol = audioManager.getStreamVolume(AudioManager.STREAM_SYSTEM);
                    audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM, 0, 0);
                } catch (Exception e) {
                    System.err.println("Failed to mute STREAM_SYSTEM: " + e.getMessage());
                }

                // Mute Notification Stream
                try {
                    originalNotificationVol = audioManager.getStreamVolume(AudioManager.STREAM_NOTIFICATION);
                    audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, 0, 0);
                } catch (Exception e) {
                    System.err.println("Failed to mute STREAM_NOTIFICATION: " + e.getMessage());
                }

                isMuted = true;
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to mute stream", e);
        }
    }

    @PluginMethod
    public void unmute(PluginCall call) {
        try {
            Context context = getContext();
            AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null && isMuted) {
                // Restore Music Stream
                try {
                    int currentMusicVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                    if (currentMusicVol == 0 && originalMusicVol != -1) {
                        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, originalMusicVol, 0);
                    }
                } catch (Exception e) {
                    System.err.println("Failed to restore STREAM_MUSIC: " + e.getMessage());
                }

                // Restore System Stream
                try {
                    int currentSystemVol = audioManager.getStreamVolume(AudioManager.STREAM_SYSTEM);
                    if (currentSystemVol == 0 && originalSystemVol != -1) {
                        audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM, originalSystemVol, 0);
                    }
                } catch (Exception e) {
                    System.err.println("Failed to restore STREAM_SYSTEM: " + e.getMessage());
                }

                // Restore Notification Stream
                try {
                    int currentNotificationVol = audioManager.getStreamVolume(AudioManager.STREAM_NOTIFICATION);
                    if (currentNotificationVol == 0 && originalNotificationVol != -1) {
                        audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, originalNotificationVol, 0);
                    }
                } catch (Exception e) {
                    System.err.println("Failed to restore STREAM_NOTIFICATION: " + e.getMessage());
                }

                isMuted = false;
                originalMusicVol = -1;
                originalSystemVol = -1;
                originalNotificationVol = -1;
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to unmute stream", e);
        }
    }
}
