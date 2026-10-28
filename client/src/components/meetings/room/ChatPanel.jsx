import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Send, Loader2, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

const MAX = 1000;

/** Bottom sheet on phones, right-hand panel on desktop. Messages are shown as plain text only. */
export default function ChatPanel({ messages, myKey, onSend, onClose, sending, error, onClearError }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const stickRef = useRef(true);
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  const submit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    stickRef.current = true;
    const ok = await onSend(text);
    if (ok) { setText(''); inputRef.current?.focus({ preventScroll: true }); }
  };

  return (
    <aside role="dialog" aria-label="Meeting chat"
      className="panel-in fixed inset-x-0 bottom-0 z-40 flex h-[70dvh] max-h-[70dvh] flex-col rounded-t-3xl border border-white/10 bg-slate-900 text-white shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:max-h-none lg:w-96 lg:rounded-none">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><MessageCircle className="h-4 w-4 text-sky-300" aria-hidden="true" /> Chat</h2>
        <button type="button" onClick={onClose} aria-label="Close chat" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><X className="h-5 w-5" /></button>
      </div>

      <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-slate-400">No messages yet. Say hello to the room. Everyone in the meeting can read the chat.</p>
        ) : messages.map((m) => {
          const mine = m.key === myKey;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <p className="mb-0.5 text-[11px] text-slate-400">{mine ? 'You' : m.name} · {format(new Date(m.at), 'h:mm a')}</p>
              <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md bg-white/10 text-slate-100'}`}>{m.text}</p>
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="mx-4 mb-1 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-100" onClick={onClearError}>{error}</p>}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-white/10 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <label htmlFor="room-chat-input" className="sr-only">Message</label>
        <textarea id="room-chat-input" ref={inputRef} value={text} rows={1} maxLength={MAX} placeholder="Type a message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-white/15 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400" />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-slate-950 transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </aside>
  );
}
