import React, { useState } from 'react';
import { MailWarning, X } from 'lucide-react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatApiError } from '../utils/errors.js';
import { Button } from './ui.jsx';

/**
 * Shown to signed-in users whose email is not verified yet.
 * Lets them request a fresh verification link (the server allows one per minute).
 */
export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (!user || user.isEmailVerified !== false || hidden) return null;

  const resend = async () => {
    setBusy(true);
    try {
      const res = await api.post('/auth/resend-verification');
      if (res.data?.alreadyVerified) {
        addToast('Your email is already verified. Refresh the page.');
      } else {
        setSent(true);
        addToast('Verification email sent. Check your inbox.');
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 sm:p-4"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <MailWarning className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-amber-900 dark:text-amber-100">
          <strong className="font-semibold">Verify your email address.</strong>{' '}
          {sent ? `We sent a new link to ${user.email}. It stays valid for 24 hours.` : `We sent a link to ${user.email} when you signed up. Some features, like inviting people, need a verified email.`}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:ml-auto shrink-0">
        <Button size="sm" variant="secondary" onClick={resend} loading={busy}>{sent ? 'Send again' : 'Resend email'}</Button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
          className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
