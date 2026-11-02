import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { CALL_CHANNEL, isNativeApp, targetFromNotification } from '../native/push.js';

/**
 * Inside the Android app only: asks permission for notifications, registers this phone with Google's push service,
 * tells the server (so it can ring this phone when someone calls), and opens Connect when a call alert is tapped.
 * In a normal browser this does nothing at all.
 */
export function useNativePush(user) {
  const navigate = useNavigate();
  const userId = user?._id || user?.id;
  useEffect(() => {
    if (!userId || !isNativeApp()) return undefined;
    let stopped = false;
    const handles = [];
    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.requestPermissions();
        if (stopped || perm.receive !== 'granted') return;
        await PushNotifications.createChannel(CALL_CHANNEL);
        handles.push(await PushNotifications.addListener('registration', async (t) => {
          try { await api.post('/auth/link/push-token', { token: t.value }); } catch { /* tried again next time the app opens */ }
        }));
        handles.push(await PushNotifications.addListener('registrationError', () => {}));
        handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (a) => navigate(targetFromNotification(a?.notification?.data))));
        await PushNotifications.register();
      } catch { /* the plugin is missing: the app still works, it just cannot ring when closed */ }
    })();
    return () => { stopped = true; handles.forEach((h) => h?.remove?.()); };
  }, [userId, navigate]);
}
