import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus } from 'lucide-react';
import { Button, Card, EmptyState } from '../../components/ui.jsx';
import ConversationRow from '../../components/connect/ConversationRow.jsx';
import NewGroupModal from '../../components/connect/NewGroupModal.jsx';
import { useConnect } from '../../context/ConnectContext.jsx';
import { conversationRow } from '../../utils/connectFormat.js';

/** Your groups (study groups, teams, classmates, friends). */
export default function GroupsPage() {
  const navigate = useNavigate();
  const { conversations, ready, typing } = useConnect();
  const [open, setOpen] = useState(false);
  const groups = conversations.filter((c) => c.group).map((c) => conversationRow({ ...c, typing: typing[c.id] }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your groups</h2>
          <p className="text-sm text-slate-500">Study groups, teams, classmates and friends.</p>
        </div>
        <Button icon={Plus} className="min-h-[44px] !bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => setOpen(true)}>New group</Button>
      </div>
      <Card className="p-2">
        {!ready ? <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
          : groups.length === 0
            ? <EmptyState icon={Users} title="No groups yet" description="Create a group with your friends to chat, share photos and files, and plan together." action={<Button className="!bg-blue-600 hover:!bg-blue-700 !text-white" onClick={() => setOpen(true)}>Create a group</Button>} />
            : <div className="space-y-0.5">{groups.map((g) => <ConversationRow key={g.id} c={g} to={`/connect/chats/${g.id}`} />)}</div>}
      </Card>
      <NewGroupModal open={open} onClose={() => setOpen(false)} onCreated={(g) => navigate(`/connect/chats/${g.id}`)} />
    </div>
  );
}
