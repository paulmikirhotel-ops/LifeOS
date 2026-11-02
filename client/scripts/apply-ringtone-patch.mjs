#!/usr/bin/env node
/**
 * Run from the client folder (safe to run again):   node scripts/apply-ringtone-patch.mjs
 * Changes android/app/src/main/java/.../MainActivity.java only: when the app starts it creates the "Calls" alert channel
 * that uses the phone's own ringtone (and its ring volume), vibrates and shows on the lock screen.
 * (Android fixes a channel's sound when it is first created, so this uses a new channel name, calls_ring.)
 * Prints "patched", "nothing to do" or "WARNING".
 */
import fs from 'node:fs';
import path from 'node:path';

function find(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = find(full); if (hit) return hit; } else if (e.name === 'MainActivity.java') return full;
  }
  return null;
}
const file = find(path.resolve('android', 'app', 'src', 'main', 'java'));
if (!file) { console.warn('WARNING: MainActivity.java not found. Run this inside the client folder.'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');
if (src.includes('calls_ring')) { console.log('MainActivity.java: nothing to do'); process.exit(0); }
const anchor = /^([ \t]*)public class MainActivity extends BridgeActivity \{\r?\n/m;
if (!anchor.test(src)) { console.warn('WARNING: MainActivity.java: could not find "public class MainActivity extends BridgeActivity {". Nothing was changed. Send me the file.'); process.exit(1); }
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const add = `  @Override
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

`.replace(/\n/g, nl);
fs.writeFileSync(file, src.replace(anchor, (m) => m + add));
console.log('MainActivity.java: patched');
