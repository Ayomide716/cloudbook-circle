package app.ember.social;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Ember's notification channels, with Ember's own sounds (res/raw): "Ember" for messages,
 * comments and the rest (the Tethys chime) and "Calls" for incoming calls (the Titania
 * ringtone). Android fixes a channel's sound when it's created, so these replace the first
 * channel ("ember"), which used the phone's default sound.
 */
final class EmberChannels {
    static final String ALERTS = "ember_v2";
    static final String CALLS = "ember_calls";

    private EmberChannels() {}

    static Uri raw(Context context, String name) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/raw/" + name);
    }

    static void create(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel alerts = new NotificationChannel(ALERTS, "Ember", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Messages, comments, likes and friend requests");
        alerts.setSound(raw(context, "ember_notification"), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        alerts.enableVibration(true);
        manager.createNotificationChannel(alerts);

        NotificationChannel calls = new NotificationChannel(CALLS, "Calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("Incoming voice and video calls");
        calls.setSound(raw(context, "ember_ringtone"), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[] {0, 800, 600, 800, 600});
        calls.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        calls.setBypassDnd(false);
        manager.createNotificationChannel(calls);

        // The old channel had no sound of its own: without it, notifications fall back to "Ember".
        manager.deleteNotificationChannel("ember");
    }
}
