package app.ember.social;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.annotation.RequiresApi;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private static volatile boolean visible;

    /** Ember is on screen, so it rings calls itself instead of the call notification. */
    static boolean isVisible() {
        return visible;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EmberWindowPlugin.class);
        super.onCreate(savedInstanceState);
        EmberChannels.create(this);
        handleCall(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleCall(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        visible = false;
    }

    /**
     * Leaving the app while a video plays: carry on in a small floating window. (Android 12 and
     * later do this by themselves, from setAutoEnterEnabled in EmberWindowPlugin.)
     */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (EmberWindowPlugin.pipAspect != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPip(EmberWindowPlugin.pipAspect);
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private void enterPip(android.util.Rational aspect) {
        try {
            enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(aspect).build());
        } catch (Exception ignored) { }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        EmberWindowPlugin.notifyPictureInPicture(isInPictureInPictureMode);
    }

    /** Opened from a call notification: show over the lock screen, and the app takes over ringing. */
    private void handleCall(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data == null || !"call".equals(data.getHost())) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        CallNotifications.stop(this, data.getQueryParameter("from"));
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;
        // No scrollbar on the page itself, as in native apps (lists inside are handled in index.css).
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        // Videos without a picture yet show black, not Android's grey "media" placeholder.
        webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public Bitmap getDefaultVideoPoster() {
                Bitmap blank = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                blank.eraseColor(0xFF000000);
                return blank;
            }
        });
    }
}
