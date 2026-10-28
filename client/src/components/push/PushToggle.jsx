import React, { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button, Card } from '../ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getState, enable, disable, sendTest } from '../../push/pushClient.js';

const NOTE = {
  unsupported: 'This browser cannot show alerts. On iPhone, install LifeOS to your Home Screen first (Safari, iOS 16.4 or newer).',
  dev: 'Alerts work in the deployed site (or a production build), not in the development server.',
  'server-off': 'Alerts are not switched on for this server yet. The site owner needs to add the VAPID keys.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.',
};

/** Settings > Notifications: turn phone/computer alerts on or off for THIS device. */
export default function PushToggle() {
  const { addToast } = useToast();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => getState().then(setState).catch(() => setState({ status: 'server-off' }));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      if (ok) addToast(ok);
    } catch (e) {
      addToast(e?.message || 'Something went wrong', 'error');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const s = state?.status;
  return (
    <Card className="p-6 sm:p-8 space-y-4">
      <div className="flex items-start gap-3">
        <BellRing className="w-5 h-5 mt-0.5 text-blue-600 shrink-0" />
        <div className="min-w-0">
          <h3 className="text-lg font-bold dark:text-white">Alerts on this device</h3>
          <p className="text-sm text-slate-500">Get new messages, incoming calls and reminders even when LifeOS is closed. Turned off automatically when you sign out.</p>
        </div>
      </div>
      {s === null && <p className="text-sm text-slate-400">Checking…</p>}
      {NOTE[s] && <p className="text-sm text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">{NOTE[s]}</p>}
      {s === 'off' && (
        <Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" loading={busy} onClick={() => run(enable, 'Alerts are on for this device')}>
          Turn on alerts
        </Button>
      )}
      {s === 'on' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={busy} onClick={() => run(sendTest, 'Test alert sent')}>Send a test alert</Button>
          <Button size="sm" variant="outline" loading={busy} onClick={() => run(disable, 'Alerts are off for this device')}>Turn off</Button>
        </div>
      )}
    </Card>
  );
}
