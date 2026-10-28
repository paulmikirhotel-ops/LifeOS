import React, { useEffect, useId, useRef } from 'react';
import { Loader2, X, AlertCircle } from 'lucide-react';
import { useCountUp } from '../hooks/useCountUp.js';

/* ──────────────────────────────────────────────────────────────────────────────────────────────────
   LifeOS UI kit. Every page builds on these, so improving one here improves the whole app.
   Tokens (colours, shadows, motion) live in src/index.css; see docs/DESIGN-SYSTEM.md.
   Rules of thumb: controls are 40px tall (44px on phones), cards use rounded-2xl, motion is short and
   subtle, and everything keeps a visible keyboard focus.
   ────────────────────────────────────────────────────────────────────────────────────────────────── */

// ── Button ──────────────────────────────────────────────────────────────────────────────────────────
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  icon: Icon,
  disabled,
  type = 'button', // never submit a surrounding form by accident; submit buttons say type="submit"
  ...props
}) {
  const base =
    'ui-radius-control inline-flex items-center justify-center gap-2 font-semibold select-none whitespace-nowrap ' +
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out ' +
    'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

  const variants = {
    primary:
      'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-600/25 ' +
      'hover:from-indigo-500 hover:to-indigo-700 hover:shadow-md hover:shadow-indigo-600/30 focus-visible:ring-indigo-500',
    secondary:
      'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-slate-400 ' +
      'dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:border-slate-600',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400 dark:text-slate-400 dark:hover:bg-slate-800',
    soft: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 focus-visible:ring-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25',
    danger: 'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700 hover:shadow-md focus-visible:ring-red-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs min-h-[32px] max-sm:min-h-[40px]',
    md: 'px-4 py-2 text-sm min-h-[40px] max-sm:min-h-[44px]',
    lg: 'px-6 py-3 text-base min-h-[48px]',
  };

  return (
    <button
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      type={type}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      {children}
    </button>
  );
}

// ── Page furniture ──────────────────────────────────────────────────────────────────────────────────
/** Consistent page title row. `actions` sit on the right on wide screens and stack below the title on phones. */
export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <header className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Icon-only button with a 44px touch target on phones. `label` is required: it is the accessible name and tooltip. */
export function IconButton({ icon: Icon, label, tone = 'default', className = '', ...props }) {
  const tones = {
    default: 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-300 dark:hover:bg-indigo-500/10',
    danger: 'text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10',
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${tones[tone] || tones.default} ${className}`}
      {...props}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

// ── Form controls ───────────────────────────────────────────────────────────────────────────────────
const fieldBase =
  'ui-radius-control w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border text-sm text-slate-900 dark:text-white ' +
  'placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed';

const fieldBorder = (error) => (error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/25' : 'border-slate-200 dark:border-slate-700');

function Field({ label, error, className, id, children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ label, error, className = '', id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} error={error} className={className} id={fid}>
      <input id={fid} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-error` : undefined} className={`${fieldBase} ${fieldBorder(error)}`} {...props} />
    </Field>
  );
}

export function Select({ label, error, options = [], className = '', id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} error={error} className={className} id={fid}>
      <select id={fid} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-error` : undefined} className={`${fieldBase} ${fieldBorder(error)}`} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Textarea({ label, error, className = '', id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} error={error} className={className} id={fid}>
      <textarea id={fid} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-error` : undefined} className={`${fieldBase} ${fieldBorder(error)} min-h-[100px]`} {...props} />
    </Field>
  );
}

// ── Feedback ────────────────────────────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };
  return <Loader2 role="status" aria-label="Loading" className={`animate-spin text-indigo-600 ${sizes[size]} ${className}`} />;
}

export function Badge({ children, variant = 'info', className = '' }) {
  const variants = {
    info: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    error: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    brand: 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant] || variants.info} ${className}`}>
      {children}
    </span>
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────────────────────────────
/** `interactive` adds a gentle lift on hover for cards that are clickable. Extra props (onClick, role, ...) pass through. */
export function Card({ children, className = '', interactive = false, ...props }) {
  return (
    <div
      className={`ui-radius-card bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm ${
        interactive ? 'transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// Several modals can be open at once (confirm over a form); only the last one closing may release the page scroll.
let scrollLocks = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Dialog. Opens with a soft animation, closes with Esc or a backdrop click, keeps keyboard focus inside while
 * open and puts it back where it was on close. Put `data-autofocus` on a field to focus it on open.
 */
export function Modal({ isOpen, onClose, title, children, className = '' }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose; // callers pass inline arrows: keep the effect below from restarting on every render

  useEffect(() => {
    if (!isOpen) return undefined;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;
    scrollLocks += 1;
    document.body.style.overflow = 'hidden';

    // Focus the requested field, otherwise the dialog itself (no surprise on-screen keyboard on phones).
    (panel?.querySelector('[data-autofocus]') || panel)?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = '';
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="modal-backdrop fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`modal-panel relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto focus:outline-none ${className}`}
      >
        {/* Drag handle hint (mobile sheets) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 pointer-events-none" aria-hidden="true">
          <span className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
          <h2 id={titleId} className="text-lg font-bold dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6">{children}</div>
      </div>
    </div>
  );
}

// ── Empty / error / loading states ─────────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="animate-fade-up flex flex-col items-center justify-center py-12 px-4 text-center">
      {Icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-fuchsia-50 text-indigo-500 ring-1 ring-indigo-100 dark:from-indigo-500/10 dark:to-fuchsia-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
          <Icon className="w-8 h-8" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Replaces window.confirm: <ConfirmDialog open={!!x} title="Delete habit?" description="..." confirmLabel="Delete"
 * danger onConfirm={() => ...} onClose={() => setX(null)} />. `busy` shows a spinner on the confirm button.
 */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false, onConfirm, onClose }) {
  return (
    <Modal isOpen={open} onClose={onClose} title={title}>
      {description && <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{description}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} data-autofocus>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/**
 * Friendly failure panel. Never show raw errors to people: pass a plain-language description, keep the technical
 * message in `details` (shown only while developing) and log the real error to the console where it is caught.
 */
export function ErrorState({ title = 'Something went wrong', description = "We couldn't load this right now. Please try again.", onRetry, retryLabel = 'Try again', details, compact = false, className = '' }) {
  return (
    <div role="alert" className={`animate-fade-up flex flex-col items-center justify-center text-center px-4 ${compact ? 'py-6' : 'py-12'} ${className}`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20">
        <AlertCircle className="w-7 h-7" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-sm">{description}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
      {details && import.meta.env.DEV && (
        <details className="mt-4 max-w-md text-left text-xs text-slate-400">
          <summary className="cursor-pointer">Developer details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{String(details)}</pre>
        </details>
      )}
    </div>
  );
}

/** A grey placeholder block. Size it with classes, e.g. <Skeleton className="h-4 w-1/3" />. */
export function Skeleton({ className = '', ...props }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} {...props} />;
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <Card className={`p-5 ${className}`} role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-3 mb-4" aria-hidden="true">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <SkeletonText lines={lines} />
    </Card>
  );
}

export function SkeletonList({ rows = 4, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="p-4 flex items-center gap-3" aria-hidden="true">
          <Skeleton className="h-5 w-5 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Numbers & progress ─────────────────────────────────────────────────────────────────────────────
/** Counts up to `value` (and between later values). Screen readers get the final number, not the animation. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString(), duration = 700, className = '' }) {
  const shown = useCountUp(value, { duration });
  if (!Number.isFinite(Number(value))) return <span className={className}>{value}</span>;
  return (
    <span className={`tabular-nums ${className}`}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(Number(value))}</span>
    </span>
  );
}

const PROGRESS_COLORS = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
};

/** Animated progress bar. The width glides to the new value. */
export function ProgressBar({ value = 0, max = 100, color = 'indigo', label, className = '' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${className}`}
    >
      <div className={`h-full rounded-full ${PROGRESS_COLORS[color] || PROGRESS_COLORS.indigo} transition-[width] duration-700 ease-out-expo`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatCard({ title, value, icon: Icon, trend, trendValue, color = 'indigo', loading = false, animate = false }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
  };

  if (loading) {
    return (
      <Card className="p-4 sm:p-6" role="status" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl mb-4" />
        <Skeleton className="h-3 w-1/2 mb-2" />
        <Skeleton className="h-6 w-1/3" />
      </Card>
    );
  }

  return (
    <Card interactive className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className={`p-2.5 sm:p-3 rounded-xl ${colors[color] || colors.indigo}`}>{Icon && <Icon className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />}</div>
        {trend && (
          <div className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend === 'up' ? '↑' : '↓'} {trendValue}%
          </div>
        )}
      </div>
      <h3 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 truncate">{title}</h3>
      <p className="text-xl sm:text-2xl font-bold tracking-tight dark:text-white mt-0.5 sm:mt-1 truncate">
        {animate && typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </p>
    </Card>
  );
}
