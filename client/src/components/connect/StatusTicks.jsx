import React from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';

/** Message state: sending (clock), sent (one tick), delivered (two grey), read (two blue). */
export default function StatusTicks({ status }) {
  const cls = 'h-3.5 w-3.5';
  if (status === 'sending') return <Clock className={`${cls} text-slate-400`} aria-label="Sending" />;
  if (status === 'read') return <CheckCheck className={`${cls} text-sky-500`} aria-label="Read" />;
  if (status === 'delivered') return <CheckCheck className={`${cls} text-slate-400`} aria-label="Delivered" />;
  return <Check className={`${cls} text-slate-400`} aria-label="Sent" />;
}
