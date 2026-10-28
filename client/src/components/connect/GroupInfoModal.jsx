import React, { useEffect, useRef, useState } from 'react';
import { Camera, LogOut, Pencil, Shield, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Input, Modal, Textarea } from '../ui.jsx';
import Avatar from './Avatar.jsx';
import FriendPicker from './FriendPicker.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const blue = '!bg-blue-600 hover:!bg-blue-700 !text-white';
const small = 'flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40';

/** Group details: members, roles, rename, add people, leave. Admin-only actions are hidden for everyone else. */
export default function GroupInfoModal({ open, onClose, group, onLeft }) {
  const { friends, groupActions, myId } = useConnect();
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);
  const picRef = useRef(null);

  useEffect(() => { if (open && group) { setName(group.name); setDescription(group.description || ''); setEditing(false); setAdding(false); setPicked([]); } }, [open, group?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!group) return null;
  const inGroup = new Set(group.members.map((m) => m.id));
  const candidates = friends.friends.filter((f) => !inGroup.has(f.id));
  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); if (ok) addToast(ok); } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(''); } };

  return (
    <>
      <Modal isOpen={open} onClose={onClose} title="Group info">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <Avatar name={group.name} src={group.avatar} size="lg" group />
              {group.isAdmin && (
                <>
                  <button type="button" disabled={busy === 'pic'} onClick={() => picRef.current?.click()} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-sky-400"><Camera className="h-3.5 w-3.5" aria-hidden="true" />{group.avatar ? 'Change' : 'Add picture'}</button>
                  {group.avatar && <button type="button" disabled={busy === 'pic'} onClick={() => run('pic', () => groupActions.removeAvatar(group.id), 'Picture removed')} className="text-xs text-slate-500 hover:text-red-600">Remove</button>}
                  <input ref={picRef} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Choose a group picture" onChange={(e) => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    if (!f) return;
                    if (f.size > 2 * 1048576) { addToast('The picture can be up to 2 MB.', 'error'); return; }
                    run('pic', () => groupActions.setAvatar(group.id, f), 'Group picture updated');
                  }} />
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-2">
                  <Input label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                  <Textarea label="Description" value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
                  <div className="flex gap-2">
                    <Button className={blue} loading={busy === 'save'} disabled={!name.trim()} onClick={() => run('save', async () => { await groupActions.update(group.id, { name, description }); setEditing(false); }, 'Group updated')}>Save</Button>
                    <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="break-words text-lg font-bold text-slate-900 dark:text-white">{group.name}</p>
                  <p className="text-sm text-slate-500">{group.memberCount} members</p>
                  {group.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">{group.description}</p>}
                  {group.isAdmin && <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-sky-400"><Pencil className="h-4 w-4" />Edit</button>}
                </>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Members</h3>
              {group.isAdmin && !adding && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-sky-400"><UserPlus className="h-4 w-4" />Add people</button>}
            </div>
            {adding && (
              <div className="mb-3 space-y-2">
                <FriendPicker friends={candidates} selected={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} empty="All your friends are already in this group." />
                <div className="flex gap-2">
                  <Button className={blue} loading={busy === 'add'} disabled={!picked.length} onClick={() => run('add', async () => { await groupActions.addMembers(group.id, picked); setAdding(false); setPicked([]); }, 'People added')}>Add {picked.length || ''}</Button>
                  <Button variant="secondary" onClick={() => { setAdding(false); setPicked([]); }}>Cancel</Button>
                </div>
              </div>
            )}
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {group.members.map((m) => (
                <li key={m.id} className="flex min-h-[56px] items-center gap-3 px-3">
                  <Avatar name={m.name} size="sm" online={m.id === myId ? undefined : m.online} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{m.name}{m.id === myId && <span className="font-normal text-slate-500"> (you)</span>}</span>
                  {m.admin && <Badge variant="info">Admin</Badge>}
                  {group.isAdmin && m.id !== myId && (
                    <>
                      {m.admin
                        ? m.id !== group.createdBy && <button type="button" className={small} aria-label={`Remove admin role from ${m.name}`} disabled={busy === `a-${m.id}`} onClick={() => run(`a-${m.id}`, () => groupActions.removeAdmin(group.id, m.id))}><ShieldOff className="h-4 w-4" /></button>
                        : <button type="button" className={small} aria-label={`Make ${m.name} an admin`} disabled={busy === `a-${m.id}`} onClick={() => run(`a-${m.id}`, () => groupActions.makeAdmin(group.id, m.id), `${m.name} is now an admin`)}><Shield className="h-4 w-4" /></button>}
                      {m.id !== group.createdBy && <button type="button" className={`${small} hover:!text-red-600`} aria-label={`Remove ${m.name}`} onClick={() => setConfirm({ kind: 'remove', m })}><UserMinus className="h-4 w-4" /></button>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <Button variant="secondary" icon={LogOut} className="w-full !text-red-600" onClick={() => setConfirm({ kind: 'leave' })}>Leave group</Button>
        </div>
      </Modal>
      <ConfirmDialog open={Boolean(confirm)} danger
        title={confirm?.kind === 'leave' ? 'Leave this group?' : `Remove ${confirm?.m?.name || ''}?`}
        description={confirm?.kind === 'leave' ? 'You will stop receiving messages from this group. Past messages stay for the others.' : 'They will no longer see new messages in this group.'}
        confirmLabel={confirm?.kind === 'leave' ? 'Leave' : 'Remove'} onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm; setConfirm(null);
          if (c.kind === 'leave') run('leave', async () => { await groupActions.removeMember(group.id, myId); onClose(); onLeft?.(); }, 'You left the group');
          else run(`r-${c.m.id}`, () => groupActions.removeMember(group.id, c.m.id), `${c.m.name} was removed`);
        }} />
    </>
  );
}
