package app.ember.social;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.util.Rational;
import android.view.WindowManager;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.activity.result.ActivityResult;

/**
 * Things about Ember's window the web page can't do itself:
 * - secure: no screenshots or screen recording (while a view-once photo is open).
 * - pip: when you leave the app while a video plays, it carries on in a small floating window.
 * - authenticate: the phone's own fingerprint, face or PIN check (to open locked chats).
 */
@CapacitorPlugin(name = "EmberWindow")
public class EmberWindowPlugin extends Plugin {
    /** Set by the page while a video is playing; read by MainActivity when you leave the app. */
    static volatile Rational pipAspect = null;
    private static EmberWindowPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setSecure(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("secure", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    /** {enabled, width, height}: a video is playing (its size gives the window's shape), or not. */
    @PluginMethod
    public void setPictureInPicture(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        int w = call.getInt("width", 16);
        int h = call.getInt("height", 9);
        if (enabled && w > 0 && h > 0) {
            // Android allows shapes between 2.39:1 and 1:2.39.
            double r = Math.max(1 / 2.39, Math.min(2.39, (double) w / h));
            pipAspect = new Rational((int) Math.round(r * 1000), 1000);
        } else {
            pipAspect = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Rational aspect = pipAspect;
            getActivity().runOnUiThread(() -> applyAutoEnter(aspect));
        }
        JSObject ret = new JSObject();
        ret.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        call.resolve(ret);
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private void applyAutoEnter(Rational aspect) {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAutoEnterEnabled(aspect != null);
        if (aspect != null) b.setAspectRatio(aspect);
        try { getActivity().setPictureInPictureParams(b.build()); } catch (Exception ignored) { }
    }

    /** Tells the page when the app goes into or out of the floating window. */
    static void notifyPictureInPicture(boolean inPip) {
        EmberWindowPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("active", inPip);
        p.notifyListeners("pictureInPicture", data);
    }

    /**
     * {title}: asks for the phone's fingerprint, face or screen lock. Resolves {ok}, or
     * {ok: false, reason: "no-lock"} when the phone has no screen lock to check.
     */
    @PluginMethod
    public void authenticate(PluginCall call) {
        String title = call.getString("title", "Unlock");
        Activity activity = getActivity();
        KeyguardManager keyguard = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard == null || !keyguard.isDeviceSecure()) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("reason", "no-lock");
            call.resolve(ret);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            activity.runOnUiThread(() -> showBiometricPrompt(call, title));
        } else {
            Intent intent = keyguard.createConfirmDeviceCredentialIntent(title, null);
            if (intent == null) {
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
                return;
            }
            startActivityForResult(call, intent, "credentialResult");
        }
    }

    @RequiresApi(Build.VERSION_CODES.P)
    @SuppressWarnings("deprecation")
    private void showBiometricPrompt(PluginCall call, String title) {
        Activity activity = getActivity();
        BiometricPrompt.Builder builder = new BiometricPrompt.Builder(activity).setTitle(title);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setDeviceCredentialAllowed(true);
        } else {
            builder.setNegativeButton("Cancel", activity.getMainExecutor(), (dialog, which) -> {
                JSObject ret = new JSObject();
                ret.put("ok", false);
                ret.put("reason", "cancelled");
                call.resolve(ret);
            });
        }
        builder.build().authenticate(new CancellationSignal(), activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                JSObject ret = new JSObject();
                ret.put("ok", false);
                ret.put("reason", String.valueOf(errString));
                call.resolve(ret);
            }
        });
    }

    @ActivityCallback
    private void credentialResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("ok", result.getResultCode() == Activity.RESULT_OK);
        call.resolve(ret);
    }
}
