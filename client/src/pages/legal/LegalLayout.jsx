import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { LEGAL } from './legalConfig.js';

const tabs = [
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/help', label: 'Help' },
];

/** Shared public shell for Privacy / Terms / Help. Works signed in or out. */
export default function LegalLayout({ title, intro, active, children }) {
  useEffect(() => {
    document.title = `${title} · ${LEGAL.appName}`;
  }, [title]);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" aria-label={`${LEGAL.appName} home`}>
            <Logo size={30} />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-semibold" aria-label="Legal pages">
            {tabs.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active === t.to ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  active === t.to
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {intro && <p className="mt-3 text-slate-600 dark:text-slate-400">{intro}</p>}
        <p className="mt-2 text-xs text-slate-400">Last updated: {LEGAL.lastUpdated}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-xs text-slate-400">
        © {new Date().getFullYear()} {LEGAL.owner}. Questions? <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
      </footer>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}

export function Bullets({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
