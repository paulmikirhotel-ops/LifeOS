import React, { Suspense, lazy, useState } from 'react';
import { canUse3D } from '../utils/webgl.js';

// The floating 3D spheres load only when a page asks for them AND the device can show them (see utils/webgl.js).
const Orbs = lazy(() => import('./connect/ConnectOrbs.jsx'));

/**
 * The blue gradient page header used across LifeOS (same look as Connect).
 * `actions` sit in a white chip on the right so any button looks right on the blue. `orbs` adds the 3D spheres (use on a few pages only).
 * `compact` is a slim bar for pages that need the room. `live` announces text changes (e.g. a month or a task count) to screen readers.
 */
export default function SiteHero({ title, description, eyebrow, icon: Icon, actions, orbs = false, compact = false, live = false, className = '' }) {
  const [with3d] = useState(() => orbs && canUse3D());
  return (
    <header className={`relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-sky-500 text-white shadow-lg shadow-blue-600/20 dark:from-blue-700 dark:via-blue-700 dark:to-sky-600 ${compact ? 'px-4 py-3.5 sm:px-6' : orbs ? 'px-5 py-7 sm:px-8 sm:py-9' : 'px-5 py-5 sm:px-8 sm:py-6'} ${className}`}>
      <span aria-hidden="true" className="absolute -right-10 -top-12 -z-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
      <span aria-hidden="true" className="absolute -bottom-16 left-1/3 -z-10 h-40 w-40 rounded-full bg-sky-300/20 blur-2xl" />
      {with3d && <Suspense fallback={null}><Orbs className="-z-10" /></Suspense>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/30 backdrop-blur"><Icon className="h-5 w-5" aria-hidden="true" /></span>}
          <div className="min-w-0" aria-live={live ? 'polite' : undefined}>
            {eyebrow && <p className="text-sm font-medium text-white/80">{eyebrow}</p>}
            <h1 className="text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-white/85">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 self-start rounded-2xl bg-white/95 p-1.5 text-slate-900 shadow-md sm:self-auto dark:bg-slate-900/90 dark:text-white">{actions}</div>}
      </div>
    </header>
  );
}
