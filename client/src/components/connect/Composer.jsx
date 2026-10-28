import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, Mic, Square, Trash2, X, CornerUpLeft, Pencil, Image as ImageIcon, FileText, UserRound, Sparkles } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { useVoiceRecorder, voiceSupported } from '../../hooks/useVoiceRecorder.js';
import { ACCEPT_MEDIA, ACCEPT_DOCS } from '../../utils/connectFormat.js';

const TYPING_EVERY_MS = 3000;

/**
 * Message box. Enter sends, Shift+Enter adds a line. While replying or editing a bar above the box says so.
 * `onSend(text)` returns a promise; if it fails the text is put back so nothing is lost.
 */
export default function Composer({ disabled, note, onSend, onTyping, replyTo, onCancelReply, editing, onCancelEdit, onFiles, onContact, onResource, members = [] }) {
  const [menu, setMenu] = useState(false);
  const mediaRef = useRef(null);
  const docRef = useRef(null);
  const menuBox = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuBox.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const picked = (e) => { const files = [...e.target.files]; e.target.value = ''; setMenu(false); if (files.length) onFiles?.(files); };
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const lastTyping = useRef(0);
  const tagged = useRef(new Map()); // name -> user id, for @mentions in groups
  const [mentionQ, setMentionQ] = useState(null); // text typed after "@", or null
  const voice = useVoiceRecorder();
  const recording = voice.state === 'recording';
  const mm = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const sendVoice = async () => { const f = await voice.stop(); if (f) onFiles?.([f]); };
  useEffect(() => { if (recording && voice.seconds >= voice.maxSeconds) sendVoice(); }, [voice.seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = mentionQ === null ? [] : members.filter((m) => m.name.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 5);
  const pickMention = (m) => {
    const el = ref.current; const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@[^\s@]*$/, '');
    const next = `${before}@${m.name} ${text.slice(pos)}`;
    tagged.current.set(m.name, m.id); setText(next); setMentionQ(null);
    setTimeout(() => { el?.focus(); const p = before.length + m.name.length + 2; el?.setSelectionRange(p, p); }, 0);
  };

  useEffect(() => { if (editing) { setText(editing.text); ref.current?.focus(); } }, [editing]);
  useEffect(() => { if (replyTo) ref.current?.focus(); }, [replyTo]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }
  }, [text]);

  const change = (e) => {
    setText(e.target.value);
    if (members.length) { const m = /(?:^|\s)@([^\s@]*)$/.exec(e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length)); setMentionQ(m ? m[1] : null); }
    const now = Date.now();
    if (onTyping && !editing && e.target.value && now - lastTyping.current > TYPING_EVERY_MS) { lastTyping.current = now; onTyping(); }
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setText('');
    setBusy(true);
    const ids = [...tagged.current].filter(([name]) => value.includes(`@${name}`)).map(([, id]) => id);
    tagged.current = new Map(); setMentionQ(null);
    try { await onSend?.(value, ids); } catch { setText(value); } finally { setBusy(false); ref.current?.focus(); }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (matches.length) { e.preventDefault(); pickMention(matches[0]); return; } e.preventDefault(); submit(); }
    if (e.key === 'Escape' && mentionQ !== null) { setMentionQ(null); return; }
    if (e.key === 'Escape') { onCancelReply?.(); if (editing) { onCancelEdit?.(); setText(''); } }
  };

  const bar = replyTo || editing;
  return (
    <div className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {bar && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
          {editing ? <Pencil className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" /> : <CornerUpLeft className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />}
          <p className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-blue-600 dark:text-sky-400">{editing ? 'Editing message' : `Replying to ${replyTo.name || 'message'}`}</span>
            {!editing && <span className="ml-2">{replyTo.text}</span>}
          </p>
          <button type="button" onClick={() => { onCancelReply?.(); onCancelEdit?.(); if (editing) setText(''); }} aria-label="Cancel" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
      )}
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="mx-3 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {matches.map((m) => (
            <li key={m.id} role="option" aria-selected="false">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m)} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><Avatar name={m.name} size="sm" />{m.name}</button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="px-3 pt-2 text-center text-xs text-slate-400">{note}</p>}
      {recording ? (
        <div className="flex items-center gap-3 p-3" role="status" aria-label="Recording a voice note">
          <button type="button" onClick={voice.cancel} aria-label="Cancel voice note" className="flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-5 w-5" /></button>
          <span className="flex flex-1 items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />Recording {mm(voice.seconds)}</span>
          <button type="button" onClick={sendVoice} aria-label="Send voice note" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"><Send className="h-5 w-5" /></button>
        </div>
      ) : (
      <div className="flex items-end gap-2 p-3">
        <div ref={menuBox} className="relative shrink-0">
          <button type="button" disabled={disabled || editing || !onFiles} onClick={() => setMenu((v) => !v)} aria-label="Attach" aria-haspopup="menu" aria-expanded={menu} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><Paperclip className="h-5 w-5" /></button>
          {menu && (
            <div role="menu" className="absolute bottom-12 left-0 z-20 w-52 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <button role="menuitem" type="button" onClick={() => mediaRef.current?.click()} className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><ImageIcon className="h-4 w-4 text-blue-600" />Photos &amp; videos</button>
              <button role="menuitem" type="button" onClick={() => docRef.current?.click()} className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><FileText className="h-4 w-4 text-blue-600" />Document</button>
              <button role="menuitem" type="button" onClick={() => { setMenu(false); onContact?.(); }} className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><UserRound className="h-4 w-4 text-blue-600" />Contact</button>
              <button role="menuitem" type="button" onClick={() => { setMenu(false); onResource?.(); }} className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><Sparkles className="h-4 w-4 text-blue-600" />LifeOS item</button>
            </div>
          )}
          <input ref={mediaRef} type="file" accept={ACCEPT_MEDIA} multiple hidden onChange={picked} aria-label="Choose photos or videos" />
          <input ref={docRef} type="file" accept={ACCEPT_DOCS} multiple hidden onChange={picked} aria-label="Choose documents" />
        </div>
        <label className="sr-only" htmlFor="connect-composer">Type a message</label>
        <textarea ref={ref} id="connect-composer" rows={1} disabled={disabled} maxLength={4000} value={text} onChange={change} onKeyDown={onKey}
          placeholder="Type a message" enterKeyHint="send"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[15px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
        {(text.trim() || editing || !onFiles || !voiceSupported()) && (<button type="button" onClick={submit} disabled={disabled || busy || !text.trim()} aria-label={editing ? 'Save edit' : 'Send'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"><Send className="h-5 w-5" /></button>)}
        {!text.trim() && !editing && onFiles && voiceSupported() && (
          <button type="button" disabled={disabled} onClick={voice.start} aria-label="Record a voice note" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-blue-600 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-sky-400"><Mic className="h-5 w-5" /></button>
        )}
      </div>
      )}
      {voice.error && <p role="alert" className="px-4 pb-2 text-xs text-red-600">{voice.error}</p>}
    </div>
  );
}
