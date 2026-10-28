import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerUpLeft, Flag, Forward, Pencil, Trash2 } from 'lucide-react';
import { REACTIONS } from '../../utils/connectFormat.js';
import StatusTicks from './StatusTicks.jsx';
import { MediaThumb, FileCard, ContactCard } from './Attachments.jsx';
import { ResourceCard } from './Resources.jsx';

/** Text with @Name pieces for tagged people shown in bold (still plain text, never HTML). */
function Mentioned({ text, mentions = [], mine }) {
  const names = mentions.map((x) => x.name).filter(Boolean);
  if (!names.length) return text;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  return text.split(re).map((part, i) => (i % 2 ? <strong key={i} className={mine ? 'text-white underline decoration-white/40' : 'text-blue-600 dark:text-sky-400'}>{part}</strong> : part));
}

/** A single message. Plain text only (rendered as text, never as HTML). `actions` adds a small Reply / Edit / Delete menu. */
export default function MessageBubble({ m, showName = false, actions, onOpenMedia }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const canAct = actions && !m.deleted && m.status !== 'sending';
  const item = 'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700';
  return (
    <div data-mid={m.id} className={`group flex rounded-2xl transition-colors duration-700 ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div ref={box} className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${m.mine ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'}`}>
        {canAct && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Message options" aria-expanded={open}
            className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-70 ${m.mine ? 'bg-blue-600/90 text-blue-100' : 'bg-white/90 text-slate-500 dark:bg-slate-800/90'}`}>
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
        {open && (
          <div role="menu" className={`absolute top-8 z-20 w-56 overflow-hidden rounded-xl bg-white text-slate-800 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 ${m.mine ? 'right-1' : 'left-1'}`}>
            {actions.react && (
              <div className="flex justify-between gap-0.5 border-b border-slate-100 px-2 py-1.5 dark:border-slate-700" role="group" aria-label="React">
                {REACTIONS.map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => { setOpen(false); actions.react(m, e); }} className="flex h-9 w-9 items-center justify-center rounded-full text-xl hover:bg-slate-100 dark:hover:bg-slate-700">{e}</button>)}
              </div>
            )}
            <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); actions.reply(m); }}><CornerUpLeft className="h-4 w-4" />Reply</button>
            {actions.forward && !(m.kind === 'resource' && m.resource?.type === 'note') && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); actions.forward(m); }}><Forward className="h-4 w-4" />Forward</button>}
            {m.mine && m.kind === 'text' && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); actions.edit(m); }}><Pencil className="h-4 w-4" />Edit</button>}
            {!m.mine && actions.report && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); actions.report(m); }}><Flag className="h-4 w-4" />Report</button>}
            {m.mine && <button role="menuitem" type="button" className={`${item} text-red-600`} onClick={() => { setOpen(false); actions.remove(m); }}><Trash2 className="h-4 w-4" />Delete</button>}
          </div>
        )}
        {showName && !m.mine && <p className="mb-0.5 text-xs font-bold text-blue-600 dark:text-sky-400">{m.sender}</p>}
        {m.forwarded && !m.deleted && <p className={`mb-0.5 flex items-center gap-1 text-xs italic ${m.mine ? 'text-blue-100' : 'text-slate-500'}`}><Forward className="h-3 w-3" aria-hidden="true" />Forwarded</p>}
        {m.replyTo && (
          <p className={`mb-1.5 truncate rounded-lg border-l-4 px-2 py-1 text-xs ${m.mine ? 'border-sky-200 bg-white/15' : 'border-blue-500 bg-slate-100 dark:bg-slate-700'}`}>{m.replyTo}</p>
        )}
        {!m.deleted && (m.kind === 'image' || m.kind === 'video') && <div className="mb-1"><MediaThumb m={m} onOpen={onOpenMedia} /></div>}
        {!m.deleted && (m.kind === 'file' || m.kind === 'audio') && <div className="mb-1"><FileCard m={m} mine={m.mine} /></div>}
        {!m.deleted && m.kind === 'contact' && m.contact && <div className="mb-1"><ContactCard contact={m.contact} mine={m.mine} /></div>}
        {!m.deleted && m.kind === 'resource' && m.resource && <div className="mb-1"><ResourceCard m={m} mine={m.mine} /></div>}
        {(m.deleted || (m.text && m.kind !== 'contact' && m.kind !== 'resource')) && <p className={`whitespace-pre-wrap break-words text-[15px] leading-snug ${m.deleted ? 'italic opacity-70' : ''}`}>{m.deleted ? m.text : <Mentioned text={m.text} mentions={m.mentions} mine={m.mine} />}</p>}
        <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${m.mine ? 'text-blue-100' : 'text-slate-400'}`}>
          {m.edited && <span>edited</span>}
          <span>{m.time}</span>
          {m.mine && !m.deleted && <span className="[&_svg]:!text-blue-100"><StatusTicks status={m.status} /></span>}
        </p>
        {m.reactions?.length > 0 && !m.deleted && (
          <div className={`mt-1 flex flex-wrap gap-1 ${m.mine ? 'justify-end' : ''}`}>
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button" disabled={!actions?.react} onClick={() => actions.react(m, r.emoji)} aria-label={`${r.emoji} ${r.count}${r.mine ? ', you reacted' : ''}`} aria-pressed={r.mine}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${r.mine ? 'bg-white text-blue-700 ring-2 ring-white' : m.mine ? 'bg-blue-500/60 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100'}`}><span>{r.emoji}</span>{r.count > 1 && <span className="font-semibold">{r.count}</span>}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
