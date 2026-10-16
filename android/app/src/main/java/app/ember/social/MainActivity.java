package app.ember.social;

import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
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
