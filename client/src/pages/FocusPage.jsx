import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, X, Settings2, Trophy } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Card, Badge, Input, PageHeader, ConfirmDialog } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

export default function FocusPage() {
  const [mode, setMode] = useState('focus'); // focus, short, long
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [customDurations, setCustomDurations] = useState({ focus: 25, short: 5, long: 15 });
  const { addToast } = useToast();
  const timerRef = useRef(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const { data: summary, reload: reloadSummary } = useApi('/focus/sessions/summary');
  const { data: history, reload: reloadHistory } = useApi('/focus/sessions');

  const resetTimer = useCallback((newMode = mode) => {
    setIsActive(false);
    clearInterval(timerRef.current);
    const mins = customDurations[newMode];
    setTimeLeft(mins * 60);
    setMode(newMode);
    setSessionId(null);
  }, [mode, customDurations]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      handleComplete();
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, timeLeft]);

  const handleStart = async () => {
    try {
      const modeTypeMap = { focus: 'focus', short: 'short_break', long: 'long_break' };
      const res = await api.post('/focus/sessions', {
        type: modeTypeMap[mode] || 'focus',
        plannedMinutes: customDurations[mode],
      });
      if (res.success) {
        setSessionId(res.data._id);
        setIsActive(true);
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;
    try {
      await api.patch(`/focus/sessions/${sessionId}`, { action: 'pause' });
      setIsActive(false);
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleResume = async () => {
    if (!sessionId) return;
    try {
      await api.patch(`/focus/sessions/${sessionId}`, { action: 'resume' });
      setIsActive(true);
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleComplete = async () => {
    if (!sessionId) return;
    try {
      await api.patch(`/focus/sessions/${sessionId}`, { action: 'complete' });
      setIsActive(false);
      addToast('Session completed! Well done.');
      reloadSummary();
      reloadHistory();
      resetTimer();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleAbandon = async () => {
    if (!sessionId) return;
    setConfirmAbandon(false);
    try {
      await api.patch(`/focus/sessions/${sessionId}`, { action: 'abandon' });
      setIsActive(false);
      addToast('Session abandoned', 'info');
      reloadSummary();
      reloadHistory();
      resetTimer();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const total = Math.max(1, customDurations[mode] * 60);
  const R = 120;
  const CIRC = 2 * Math.PI * R;
  const remaining = Math.min(1, Math.max(0, timeLeft / total));
  const started = timeLeft < total;
  const historyItems = Array.isArray(history?.items) ? history.items : [];
  const modeLabels = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-10">
      <PageHeader title="Focus Mode" description="Boost your productivity with deep work sessions" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="p-5 sm:p-10 text-center">
            <div className="flex justify-center gap-1.5 p-1 mx-auto w-full max-w-sm rounded-full bg-slate-100 dark:bg-slate-800 mb-8" role="group" aria-label="Session type">
              {['focus', 'short', 'long'].map((m) => (
                <button
                  key={m}
                  disabled={isActive}
                  aria-pressed={mode === m}
                  onClick={() => resetTimer(m)}
                  className={`flex-1 min-h-10 px-3 rounded-full text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 disabled:cursor-not-allowed ${mode === m ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50'}`}
                >
                  {modeLabels[m]}
                </button>
              ))}
            </div>

            <div className="relative mx-auto w-full max-w-[17rem] sm:max-w-[20rem] aspect-square mb-8" role="timer" aria-label={`${modeLabels[mode]} timer`}>
              <svg viewBox="0 0 260 260" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
                <circle cx="130" cy="130" r={R} fill="none" strokeWidth="10" className="stroke-slate-100 dark:stroke-slate-800" />
                <circle
                  cx="130" cy="130" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
                  className={`${isActive ? 'stroke-indigo-500' : 'stroke-indigo-300 dark:stroke-indigo-700'} transition-[stroke-dashoffset] duration-1000 ease-linear`}
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - remaining)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">{formatTime(timeLeft)}</span>
                <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{isActive ? 'In progress' : started ? 'Paused' : 'Ready'}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-center gap-3">
              {!isActive ? (
                started ? (
                  <>
                    <Button size="lg" icon={Play} onClick={handleResume} className="sm:px-10">Resume</Button>
                    <Button size="lg" variant="secondary" icon={X} onClick={() => setConfirmAbandon(true)} className="sm:px-10">Abandon</Button>
                  </>
                ) : (
                  <Button size="lg" icon={Play} onClick={handleStart} className="sm:px-12">Start {modeLabels[mode]}</Button>
                )
              ) : (
                <>
                  <Button size="lg" variant="secondary" icon={Pause} onClick={handlePause} className="sm:px-10">Pause</Button>
                  <Button size="lg" variant="danger" icon={X} onClick={() => setConfirmAbandon(true)} className="sm:px-10">Abandon</Button>
                </>
              )}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" aria-hidden="true" /> Timer Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <Input label="Focus (min)" type="number" inputMode="numeric" min={1} value={customDurations.focus} disabled={isActive}
                onChange={(e) => setCustomDurations({ ...customDurations, focus: parseInt(e.target.value) || 1 })} />
              <Input label="Short break (min)" type="number" inputMode="numeric" min={1} value={customDurations.short} disabled={isActive}
                onChange={(e) => setCustomDurations({ ...customDurations, short: parseInt(e.target.value) || 1 })} />
              <Input label="Long break (min)" type="number" inputMode="numeric" min={1} value={customDurations.long} disabled={isActive}
                onChange={(e) => setCustomDurations({ ...customDurations, long: parseInt(e.target.value) || 1 })} />
            </div>
            {!isActive && <p className="text-xs text-slate-400 mt-4">Changes apply to the next session.</p>}
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card className="p-5 sm:p-6 bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white border-none shadow-lg shadow-indigo-500/20">
            <div className="flex items-center justify-between mb-4">
              <Trophy className="w-8 h-8 opacity-60" aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wider rounded-full bg-white/20 px-2.5 py-1">Daily goal</span>
            </div>
            <p className="text-xs font-semibold opacity-80 uppercase tracking-wider mb-1">Total focus today</p>
            <p className="text-4xl font-black mb-4 tabular-nums">{summary?.totalMinutesToday || 0} <span className="text-sm font-medium opacity-70">mins</span></p>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden" role="progressbar" aria-label="Daily focus goal" aria-valuemin={0} aria-valuemax={120} aria-valuenow={Math.min(summary?.totalMinutesToday || 0, 120)}>
              <div className="h-full bg-white rounded-full transition-[width] duration-700" style={{ width: `${Math.min((summary?.totalMinutesToday || 0) / 120 * 100, 100)}%` }} />
            </div>
            <p className="text-xs mt-2 opacity-70">Target: 2 hours (120 mins)</p>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Recent Sessions</h2>
            {historyItems.length > 0 ? (
              <ul className="max-h-[400px] overflow-y-auto pr-1 divide-y divide-slate-100 dark:divide-slate-800">
                {historyItems.map((session) => (
                  <li key={session._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize truncate">{String(session.type || 'focus').replace(/_/g, ' ')} session</p>
                      <p className="text-xs text-slate-500">{formatDate(session.startTime, 'MMM d')} · {session.durationMin}m</p>
                    </div>
                    <Badge variant={session.status === 'completed' ? 'success' : 'error'} className="text-[10px] capitalize flex-shrink-0">{session.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 text-center py-6">No sessions yet. Start your first one.</p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAbandon}
        title="Abandon this session?"
        description="Your progress for this session won't count toward today's total."
        confirmLabel="Abandon session"
        danger
        onConfirm={handleAbandon}
        onClose={() => setConfirmAbandon(false)}
      />
    </div>
  );
}
