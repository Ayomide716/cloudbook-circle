package app.ember.social;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Decline" on the incoming-call screen: stops the ringing and tells the caller, without
 * opening Ember (the same "call-rejected" broadcast the app sends; see CallProvider.tsx).
 */
public class CallActionReceiver extends BroadcastReceiver {
    static final String ACTION_DECLINE = "app.ember.social.DECLINE_CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_DECLINE.equals(intent.getAction())) return;
        String callerId = intent.getStringExtra("callerId");
        String calleeId = intent.getStringExtra("calleeId");
        String url = intent.getStringExtra("realtimeUrl");
        String key = intent.getStringExtra("anonKey");
        CallNotifications.stop(context, callerId);
        if (callerId == null || calleeId == null || url == null || key == null || !url.startsWith("https://")) return;

        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject().put("from", calleeId).put("to", callerId);
                JSONObject message = new JSONObject()
                        .put("topic", "calls-" + callerId)
                        .put("event", "call-rejected")
                        .put("payload", payload)
                        .put("private", false);
                byte[] body = new JSONObject().put("messages", new JSONArray().put(message)).toString().getBytes(StandardCharsets.UTF_8);
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("apikey", key);
                conn.setRequestProperty("Authorization", "Bearer " + key);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body);
                }
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception e) {
                // The caller's call still times out on its own.
            } finally {
                pending.finish();
            }
        }).start();
    }
}
