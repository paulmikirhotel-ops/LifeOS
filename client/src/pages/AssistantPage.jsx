import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Plus, Trash2, AlertCircle, ShieldCheck } from 'lucide-react';
import { assistantApi } from '../api/assistant.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatApiError } from '../utils/errors.js';
import { Button, Card, Badge, Spinner, Select } from '../components/ui.jsx';

const SUGGESTIONS = ['What is due this week?', 'Add a task for tomorrow', 'Which habits have I not done today?', 'How much did I spend this month?'];

export default function AssistantPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [aiOn, setAiOn] = useState(true);
  const [usage, setUsage] = useState({ used: 0, limit: 20, left: 20 });
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef(null);

  const loadChats = useCallback(async () => {
    const res = await assistantApi.chats();
    setChats(res.data.items);
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [s] = await Promise.all([assistantApi.status(), loadChats()]);
      setAiOn(s.data.aiConfigured);
      setUsage(s.data.usage);
    } catch (err) {
      setLoadError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [loadChats]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const openChat = async (id) => {
    if (!id) {
      setChatId(null);
      setMessages([]);
      setSendError('');
      return;
    }
    try {
      const res = await assistantApi.chat(id);
      setChatId(id);
      setMessages(res.data.messages);
      setSendError('');
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };

  const send = async (override) => {
    const message = (override ?? text).trim();
    if (!message || sending) return;
    setSending(true);
    setSendError('');
    setMessages((m) => [...m, { _id: `tmp-${Date.now()}`, role: 'user', text: message, proposals: [], blocked: [] }]);
    setText('');
    try {
      const res = await assistantApi.send(message, chatId);
      setChatId(res.data.chat._id);
      setMessages(res.data.chat.messages);
      setUsage(res.data.usage);
      loadChats().catch(() => {});
    } catch (err) {
      setMessages((m) => m.filter((x) => !String(x._id).startsWith('tmp-')));
      setText(message);
      setSendError(formatApiError(err));
      if (err?.code === 'AI_ALLOWANCE_USED') setUsage((u) => ({ ...u, used: u.limit, left: 0 }));
    } finally {
      setSending(false);
    }
  };

  const patchProposal = (next) =>
    setMessages((all) => all.map((m) => ({ ...m, proposals: (m.proposals || []).map((p) => (p._id === next._id ? next : p)) })));

  const act = async (fn, id, okMsg) => {
    try {
      const res = await fn(id);
      patchProposal(res.data);
      if (okMsg) addToast(okMsg);
    } catch (err) {
      addToast(formatApiError(err), 'error');
      // The server is the source of truth: reload so the card shows the real state (expired, already done, failed).
      if (chatId) openChat(chatId);
    }
  };

  const removeChat = async () => {
    if (!chatId || !window.confirm('Delete this chat? Changes you already confirmed stay.')) return;
    try {
      await assistantApi.removeChat(chatId);
      setChatId(null);
      setMessages([]);
      loadChats().catch(() => {});
    } catch (err) {
      addToast(formatApiError(err), 'error');
    }
  };

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner size="lg" /></div>;

  if (loadError) {
    return (
      <Card className="p-6 max-w-xl mx-auto text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" aria-hidden="true" />
        <h2 className="font-bold dark:text-white">The assistant could not load</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">{loadError}</p>
        <Button onClick={init}>Try again</Button>
      </Card>
    );
  }

  const limitReached = usage.left === 0;
  const blockedInput = !aiOn || limitReached;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 min-h-[calc(100dvh-9rem)] md:min-h-[calc(100dvh-6rem)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" aria-hidden="true" /> Assistant
          </h1>
          <p className="text-sm text-slate-500">Reads your tasks, events and goals. Asks before it changes anything.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={limitReached ? 'warning' : 'info'}>Messages today: {usage.used}/{usage.limit}</Badge>
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => openChat(null)}>New chat</Button>
        </div>
      </header>

      {chats.length > 0 && (
        <div className="flex items-end gap-2">
          <Select
            className="flex-1"
            label="Chat"
            value={chatId || ''}
            onChange={(e) => openChat(e.target.value || null)}
            options={[{ value: '', label: 'New chat' }, ...chats.map((c) => ({ value: c._id, label: c.title }))]}
          />
          {chatId && (
            <button type="button" onClick={removeChat} aria-label="Delete this chat" className="w-11 h-11 mb-0.5 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {!aiOn && (
        <Card className="p-4 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-300">The assistant is not available yet: AI is not set up on the server. Ask the workspace admin to set it up.</p>
        </Card>
      )}
      {aiOn && limitReached && (
        <Card className="p-4 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-300">You used today&apos;s {usage.limit} messages. While we test on free AI, each person gets a daily allowance. It resets tomorrow (UTC). The rest of LifeOS still works.</p>
        </Card>
      )}

      <div className="flex-1 space-y-4" aria-live="polite">
        {messages.length === 0 && !sending && (
          <Card className="p-5">
            <h2 className="font-semibold dark:text-white">How can I help?</h2>
            <p className="text-sm text-slate-500 mt-1 mb-3 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              I only read your own data, and I ask you to confirm before changing anything. I can make mistakes, so check what I propose.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" disabled={blockedInput || sending} onClick={() => send(s)} className="min-h-[44px] px-3 text-left text-sm rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 dark:text-slate-200">
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((m) => (
          <MessageBubble key={m._id} m={m} onConfirm={(id) => act(assistantApi.confirm, id, 'Done.')} onCancel={(id) => act(assistantApi.cancel, id)} onUndo={(id) => act(assistantApi.undo, id, 'Undone.')} />
        ))}

        {sending && (
          <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm text-slate-500">
            Thinking. Free AI can take up to a minute. You can leave this page; nothing changes without your confirmation.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <Card className="p-3 border-red-200 dark:border-red-800 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-red-700 dark:text-red-400">{sendError}</p>
          {text && !limitReached && <Button size="sm" variant="secondary" onClick={() => send()}>Try again</Button>}
        </Card>
      )}

      <div className="sticky bottom-20 md:bottom-0 bg-slate-50 dark:bg-slate-950 pb-2 pt-1">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
          <textarea
            id="assistant-input"
            rows={1}
            maxLength={1000}
            value={text}
            disabled={blockedInput}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={blockedInput ? 'Unavailable right now' : 'Ask about your tasks, calendar or goals'}
            className="flex-1 min-h-[48px] max-h-40 px-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-60"
          />
          <Button type="submit" icon={Send} loading={sending} disabled={blockedInput || !text.trim()} className="min-h-[48px] px-4">Send</Button>
        </form>
        <p className="text-xs text-slate-500 mt-1">Nothing changes until you press Confirm.</p>
      </div>
    </div>
  );
}

function MessageBubble({ m, onConfirm, onCancel, onUndo }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 text-white px-4 py-2.5 text-sm whitespace-pre-wrap break-words">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      {m.text && (
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm dark:text-slate-100 whitespace-pre-wrap break-words">{m.text}</div>
      )}
      {(m.blocked || []).map((b, i) => (
        <Card key={i} className="w-full sm:w-[85%] p-4 border-indigo-200 dark:border-indigo-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Blocked by permission</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{b.reason} The assistant did not propose it.</p>
        </Card>
      ))}
      {(m.proposals || []).map((p) => (
        <ProposalCard key={p._id} p={p} onConfirm={onConfirm} onCancel={onCancel} onUndo={onUndo} />
      ))}
    </div>
  );
}

function ProposalCard({ p, onConfirm, onCancel, onUndo }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn(p._id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={`w-full sm:w-[85%] p-4 border-2 ${p.status === 'pending' ? 'border-indigo-300 dark:border-indigo-700' : ''}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">{p.status === 'pending' ? 'Needs your approval' : 'Proposal'}</div>
      <div className="font-semibold dark:text-white mt-1">{p.summary}</div>
      {p.details?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {p.details.map((d) => (
            <span key={d} className="text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{d}</span>
          ))}
        </div>
      )}
      <div className="mt-3">
        {p.status === 'pending' && (
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => run(onConfirm)} className="min-h-[44px]">Confirm</Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(onCancel)} className="min-h-[44px]">Cancel</Button>
          </div>
        )}
        {p.status === 'confirmed' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{p.undone ? 'Undone.' : `Done. ${p.result}`}</span>
            {p.canUndo && <Button size="sm" variant="secondary" loading={busy} onClick={() => run(onUndo)}>Undo</Button>}
          </div>
        )}
        {p.status === 'cancelled' && <span className="text-sm text-slate-500">Cancelled. Nothing was changed.</span>}
        {p.status === 'expired' && <span className="text-sm text-slate-500">Expired. Ask again if you still want it.</span>}
        {p.status === 'failed' && <span className="text-sm text-red-600">Could not be done: {p.result || 'an error occurred'}. Nothing was changed.</span>}
      </div>
    </Card>
  );
}
