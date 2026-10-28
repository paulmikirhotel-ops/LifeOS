import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, FileSpreadsheet, FileImage, Music, Play, X, AlertCircle, Loader2, MessageCircle, UserPlus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { useAttachmentUrl, downloadAttachment } from '../../hooks/useBlobUrl.js';
import { useConnect } from '../../context/ConnectContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { formatBytes } from '../../utils/connectFormat.js';

/** Full-screen viewer for a photo or video. Esc or a tap outside closes it. */
export function Lightbox({ item, onClose }) {
  const { url } = useAttachmentUrl(item.id, Boolean(item.localUrl));
  const src = item.localUrl || url;
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.attachment?.name || 'Preview'} className="fixed inset-0 z-[70] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 truncate text-sm font-semibold">{item.attachment?.name}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => downloadAttachment(item.id, item.attachment?.name)} aria-label="Download" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><Download className="h-5 w-5" /></button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        {!src ? <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Loading" />
          : item.kind === 'video' ? <video src={src} controls autoPlay className="max-h-full max-w-full rounded-lg" />
            : <img src={src} alt={item.attachment?.name || 'Photo'} className="max-h-full max-w-full rounded-lg object-contain" />}
      </div>
    </div>, document.body);
}

function Progress({ value }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
      <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold">{value}%</span>
    </span>
  );
}

/** A photo or video thumbnail inside a bubble (also used by the Files screen with `tile`). */
export function MediaThumb({ m, onOpen, tile = false }) {
  const local = m.localUrl;
  const { url, error, loading } = useAttachmentUrl(m.id, Boolean(local) || m.pending);
  const src = local || url;
  const box = tile ? 'aspect-square w-full' : 'h-52 w-64 max-w-full sm:h-60 sm:w-72';
  return (
    <button type="button" onClick={() => !m.pending && onOpen?.(m)} disabled={m.pending || error} aria-label={`Open ${m.kind === 'video' ? 'video' : 'photo'} ${m.attachment?.name || ''}`}
      className={`relative block overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-700 ${box}`}>
      {src && m.kind === 'image' && <img src={src} alt={m.attachment?.name || 'Photo'} className="h-full w-full object-cover" />}
      {src && m.kind === 'video' && <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />}
      {m.kind === 'video' && src && !m.pending && <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white"><Play className="h-6 w-6" /></span></span>}
      {loading && <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading" /></span>}
      {error && <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-slate-500"><AlertCircle className="h-5 w-5" />Could not load</span>}
      {m.pending && <Progress value={m.progress || 0} />}
    </button>
  );
}

const ICONS = { pdf: FileText, doc: FileText, docx: FileText, txt: FileText, csv: FileSpreadsheet, xls: FileSpreadsheet, xlsx: FileSpreadsheet, ppt: FileImage, pptx: FileImage };

/** Documents and audio files: icon, name, size, and a download button (audio also plays in place). */
export function FileCard({ m, mine }) {
  const { addToast } = useToast();
  const ext = (m.attachment?.name || '').split('.').pop().toLowerCase();
  const Icon = m.kind === 'audio' ? Music : ICONS[ext] || FileText;
  const { url } = useAttachmentUrl(m.id, m.kind !== 'audio' || m.pending);
  const save = async () => { try { await downloadAttachment(m.id, m.attachment?.name); } catch (err) { addToast(formatApiError(err), 'error'); } };
  return (
    <div className="w-64 max-w-full">
      <div className={`flex items-center gap-3 rounded-xl p-2.5 ${mine ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-700'}`}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${mine ? 'bg-white/20' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{m.attachment?.name}</span>
          <span className={`block text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}>{m.pending ? `Uploading ${m.progress || 0}%` : formatBytes(m.attachment?.size)}</span>
        </span>
        {!m.pending && <button type="button" onClick={save} aria-label={`Download ${m.attachment?.name}`} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mine ? 'hover:bg-white/20' : 'hover:bg-slate-200 dark:hover:bg-slate-600'}`}><Download className="h-5 w-5" /></button>}
      </div>
      {m.kind === 'audio' && url && <audio src={url} controls className="mt-2 h-10 w-full" />}
      {m.pending && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-sky-400 transition-all" style={{ width: `${m.progress || 0}%` }} /></div>}
    </div>
  );
}

/** A shared contact: the person's name and a button to message them or send a friend request. */
export function ContactCard({ contact, mine }) {
  const { myId, friends, friendActions, openWith } = useConnect();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const isMe = contact.userId === myId;
  const isFriend = friends.friends.some((f) => f.id === contact.userId);
  const pending = sent || friends.outgoing.some((f) => f.id === contact.userId);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(false); } };
  const btn = `inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-60 ${mine ? 'bg-white/20 hover:bg-white/30' : 'bg-blue-600 text-white hover:bg-blue-700'}`;
  return (
    <div className={`w-64 max-w-full rounded-xl p-3 ${mine ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-700'}`}>
      <div className="flex items-center gap-3">
        <Avatar name={contact.name} />
        <div className="min-w-0"><p className="truncate text-sm font-bold">{contact.name}</p><p className={`text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}>Contact</p></div>
      </div>
      <div className="mt-3">
        {isMe ? <p className={`text-center text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}>This is you</p>
          : isFriend ? <button type="button" className={btn} disabled={busy} onClick={() => run(async () => { const c = await openWith(contact.userId); navigate(`/connect/chats/${c.id}`); })}><MessageCircle className="h-4 w-4" />Message</button>
            : pending ? <p className={`flex items-center justify-center gap-1.5 text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}><Check className="h-4 w-4" />Request sent</p>
              : <button type="button" className={btn} disabled={busy} onClick={() => run(async () => { await friendActions.request(contact.userId); setSent(true); addToast('Request sent'); })}><UserPlus className="h-4 w-4" />Add friend</button>}
      </div>
    </div>
  );
}
