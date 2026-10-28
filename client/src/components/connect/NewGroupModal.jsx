import React, { useState } from 'react';
import { Button, Input, Modal, Textarea } from '../ui.jsx';
import FriendPicker from './FriendPicker.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const blue = '!bg-blue-600 hover:!bg-blue-700 !text-white';

export default function NewGroupModal({ open, onClose, onCreated }) {
  const { friends, groupActions } = useConnect();
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const reset = () => { setName(''); setDescription(''); setPicked([]); };
  const create = async () => {
    setBusy(true);
    try {
      const g = await groupActions.create({ name, description: description || undefined, memberIds: picked });
      reset(); onClose(); onCreated?.(g);
    } catch (err) { addToast(formatApiError(err), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="New group">
      <div className="space-y-4">
        <Input label="Group name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Study group" />
        <Textarea label="Description (optional)" value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Add friends <span className="font-normal text-slate-500">({picked.length} selected)</span></p>
          <FriendPicker friends={friends.friends} selected={picked} onToggle={toggle} empty="Add some friends first, then you can make a group." />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className={blue} loading={busy} disabled={!name.trim() || picked.length === 0 || busy} onClick={create}>Create group</Button>
        </div>
      </div>
    </Modal>
  );
}
