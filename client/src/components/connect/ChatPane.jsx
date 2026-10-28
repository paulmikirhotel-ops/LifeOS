import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, Phone, Video, MoreVertical, MessageCircle, Loader2 } from 'lucide-react';
import Avatar from './Avatar.jsx';
import MessageBubble from './MessageBubble.jsx';
import Composer from './Composer.jsx';
import { SafetyMenu } from './Safety.jsx';
import ChatSearch from './ChatSearch.jsx';
import { Lightbox } from './Attachments.jsx';

/** Right-hand side of the chat screen. With no conversation it shows a calm empty state. */
export default function ChatPane({ conversation, bubbles = [], loading = false, hasMore = false, onLoadOlder, onBack, typing = false, composer = {}, actions, onInfo, callsEnabled = false, onCall, liveCall = null, onJoinCall, onBlocked, onPrefs, onPickResult, nameOf, onMedia }) {
  const scroller = useRef(null);
  const [viewing, setViewing] = useState(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => { setSearching(false); }, [conversation?.id]);
  const stick = useRef(true);
  const lastId = bubbles[bubbles.length - 1]?.id;
  const lastMine = Boolean(bubbles[bubbles.length - 1]?.mine);

  useEffect(() => { stick.current = true; }, [conversation?.id]);
  const toBottom = () => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; };
  useLayoutEffect(() => {
    if (lastMine) stick.current = true; // sending something always jumps to it
    toBottom();
    const t = requestAnimationFrame(toBottom); // once more after images have laid out
    return () => cancelAnimationFrame(t);
  }, [lastId, typing, conversation?.id, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!conversation) {
    return (
      <div className="hidden h-full flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center md:flex dark:bg-slate-950">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400"><MessageCircle className="h-8 w-8" aria-hidden="true" /></span>
        <p className="text-lg font-bold text-slate-900 dark:text-white">Your conversations</p>
        <p className="max-w-xs text-sm text-slate-500">Pick a conversation from the list to read it here.</p>
      </div>
    );
  }
  const onScroll = (e) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
        <button type="button" onClick={onInfo} disabled={!onInfo} aria-label={onInfo ? `${conversation.name}, group info` : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-default">
          <Avatar name={conversation.name} src={conversation.avatar} online={conversation.group ? undefined : conversation.online} group={conversation.group} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-slate-900 dark:text-white">{conversation.name}</span>
            <span className={`block truncate text-xs ${typing ? 'font-medium text-blue-600 dark:text-sky-400' : 'text-slate-500'}`}>{typing ? 'typing…' : conversation.group ? `${conversation.memberCount} members` : conversation.online ? 'Online' : 'Offline'}</span>
          </span>
        </button>
        <button type="button" onClick={() => setSearching((v) => !v)} aria-label="Search in this chat" aria-expanded={searching} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-slate-300 dark:hover:bg-slate-800"><Search className="h-5 w-5" /></button>
        {['voice', 'video'].map((mode) => {
          const Icon = mode === 'video' ? Video : Phone;
          const label = mode === 'video' ? 'Video call' : 'Voice call';
          return (
            <button key={mode} type="button" disabled={!callsEnabled || !onCall} onClick={() => onCall(mode)} aria-label={label} title={callsEnabled ? label : "Calls aren't set up on this server yet"} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"><Icon className="h-5 w-5" /></button>
          );
        })}
        <SafetyMenu conversation={conversation} onBlocked={onBlocked} onPrefs={onPrefs} onMedia={onMedia} />
      </header>
      {searching && <ChatSearch conversationId={conversation.id} nameOf={nameOf || (() => '')} onClose={() => setSearching(false)} onPick={(m) => { setSearching(false); onPickResult?.(m); }} />}
      {liveCall && callsEnabled && (
        <div role="status" className="flex items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
          <span className="min-w-0 flex-1 truncate">{liveCall.status === 'ringing' ? `${liveCall.mode === 'video' ? 'Video' : 'Voice'} call ringing…` : `${liveCall.mode === 'video' ? 'Video' : 'Voice'} call in progress`}</span>
          <button type="button" onClick={onJoinCall} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">{liveCall.status === 'ringing' && liveCall.joined?.length <= 1 ? 'Open call' : 'Join call'}</button>
        </div>
      )}
      <div ref={scroller} onScroll={onScroll} onLoadCapture={toBottom} onLoadedMetadataCapture={toBottom} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6" role="log" aria-live="polite" aria-label="Messages">
        {hasMore && <p className="text-center"><button type="button" onClick={onLoadOlder} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm dark:bg-slate-800 dark:text-sky-400">Load older messages</button></p>}
        {loading && bubbles.length === 0
          ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</p>
          : bubbles.length === 0
            ? <p className="py-10 text-center text-sm text-slate-400">No messages yet. Say hello!</p>
            : bubbles.map((m) => m.day
              ? <p key={m.id} className="py-2 text-center"><span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm dark:bg-slate-800">{m.day}</span></p>
              : m.system !== undefined
                ? <p key={m.id} className="py-1 text-center text-xs text-slate-500"><span className="rounded-full bg-slate-200/70 px-3 py-1 dark:bg-slate-800">{m.system}</span></p>
                : <MessageBubble key={m.id} m={m} showName={conversation.group} actions={actions} onOpenMedia={setViewing} />)}
        {typing && <div className="flex"><span className="rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-slate-400 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" aria-hidden="true">● ● ●</span></div>}
      </div>
      <Composer {...composer} />
      {viewing && <Lightbox item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
