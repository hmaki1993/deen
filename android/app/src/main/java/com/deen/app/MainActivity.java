package com.deen.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {

    private static class PendingWebPermission {
        final PermissionRequest request;
        final AtomicBoolean resolved = new AtomicBoolean(false);

        PendingWebPermission(PermissionRequest request) {
            this.request = request;
        }

        void grantSafely() {
            if (resolved.compareAndSet(false, true)) {
                try {
                    request.grant(request.getResources());
                } catch (IllegalStateException ignored) {
                    // Request was already cancelled or settled by WebView
                }
            }
        }

        void denySafely() {
            if (resolved.compareAndSet(false, true)) {
                try {
                    request.deny();
                } catch (IllegalStateException ignored) {
                    // Request was already cancelled or settled by WebView
                }
            }
        }
    }

    private PendingWebPermission activeWebPermission = null;
    private ActivityResultLauncher<String[]> safePermissionLauncher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeControl.class);
        registerPlugin(DeenSystemPlugin.class);

        safePermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            (Map<String, Boolean> results) -> {
                PendingWebPermission pending = activeWebPermission;
                activeWebPermission = null;
                if (pending == null) return;

                boolean allGranted = !results.isEmpty();
                for (Boolean granted : results.values()) {
                    if (!Boolean.TRUE.equals(granted)) {
                        allGranted = false;
                        break;
                    }
                }
                if (allGranted) {
                    pending.grantSafely();
                } else {
                    pending.denySafely();
                }
            }
        );

        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        configureSystemBars();
        installSafeWebChromeClient();
        installBackNavigationHandler();
    }

    private void configureSystemBars() {
        applySystemTheme(this, false);
    }

    public static void applySystemTheme(Activity activity, boolean isLight) {
        if (activity == null) return;
        try {
            int barColor = Color.parseColor(isLight ? "#F5F2EB" : "#0A0A0F");
            activity.getWindow().setStatusBarColor(barColor);
            activity.getWindow().setNavigationBarColor(barColor);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(isLight);
                controller.setAppearanceLightNavigationBars(isLight);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Replaces Capacitor's default BridgeWebChromeClient permission callback
     * to prevent fatal IllegalStateException ("Either grant() or deny() has been
     * already called") when SpeechRecognition / getUserMedia fires rapid requests.
     */
    private void installSafeWebChromeClient() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;

        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) {
                        try { request.deny(); } catch (IllegalStateException ignored) {}
                        return;
                    }

                    List<String> resources = Arrays.asList(request.getResources());
                    List<String> missingPermissions = new ArrayList<>();

                    if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                != PackageManager.PERMISSION_GRANTED) {
                            missingPermissions.add(Manifest.permission.CAMERA);
                        }
                    }
                    if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                != PackageManager.PERMISSION_GRANTED) {
                            missingPermissions.add(Manifest.permission.RECORD_AUDIO);
                        }
                    }

                    // Fast path: permissions already granted — grant immediately without ActivityResult race
                    if (missingPermissions.isEmpty() || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                        try {
                            request.grant(request.getResources());
                        } catch (IllegalStateException ignored) {
                        }
                        return;
                    }

                    // Cancel any stale pending request cleanly before launching a new dialog
                    if (activeWebPermission != null) {
                        activeWebPermission.denySafely();
                        activeWebPermission = null;
                    }

                    activeWebPermission = new PendingWebPermission(request);
                    safePermissionLauncher.launch(missingPermissions.toArray(new String[0]));
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (activeWebPermission != null && activeWebPermission.request == request) {
                        activeWebPermission.resolved.set(true);
                        activeWebPermission = null;
                    }
                });
                super.onPermissionRequestCanceled(request);
            }
        });
    }

    private void installBackNavigationHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Bridge bridge = getBridge();
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){ try { return typeof window.__deenHandleBack === 'function' ? !!window.__deenHandleBack() : false; } catch(e) { return false; } })()",
                    value -> {
                        if (!"true".equals(value)) {
                            moveTaskToBack(true);
                        }
                    }
                );
            }
        });
    }
}
