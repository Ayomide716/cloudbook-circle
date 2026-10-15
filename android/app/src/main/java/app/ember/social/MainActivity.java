package app.ember.social;

import android.graphics.Bitmap;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
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
