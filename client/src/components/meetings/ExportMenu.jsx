import React, { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Modal, Button } from '../ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { downloadBlob } from '../../utils/meetingFormat.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const GROUPS = [
  { kind: 'transcript', title: 'Transcript', formats: ['txt', 'pdf', 'docx'] },
  { kind: 'summary', title: 'AI summary', formats: ['pdf', 'docx'] },
  { kind: 'minutes', title: 'Meeting minutes', formats: ['pdf', 'docx'] },
  { kind: 'action-items', title: 'Action items', formats: ['csv', 'pdf'] },
];

export default function ExportMenu({ meetingId, open, onClose, kinds }) {
  const groups = kinds ? GROUPS.filter((g) => kinds.includes(g.kind)) : GROUPS;
  const [busy, setBusy] = useState(null);
  const { addToast } = useToast();

  const run = async (kind, format) => {
    setBusy(`${kind}.${format}`);
    try {
      const blob = await meetingsApi.exportFile(meetingId, kind, format);
      // The axios interceptor returns response.data, which is the Blob for responseType 'blob'.
      const name = `${kind}-${meetingId.slice(-6)}.${format}`;
      await downloadBlob(blob, name);
    } catch (err) {
      // A JSON error body arrives as a Blob when responseType is 'blob'.
      let message = formatApiError(err);
      if (err instanceof Blob) {
        try { message = JSON.parse(await err.text()).message || message; } catch { /* keep */ }
      }
      addToast(message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Download">
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.kind}>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><FileText className="w-4 h-4 text-indigo-500" aria-hidden="true" />{g.title}</p>
            <div className="flex flex-wrap gap-2">
              {g.formats.map((f) => (
                <Button key={f} variant="secondary" size="sm" disabled={busy !== null} onClick={() => run(g.kind, f)} aria-label={`Download ${g.title} as ${f.toUpperCase()}`}>
                  {busy === `${g.kind}.${f}` ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-slate-400">PDFs use a standard Latin font; for other scripts choose DOCX.</p>
      </div>
    </Modal>
  );
}
