import React from 'react';
import { Card, EmptyState } from '../../components/ui.jsx';
import { FolderOpen, PhoneCall } from 'lucide-react';

const COPY = {
  files: { icon: FolderOpen, title: 'Shared files', description: 'Photos, videos and documents shared in your conversations will be collected here. This arrives in a later phase.' },
  calls: { icon: PhoneCall, title: 'Calls and meetings', description: 'Voice and video calls will use the same LifeOS meeting rooms you already have. This arrives in a later phase.' },
};

/** Honest placeholder for sections that are planned but not built yet. */
export default function ConnectSoonPage({ kind }) {
  const c = COPY[kind];
  return <Card className="p-2"><EmptyState icon={c.icon} title={c.title} description={c.description} /></Card>;
}
