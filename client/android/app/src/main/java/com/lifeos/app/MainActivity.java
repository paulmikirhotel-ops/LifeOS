package com.lifeos.app;

import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(android.os.Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    createCallChannel();
  }

  /** Incoming-call alerts use the phone's own ringtone, vibrate, and show on the lock screen. */
  private void createCallChannel() {
    if (android.os.Build.VERSION.SDK_INT < 26) return;
    android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
    if (nm == null || nm.getNotificationChannel("calls_ring") != null) return;
    android.app.NotificationChannel ch = new android.app.NotificationChannel("calls_ring", "Calls", android.app.NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("Incoming LifeOS calls");
    ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
    ch.enableVibration(true);
    ch.setVibrationPattern(new long[] {0, 800, 400, 800, 400, 800});
    android.media.AudioAttributes attrs = new android.media.AudioAttributes.Builder()
        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
    ch.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE), attrs);
    nm.createNotificationChannel(ch);
  }

  @Override
  public void onStart() {
    super.onStart();
    // The site (Netlify) and the API (Render) have different addresses, so the login cookie counts as a
    // third-party cookie. Allow it explicitly so signing in works inside the app.
    WebView webView = getBridge().getWebView();
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(webView, true);
  }
}
