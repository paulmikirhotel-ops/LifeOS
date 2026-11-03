import React, { useEffect, useRef, useState } from 'react';
import { Bluetooth, Headphones, Smartphone, Volume2 } from 'lucide-react';
import { needsMenu, nextRoute, routeDescription, routeLabel } from './audioRoute.js';

const ICONS = { speaker: Volume2, earpiece: Smartphone, bluetooth: Bluetooth, headset: Headphones };

/**
 * The sound-output button for a call: shows where the sound is going (Speaker, Phone, Bluetooth, Headset).
 * A tap switches between speaker and phone; when Bluetooth or a headset is connected it opens a short list.
 * variant "round" matches the call screen buttons, "bar" matches the meeting room bar.
 */
export default function AudioRouteControl({ audio, variant = 'round' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const { route, available, bluetoothName, setRoute } = audio;
  const Icon = ICONS[route] || Volume2;
  const on = route === 'speaker' || route === 'bluetooth' || route === 'headset';

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const press = () => {
    if (needsMenu(available)) setOpen((o) => !o);
    else setRoute(nextRoute(route, available));
  };
  const choose = (r) => { setOpen(false); setRoute(r); };

  const round = variant === 'round';
  const wrap = round ? 'w-[4.5rem] gap-1.5' : 'w-14 gap-1 sm:w-16';
  const size = round ? 'h-14 w-14' : 'h-12 w-12 sm:h-14 sm:w-14';
  const tone = on ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-white/15 text-white hover:bg-white/25';
  const cap = round ? 'text-xs font-medium text-white/80' : 'text-[11px] font-semibold leading-none text-slate-300';

  return (
    <div ref={box} className={`relative flex shrink-0 flex-col items-center ${wrap}`}>
      <button
        type="button"
        onClick={press}
        aria-label={`Sound output: ${routeDescription(route, bluetoothName)}. Tap to change`}
        aria-haspopup={needsMenu(available) ? 'menu' : undefined}
        aria-expanded={needsMenu(available) ? open : undefined}
        className={`flex items-center justify-center rounded-full shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 active:scale-90 ${size} ${tone}`}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </button>
      <span className={`max-w-full truncate ${cap}`}>{routeLabel(route)}</span>
      {open && (
        <ul role="menu" aria-label="Sound output" className="absolute bottom-full z-50 mb-2 w-48 rounded-2xl bg-slate-900 p-1 text-left shadow-2xl ring-1 ring-white/15">
          {available.map((r) => {
            const Ico = ICONS[r] || Volume2;
            return (
              <li key={r} role="none">
                <button type="button" role="menuitemradio" aria-checked={r === route} onClick={() => choose(r)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white hover:bg-white/10 ${r === route ? 'bg-white/15' : ''}`}>
                  <Ico className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{routeDescription(r, bluetoothName)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
