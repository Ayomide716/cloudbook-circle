package app.ember.social;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * The incoming-call screen for when Ember isn't open, as on WhatsApp: a full-screen call (on the
 * lock screen too) with Answer and Decline, ringing with Ember's ringtone until answered,
 * declined, cancelled by the caller, or 40 seconds pass.
 */
final class CallNotifications {
    static final String EXTRA_CALLER = "ember_caller_id";
    private static final long RING_MS = 40_000;

    private CallNotifications() {}

    /** One notification per caller, so their "cancel" finds it. */
    static int idFor(String callerId) {
        return 0x0C411 ^ callerId.hashCode();
    }

    /** ember://call link the web app reads (src/lib/native/call-links.ts). */
    static Uri link(Map<String, String> data, boolean answer) {
        return new Uri.Builder()
                .scheme(BuildConfig.APPLICATION_ID)
                .authority("call")
                .appendQueryParameter("from", data.get("callerId"))
                .appendQueryParameter("name", data.get("callerName"))
                .appendQueryParameter("avatar", data.get("callerAvatar"))
                .appendQueryParameter("voice", data.get("isVoiceOnly"))
                .appendQueryParameter("at", data.get("sentAt"))
                .appendQueryParameter("answer", answer ? "1" : "0")
                .build();
    }

    private static PendingIntent openApp(Context context, Map<String, String> data, boolean answer, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, link(data, answer), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(EXTRA_CALLER, data.get("callerId"));
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Bitmap loadAvatar(String url) {
        if (url == null || !url.startsWith("https://")) return null;
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            try (InputStream in = conn.getInputStream()) {
                return BitmapFactory.decodeStream(in);
            } finally {
                conn.disconnect();
            }
        } catch (Exception e) {
            return null;
        }
    }

    static void ring(Context context, Map<String, String> data) {
        String callerId = data.get("callerId");
        if (callerId == null) return;
        EmberChannels.create(context);
        int id = idFor(callerId);
        boolean voice = "1".equals(data.get("isVoiceOnly"));
        String name = data.get("callerName") != null ? data.get("callerName") : "Someone";

        Person.Builder caller = new Person.Builder().setName(name).setImportant(true);
        Bitmap avatar = loadAvatar(data.get("callerAvatar"));
        if (avatar != null) caller.setIcon(IconCompat.createWithBitmap(avatar));

        Intent declineIntent = new Intent(context, CallActionReceiver.class)
                .setAction(CallActionReceiver.ACTION_DECLINE);
        for (Map.Entry<String, String> e : data.entrySet()) declineIntent.putExtra(e.getKey(), e.getValue());
        PendingIntent decline = PendingIntent.getBroadcast(context, id + 1, declineIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent answer = openApp(context, data, true, id + 2);
        PendingIntent show = openApp(context, data, false, id + 3);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, EmberChannels.CALLS)
                .setSmallIcon(R.drawable.ic_stat_ember)
                .setColor(0xFFFF6A3D)
                .setContentTitle(name)
                .setContentText(voice ? "Incoming voice call" : "Incoming video call")
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setTimeoutAfter(RING_MS)
                .setSound(EmberChannels.raw(context, "ember_ringtone"))
                .setVibrate(new long[] {0, 800, 600, 800, 600})
                .setContentIntent(show)
                .setFullScreenIntent(show, true)
                .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller.build(), decline, answer));

        try {
            show(context, id, builder);
        } catch (SecurityException e) {
            // Notifications not allowed on this phone.
        } catch (RuntimeException e) {
            // A phone that refuses the call style: plain buttons instead.
            builder.setStyle(null)
                    .addAction(0, "Decline", decline)
                    .addAction(0, "Answer", answer);
            try { show(context, id, builder); } catch (RuntimeException ignored) {}
        }
    }

    @SuppressLint("MissingPermission") // checked by the caller (SecurityException)
    private static void show(Context context, int id, NotificationCompat.Builder builder) {
        Notification notification = builder.build();
        // Keep ringing (the sound repeats) until the call is answered, declined or cancelled.
        notification.flags |= Notification.FLAG_INSISTENT;
        NotificationManagerCompat.from(context).notify(id, notification);
    }

    static void stop(Context context, String callerId) {
        if (callerId != null) NotificationManagerCompat.from(context).cancel(idFor(callerId));
    }
}
