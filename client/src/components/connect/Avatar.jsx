import React from 'react';
import { useGroupAvatar } from '../../hooks/useBlobUrl.js';

const TONES = ['bg-blue-600', 'bg-sky-600', 'bg-indigo-600', 'bg-cyan-600', 'bg-blue-700', 'bg-sky-700'];
const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-xl' };

function hash(s) { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

/** Profile picture, or coloured initials when there is none. `online` adds a presence dot. */
export default function Avatar({ name = '?', src: rawSrc, size = 'md', online, group = false, className = '' }) {
  const src = useGroupAvatar(rawSrc);
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {src
        ? <img src={src} alt="" className={`${SIZES[size]} ${group ? 'rounded-2xl' : 'rounded-full'} object-cover`} />
        : <span aria-hidden="true" className={`${SIZES[size]} ${TONES[hash(name) % TONES.length]} ${group ? 'rounded-2xl' : 'rounded-full'} inline-flex items-center justify-center font-bold text-white`}>{initials}</span>}
      {online !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
          <span className="sr-only">{online ? 'Online' : 'Offline'}</span>
        </span>
      )}
    </span>
  );
}
