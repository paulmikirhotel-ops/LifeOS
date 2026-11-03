import { useCallback, useEffect, useState } from 'react';
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './push.js';
import { normalizeState } from './audioRoute.js';

let plugin;
const getPlugin = () => { if (!plugin) plugin = registerPlugin('AudioRoute'); return plugin; };

/**
 * Inside the Android app only. While `active` (a call is connected) the sound goes to the loudspeaker, or to Bluetooth / a headset
 * when one is connected, and follows Bluetooth or a headset being connected or removed. Everywhere else, or with an older app
 * that does not have the native part yet, `supported` stays false and nothing is shown.
 */
export function useAudioRoute(active) {
  const [state, setState] = useState(null);
  const native = isNativeApp();

  useEffect(() => {
    if (!native || !active) return undefined;
    let stopped = false;
    let handle;
    (async () => {
      try {
        const p = getPlugin();
        handle = await p.addListener('routeChanged', (s) => { if (!stopped) setState(normalizeState(s)); });
        const s = await p.start();
        if (!stopped && s && s.route) setState(normalizeState(s));
      } catch { /* the app was built without the audio piece: no button, the call still works */ }
    })();
    return () => {
      stopped = true;
      try { handle?.remove?.(); } catch { /* ignore */ }
      Promise.resolve().then(() => getPlugin().stop()).catch(() => {});
      setState(null);
    };
  }, [native, active]);

  const setRoute = useCallback(async (route) => {
    try { setState(normalizeState(await getPlugin().setRoute({ route }))); } catch { /* keep the old route */ }
  }, []);

  return { supported: native && Boolean(state), route: state?.route || 'speaker', available: state?.available || [], bluetoothName: state?.bluetoothName || '', setRoute };
}
