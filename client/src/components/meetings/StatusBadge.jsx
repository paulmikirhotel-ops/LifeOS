import React from 'react';
import { Badge } from '../ui.jsx';
import { statusInfo } from '../../utils/meetingFormat.js';

export default function StatusBadge({ meeting, now }) {
  const s = statusInfo(meeting, now);
  return (
    <Badge variant={s.variant}>
      {s.pulse && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />}
      {s.label}
    </Badge>
  );
}
