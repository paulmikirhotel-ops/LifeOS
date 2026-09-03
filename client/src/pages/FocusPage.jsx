import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, X, 
  CheckCircle2, Clock, Calendar, Zap,
  Settings2, Trophy
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { 
  Button, Card, Badge, Spinner, 
  EmptyState, Input, StatCard 
} from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

export default function FocusPage() {
  const [mode, setMode] = useState('focus'); // focus, short, long
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [customDurations, setCustomDurations] = useState({ focus: 25, short: 5, long: 15 });
  const { addToast } = useToast();
  const timerRef = useRef(null);

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
    if (!confirm('Abandon this session?')) return;
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Focus Mode</h1>
          <p className="text-sm text-slate-500 font-medium">Boost your productivity with deep work sessions</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Timer UI */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-8 md:p-12 text-center relative overflow-hidden">
            {/* Background Accent */}
            <div className={`absolute top-0 left-0 w-full h-1 transition-all duration-1000 ${isActive ? 'bg-indigo-600' : 'bg-slate-200'}`} style={{ width: `${(timeLeft / (customDurations[mode] * 60)) * 100}%` }} />
            
            <div className="flex justify-center gap-2 mb-10">
              {['focus', 'short', 'long'].map((m) => (
                <button
                  key={m}
                  disabled={isActive}
                  onClick={() => resetTimer(m)}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 disabled:opacity-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="mb-10 min-w-0">
              <span className="text-7xl sm:text-8xl md:text-9xl font-black tabular-nums dark:text-white transition-all tracking-tighter block truncate">
                {formatTime(timeLeft)}
              </span>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              {!isActive ? (
                timeLeft < customDurations[mode] * 60 ? (
                  <>
                    <Button size="lg" icon={Play} onClick={handleResume} className="px-10 rounded-2xl shadow-lg shadow-indigo-500/20">Resume</Button>
                    <Button size="lg" variant="secondary" icon={X} onClick={handleAbandon} className="px-10 rounded-2xl">Abandon</Button>
                  </>
                ) : (
                  <Button size="lg" icon={Play} onClick={handleStart} className="px-12 rounded-2xl shadow-lg shadow-indigo-500/20">Start Focus</Button>
                )
              ) : (
                <>
                  <Button size="lg" variant="secondary" icon={Pause} onClick={handlePause} className="px-10 rounded-2xl">Pause</Button>
                  <Button size="lg" variant="danger" icon={X} onClick={handleAbandon} className="px-10 rounded-2xl shadow-lg shadow-red-500/20">Abandon</Button>
                </>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold dark:text-white mb-6 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" /> Timer Settings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Input 
                label="Focus (min)" 
                type="number" 
                value={customDurations.focus} 
                disabled={isActive}
                onChange={(e) => setCustomDurations({ ...customDurations, focus: parseInt(e.target.value) || 1 })} 
              />
              <Input 
                label="Short (min)" 
                type="number" 
                value={customDurations.short} 
                disabled={isActive}
                onChange={(e) => setCustomDurations({ ...customDurations, short: parseInt(e.target.value) || 1 })} 
              />
              <Input 
                label="Long (min)" 
                type="number" 
                value={customDurations.long} 
                disabled={isActive}
                onChange={(e) => setCustomDurations({ ...customDurations, long: parseInt(e.target.value) || 1 })} 
              />
            </div>
            {!isActive && <p className="text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-widest">Changes will apply after current session</p>}
          </Card>
        </div>

        {/* Stats & History */}
        <div className="space-y-6">
          <Card className="p-6 bg-indigo-600 text-white border-none shadow-xl shadow-indigo-500/20">
            <div className="flex items-center justify-between mb-4">
              <Trophy className="w-8 h-8 opacity-50" />
              <Badge variant="warning" className="bg-white/20 border-white/30 text-white">Daily Goal</Badge>
            </div>
            <p className="text-sm font-bold opacity-80 uppercase tracking-widest mb-1">Total Focus Today</p>
            <h3 className="text-4xl font-black mb-4">{summary?.totalMinutesToday || 0} <span className="text-sm font-medium opacity-60">mins</span></h3>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all duration-1000" style={{ width: `${Math.min((summary?.totalMinutesToday || 0) / 120 * 100, 100)}%` }} />
            </div>
            <p className="text-[10px] mt-2 opacity-60">Target: 2 hours (120 mins)</p>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold dark:text-white mb-4">Recent Sessions</h3>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {history?.items?.length > 0 ? (
                history.items.map((session) => (
                  <div key={session._id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0">
                    <div>
                      <p className="text-sm font-bold dark:text-white capitalize">{session.type} Session</p>
                      <p className="text-[10px] text-slate-500 font-medium uppercase">{formatDate(session.startTime, 'MMM d')} • {session.durationMin}m</p>
                    </div>
                    <Badge variant={session.status === 'completed' ? 'success' : 'error'} className="text-[8px]">
                      {session.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 text-center py-6">No sessions yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
