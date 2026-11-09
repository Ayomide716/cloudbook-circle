package app.ember.social;

import android.app.PictureInPictureParams;
import android.os.Build;
import android.util.Rational;
import android.view.WindowManager;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Two things about Ember's window the web page can't do itself:
 * - secure: no screenshots or screen recording (while a view-once photo is open).
 * - pip: when you leave the app while a video plays, it carries on in a small floating window.
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
}
