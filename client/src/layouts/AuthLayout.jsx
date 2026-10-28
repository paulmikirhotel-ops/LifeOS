import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { CheckCircle2, CalendarDays, Target, Flame } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import Watermark from '../components/Watermark.jsx';
import './authHero.css';

// Only the sign-in and sign-up screens get the picture; password reset, verify and invite screens stay compact.
const HERO_PATHS = new Set(['/login', '/register']);

const HEADLINE = 'Your Life, Organized.';
const HEADLINE_2 = 'Your Future, Empowered.';
const CHIPS = [
  { icon: CheckCircle2, label: 'Tasks' },
  { icon: CalendarDays, label: 'Calendar' },
  { icon: Target, label: 'Goals' },
  { icon: Flame, label: 'Habits' },
];

/**
 * The brand picture. One <img> serves both layouts: a smaller file is chosen on phones (srcSet) and the original
 * full-size file on large screens, so nothing is cropped or recompressed on desktop. If it fails to load, the
 * wrapper simply collapses and the form keeps working.
 */
function HeroImage({ className = '', sizes }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src="/auth-hero.jpg"
      srcSet="/auth-hero-768.jpg 768w, /auth-hero.jpg 1280w"
      sizes={sizes}
      width={1280}
      height={853}
      alt="LifeOS — your personal digital life manager. Plan today, build tomorrow."
      decoding="async"
      fetchPriority="high"
      draggable="false"
      data-ready={ready}
      onLoad={() => setReady(true)}
      onError={() => setFailed(true)}
      className={`auth-img block w-full h-auto ${className}`}
    />
  );
}

export default function AuthLayout() {
  const { pathname } = useLocation();
  const hero = HERO_PATHS.has(pathname.replace(/\/+$/, ''));

  if (!hero) {
    return (
      <div className="relative isolate min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center justify-center px-4 py-8 sm:px-6 safe-bottom">
        <Watermark />
        <div className="mb-6 sm:mb-8 flex items-center gap-3">
          <Logo size={48} showText={false} />
          <div>
            <p className="text-xl sm:text-2xl font-black tracking-tight dark:text-white">LifeOS</p>
            <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Your Personal Digital Life Manager</p>
          </div>
        </div>
        <main className="page-enter w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          <Outlet />
        </main>
        <Legal />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      {/* ── Brand panel (large screens): the full picture, uncropped, with the motivational line ── */}
      <aside className="relative hidden lg:flex flex-col items-center justify-center overflow-hidden px-10 xl:px-16 py-12 bg-gradient-to-br from-sky-100 via-white to-indigo-100 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950">
        <div aria-hidden="true" className="auth-glow absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-sky-300/40 dark:bg-sky-500/15 blur-3xl" />
        <div aria-hidden="true" className="auth-glow absolute -bottom-40 -right-20 w-[30rem] h-[30rem] rounded-full bg-amber-200/50 dark:bg-amber-400/10 blur-3xl" style={{ animationDelay: '-4s' }} />

        <div className="relative w-full max-w-[44rem]">
          <figure className="auth-rise auth-float overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-sky-900/15 ring-1 ring-slate-900/5 dark:ring-white/10 dark:shadow-black/50 aspect-[1280/853]">
            <HeroImage sizes="(min-width: 1536px) 704px, (min-width: 1024px) 50vw, 100vw" />
          </figure>

          <div className="mt-9 text-center">
            <h2 className="auth-rise auth-rise-2 text-3xl xl:text-4xl font-black tracking-tight leading-tight text-slate-900 dark:text-white">
              {HEADLINE}{' '}
              <span className="block bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-sky-300 dark:to-indigo-300 bg-clip-text text-transparent">{HEADLINE_2}</span>
            </h2>
            <p className="auth-rise auth-rise-3 mt-3 text-base text-slate-600 dark:text-slate-300">Stay organized, focused and in control of your life — all in one place.</p>
            <ul className="auth-rise auth-rise-4 mt-6 flex flex-wrap justify-center gap-2.5" aria-label="What LifeOS helps you manage">
              {CHIPS.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-100 ring-1 ring-slate-900/5 dark:ring-white/10 backdrop-blur">
                  <Icon className="w-4 h-4 text-blue-600 dark:text-sky-300" aria-hidden="true" /> {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* ── Form column ── */}
      <div className="relative flex flex-col items-center justify-center px-4 py-5 sm:px-6 sm:py-8 safe-bottom min-h-screen">
        <Watermark />

        {/* Phones and tablets: a slim banner, so the form is still the first thing you can use. */}
        <figure className="auth-rise lg:hidden w-full max-w-md mb-5 overflow-hidden rounded-2xl bg-white shadow-lg shadow-sky-900/10 ring-1 ring-slate-900/5 dark:ring-white/10 aspect-[16/9] sm:aspect-[16/8]">
          <HeroImage sizes="(min-width: 448px) 448px, 100vw" className="h-full object-cover object-[50%_40%]" />
        </figure>
        <p className="auth-rise auth-rise-2 lg:hidden -mt-1 mb-5 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
          {HEADLINE} <span className="text-blue-600 dark:text-sky-300">{HEADLINE_2}</span>
        </p>

        <div className="hidden lg:flex mb-6 items-center gap-3 auth-rise">
          <Logo size={44} showText={false} />
          <div>
            <p className="text-xl font-black tracking-tight dark:text-white">LifeOS</p>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Your Personal Digital Life Manager</p>
          </div>
        </div>
        <h1 className="sr-only lg:hidden">LifeOS — your personal digital life manager</h1>

        <main className="auth-rise auth-rise-2 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 dark:shadow-none">
          <Outlet />
        </main>
        <Legal />
      </div>
    </div>
  );
}

function Legal() {
  return (
    <nav aria-label="Legal" className="mt-4 sm:mt-6 flex items-center gap-5 text-xs font-medium text-slate-400">
      <Link to="/privacy" className="inline-flex items-center min-h-10 px-1 hover:text-indigo-500 transition-colors">Privacy</Link>
      <Link to="/terms" className="inline-flex items-center min-h-10 px-1 hover:text-indigo-500 transition-colors">Terms</Link>
      <Link to="/help" className="inline-flex items-center min-h-10 px-1 hover:text-indigo-500 transition-colors">Help</Link>
    </nav>
  );
}
