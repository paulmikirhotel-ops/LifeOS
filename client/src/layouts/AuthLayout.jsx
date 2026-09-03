import React from 'react';
import { Outlet, Link } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col items-center justify-center px-4 py-6 sm:px-6 safe-bottom">
      <div className="mb-6 sm:mb-8 flex items-center gap-3">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-xl sm:text-2xl shadow-lg shadow-indigo-500/20">
          L
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight dark:text-white">LifeOS</h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Master your digital universe</p>
        </div>
      </div>
      
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
        <Outlet />
      </div>

      <div className="mt-6 sm:mt-8 flex items-center gap-6 text-xs font-medium text-slate-400">
        <Link to="#" className="hover:text-indigo-500 transition-colors">Privacy</Link>
        <Link to="#" className="hover:text-indigo-500 transition-colors">Terms</Link>
        <Link to="#" className="hover:text-indigo-500 transition-colors">Help</Link>
      </div>
    </div>
  );
}
