import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, SquarePen } from 'lucide-react';
import ConversationRow from '../../components/connect/ConversationRow.jsx';
import ChatPane from '../../components/connect/ChatPane.jsx';
import { ConfirmDialog, Modal } from '../../components/ui.jsx';
import GroupInfoModal from '../../components/connect/GroupInfoModal.jsx';
import { ShareResourceModal } from '../../components/connect/Resources.jsx';
import ChatMediaModal from '../../components/connect/ChatMedia.jsx';
import { ReportModal } from '../../components/connect/Safety.jsx';
import ForwardModal from '../../components/connect/Forward.jsx';
import FriendPicker from '../../components/connect/FriendPicker.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { conversationRow, toBubbles, checkUpload } from '../../utils/connectFormat.js';

/** Presentational chat screen: conversation list + message area (side by side on desktop, one at a time on a phone). */
export function ChatsView({ rows = [], id, current = null, pane = {}, onNewChat }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = rows.filter((c) => c.archived).length;
  const shown = useMemo(() => rows.filter((c) => Boolean(c.archived) === showArchived && c.name.toLowerCase().includes(q.trim().toLowerCase())), [rows, q, showArchived]);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid md:h-[calc(100dvh-15rem)] md:min-h-[480px] md:grid-cols-[22rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900">
      <section aria-label="Conversations" className={`min-h-[420px] flex-col border-slate-200 md:flex md:min-h-0 md:border-r dark:border-slate-800 ${id ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <label htmlFor="connect-search" className="sr-only">Search conversations</label>
            <input id="connect-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <button type="button" onClick={onNewChat} aria-label="New chat" title="Start a chat with a friend" className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700"><SquarePen className="h-5 w-5" /></button>
        </div>
        {(archivedCount > 0 || showArchived) && (
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="mx-3 mb-1 flex min-h-[40px] items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-blue-600 hover:bg-slate-50 dark:text-sky-400 dark:hover:bg-slate-800">{showArchived ? '← Back to chats' : `Archived (${archivedCount})`}</button>
        )}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {shown.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold text-slate-900 dark:text-white">{rows.length ? 'No matches' : 'No conversations yet'}</p>
              <p className="mt-1 text-sm text-slate-500">{rows.length ? 'Try a different name.' : 'Add a friend, then press the pencil button to start chatting.'}</p>
            </div>
          ) : shown.map((c) => <ConversationRow key={c.id} c={c} to={`/connect/chats/${c.id}`} />)}
        </div>
      </section>
      <section aria-label="Conversation" className={`min-w-0 md:static md:z-auto md:block md:h-full ${id ? 'fixed inset-0 z-50 block bg-white dark:bg-slate-900' : 'hidden'}`}>
        <ChatPane conversation={current} onBack={() => navigate('/connect/chats')} {...pane} />
      </section>
    </div>
  );
}

export default function ChatsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const c = useConnect();
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(false);
  const [pickContact, setPickContact] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [gallery, setGallery] = useState(false);

  const rows = useMemo(() => c.conversations.map((x) => conversationRow({ ...x, typing: c.typing[x.id] })), [c.conversations, c.typing]);
  const current = c.conversations.find((x) => x.id === id) || null;
  const store = id ? c.messagesBy[id] : null;
  const nameOf = (uid) => (current?.group ? current.members.find((m) => m.id === uid)?.name || 'Former member' : uid === current?.userId ? current.name : '');
  const bubbles = useMemo(() => toBubbles(store?.items || [], c.myId, nameOf), [store, c.myId, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const { setActive, loadMessages } = c;
  useEffect(() => {
    setReplyTo(null); setEditing(null);
    if (!id) return undefined;
    let alive = true;
    setLoading(true);
    loadMessages(id).catch((err) => { if (alive) { addToast(formatApiError(err), 'error'); navigate('/connect/chats', { replace: true }); } }).finally(() => alive && setLoading(false));
    setActive(id);
    return () => { alive = false; setActive(null); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (id && c.ready && !current) navigate('/connect/chats', { replace: true }); }, [id, c.ready, current, navigate]);

  const send = async (text, mentions = []) => {
    try {
      if (editing) { await c.editMessage(id, editing.id, text); setEditing(null); return; }
      const reply = replyTo; setReplyTo(null);
      await c.sendMessage(id, text, reply, mentions);
    } catch (err) {
      addToast(formatApiError(err), 'error');
      throw err;
    }
  };

  const sendFiles = async (files) => {
    let reply = replyTo;
    setReplyTo(null);
    for (const file of files) {
      const problem = checkUpload(file);
      if (problem) { addToast(problem, 'error'); continue; }
      try { await c.sendAttachment(id, file, '', reply); } catch (err) { addToast(formatApiError(err), 'error'); }
      reply = null;
    }
  };
  const shareContact = async (userId) => {
    setPickContact(false);
    try { await c.sendContact(id, userId, replyTo); setReplyTo(null); } catch (err) { addToast(formatApiError(err), 'error'); }
  };

  const liveCall = id ? c.callByConv[id] || null : null;
  const { load: loadCall } = c.callActions;
  useEffect(() => { if (id) loadCall(id); }, [id, loadCall]);
  const goCall = (call) => navigate(`/connect/call/${call.id}`, { state: { title: current?.name || call.title, mode: call.mode } });
  const startCall = async (mode) => {
    try { goCall(await c.callActions.start(id, mode)); } catch (err) { addToast(formatApiError(err), 'error'); }
  };

  const pane = {
    onMedia: () => setGallery(true), nameOf, onPrefs: (body) => c.setPrefs(id, body).then(() => addToast(body.archived === true ? 'Chat archived' : body.archived === false ? 'Chat moved back to your list' : body.muted ? 'Chat muted' : 'Chat unmuted')).catch((err) => addToast(formatApiError(err), 'error')),
    onPickResult: async (m) => {
      const found = await c.ensureLoaded(id, m.id);
      if (!found) { addToast('That message is too far back to show here.', 'error'); return; }
      setTimeout(() => {
        const el = document.querySelector(`[data-mid="${m.id}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('bg-blue-500/20');
        setTimeout(() => el.classList.remove('bg-blue-500/20'), 1800);
      }, 80);
    },
    onBlocked: () => navigate('/connect/chats', { replace: true }),
    callsEnabled: c.callsEnabled, onCall: startCall, liveCall, onJoinCall: () => liveCall && goCall(liveCall),
    onInfo: current?.group ? () => setInfo(true) : undefined,
    bubbles, loading: loading && !store?.loaded, hasMore: Boolean(store?.hasMore), onLoadOlder: () => c.loadOlder(id).catch(() => {}),
    typing: Boolean(id && c.typing[id]),
    actions: {
      reply: (m) => { setEditing(null); setReplyTo({ id: m.id, text: m.text.slice(0, 120), name: m.mine ? 'yourself' : current?.name }); },
      edit: (m) => { setReplyTo(null); setEditing({ id: m.id, text: m.text }); },
      remove: (m) => setConfirm(m),
      react: (m, emoji) => c.react(id, m.id, emoji).catch((err) => addToast(formatApiError(err), 'error')),
      forward: (m) => setForwarding(m),
      report: (m) => setReporting({ userId: m.raw.senderId, name: m.sender || current?.name || 'this person', messageId: m.id }),
    },
    composer: { members: current?.group ? current.members.filter((m) => m.id !== c.myId) : [], onFiles: sendFiles, onContact: () => setPickContact(true), onResource: () => setShareOpen(true), onSend: send, onTyping: () => c.sendTyping(id), replyTo, onCancelReply: () => setReplyTo(null), editing, onCancelEdit: () => setEditing(null) },
  };

  return (
    <>
      <ChatsView rows={rows} id={id} current={current} pane={pane} onNewChat={() => navigate('/connect/friends')} />
      {current?.group && <GroupInfoModal open={info} onClose={() => setInfo(false)} group={current} onLeft={() => navigate('/connect/chats', { replace: true })} />}
      <ForwardModal message={forwarding} conversations={c.conversations.filter((x) => x.id !== id || true)} onClose={() => setForwarding(null)} onSend={async (ids) => { try { const n = await c.forward(forwarding.id, ids); addToast(`Forwarded to ${n} chat${n === 1 ? '' : 's'}`); } catch (err) { addToast(formatApiError(err), 'error'); throw err; } }} />
      <ChatMediaModal open={gallery} onClose={() => setGallery(false)} conversationId={id} title={current?.name} />
      <ReportModal target={reporting} onClose={() => setReporting(null)} />
      <ShareResourceModal open={shareOpen} onClose={() => setShareOpen(false)} onShare={async (body) => { await c.sendResource(id, body, replyTo); setReplyTo(null); }} />
      <Modal isOpen={pickContact} onClose={() => setPickContact(false)} title="Share a contact">
        <p className="mb-3 text-sm text-slate-500">Pick one of your friends. The other person will see their name and can message or add them.</p>
        <FriendPicker single friends={c.friends.friends.filter((f) => f.id !== current?.userId)} onToggle={shareContact} empty="You have no other friends to share." />
      </Modal>
      <ConfirmDialog open={Boolean(confirm)} danger title="Delete this message?" description="It will be removed for everyone in this chat."
        confirmLabel="Delete" onClose={() => setConfirm(null)}
        onConfirm={async () => { const m = confirm; setConfirm(null); try { await c.deleteMessage(id, m.id); } catch (err) { addToast(formatApiError(err), 'error'); } }} />
    </>
  );
}
