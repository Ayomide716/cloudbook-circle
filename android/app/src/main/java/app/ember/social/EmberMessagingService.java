package app.ember.social;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Firebase messages for Ember. Calls ("call" / "call-cancel" data messages from the call-push
 * function) become the incoming-call screen even when Ember is closed; everything else goes on
 * to Capacitor's push plugin as before.
 */
public class EmberMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        if ("call".equals(type)) {
            String sentAt = data.get("sentAt");
            long age = 0;
            try { age = System.currentTimeMillis() - Long.parseLong(sentAt); } catch (Exception ignored) {}
            // Ember open: the app rings by itself. A call older than its ringing time is over.
            if (!MainActivity.isVisible() && age < 40_000) CallNotifications.ring(this, data);
            return;
        }
        if ("call-cancel".equals(type)) {
            CallNotifications.stop(this, data.get("callerId"));
            return;
        }
        super.onMessageReceived(message);
    }
}
