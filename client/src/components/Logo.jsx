import React from 'react';

/** The LifeOS mark (blue "L" with leaf and sun). Sits on its own dark tile so it reads in light and dark themes. */
export function LogoMark({ size = 32, className = '' }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 rounded-xl bg-black object-cover ring-1 ring-black/10 dark:ring-white/10 ${className}`}
      style={{ width: size, height: size }}
      draggable="false"
    />
  );
}

/** Mark + wordmark for headers. `showText` false = icon only (collapsed sidebar). */
export default function Logo({ size = 32, showText = true, className = '', textClassName = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && <span className={`font-black tracking-tight text-slate-900 dark:text-white ${textClassName || 'text-xl'}`}>LifeOS</span>}
    </span>
  );
}
