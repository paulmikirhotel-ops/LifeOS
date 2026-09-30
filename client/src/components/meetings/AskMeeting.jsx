import React, { useRef, useState } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { formatApiError } from '../../utils/errors.js';

const SUGGESTIONS = [
  'What decisions were made?',
  'What are the outstanding action items?',
  'What was the main problem discussed?',
  'Who was assigned the database task?',
  'When is the next meeting?',
];

/** "Ask this meeting" — answers come only from this meeting's stored data, with clickable citations. */
export default function AskMeeting({ meetingId, aiReady, onCitation }) {
  const [messages, setMessages] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  const ask = async (question) => {
    const text = (question ?? q).trim();
    if (!text || busy) return;
    setQ('');
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await meetingsApi.ask(meetingId, text, history);
      setMessages((m) => [...m, { role: 'assistant', content: res.data.answer, citations: res.data.citations }]);
    } catch (err) {
      const msg = err?.code === 'AI_NOT_CONFIGURED' ? 'AI is not set up on the server yet.' : formatApiError(err);
      setMessages((m) => [...m, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <Sparkles className="w-4 h-4 text-indigo-500" aria-hidden="true" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ask this meeting</h3>
      </div>

      <div className="p-4 space-y-3 max-h-[26rem] overflow-y-auto" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Answers use only this meeting’s transcript and notes.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" disabled={!aiReady} onClick={() => ask(s)} className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-600 text-white' : m.error ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
              {m.content}
              {m.citations?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.citations.map((c) => (
                    <button key={c.seq} type="button" onClick={() => onCitation?.(c)} title={`${c.speaker}: ${c.text}`} className="rounded-full bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50">
                      {c.clock} · {c.speaker}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking through the meeting…</p>}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2 p-3 border-t border-slate-100 dark:border-slate-800">
        <label className="flex-1">
          <span className="sr-only">Your question</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} disabled={!aiReady} placeholder={aiReady ? 'Ask about this meeting…' : 'AI is not set up on the server'} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-60" />
        </label>
        <Button type="submit" icon={Send} disabled={!q.trim() || busy || !aiReady} aria-label="Send question">Ask</Button>
      </form>
    </div>
  );
}
