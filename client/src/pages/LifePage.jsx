import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Scale, BookOpen, Archive } from 'lucide-react';
import BalanceTab from '../components/life/BalanceTab.jsx';
import KnowledgeTab from '../components/life/KnowledgeTab.jsx';
import BackupTab from '../components/life/BackupTab.jsx';

const TABS = [
  { key: 'balance', label: 'Balance', icon: Scale, Comp: BalanceTab },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen, Comp: KnowledgeTab },
  { key: 'backup', label: 'Backup', icon: Archive, Comp: BackupTab },
];

export default function LifePage() {
  const [params, setParams] = useSearchParams();
  const current = TABS.find((t) => t.key === params.get('tab')) || TABS[0];
  const { Comp } = current;
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My life</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Where your time goes, what you have learned, and a copy of your data. Everything here is private to you.</p>
      </header>
      <div role="tablist" aria-label="My life sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.key === current.key;
          return (
            <button
              key={t.key} role="tab" type="button" aria-selected={active}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />{t.label}
            </button>
          );
        })}
      </div>
      <Comp />
    </div>
  );
}
