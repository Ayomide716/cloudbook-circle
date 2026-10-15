package app.ember.social;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // No scrollbar on the page itself, as in native apps (lists inside are handled in index.css).
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) {
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
        }
    }
}
