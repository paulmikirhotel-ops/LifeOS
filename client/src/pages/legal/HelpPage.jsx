import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { Section } from './LegalLayout.jsx';
import { LEGAL } from './legalConfig.js';

const FAQ = [
  ['I did not get the verification or reset email.', 'Check spam or junk first, then request it again from the sign-in page. Links expire, so use the newest email.'],
  ['How do I invite someone to a meeting?', 'Open the meeting and use the invite link. Anyone with the link and its password can join; people with an account are asked to sign in so the meeting appears in their account.'],
  ['Who gets the meeting minutes and summary?', 'The meeting owner always gets the transcript and AI summary, even when someone else started the recording. The owner can send the minutes to participants.'],
  ['Why can’t I start a voice or video call in Connect?', 'Calls need the video service to be configured by the site owner, and your browser needs permission to use the microphone and camera. Allow them in your browser’s address-bar settings.'],
  ['Voice notes or camera do not work.', 'Browsers only allow the microphone and camera on secure (https) pages. Use the live website address, not a plain http link.'],
  ['Are Connect messages end-to-end encrypted?', 'No. They are protected in transit and stored on our servers, so please do not send passwords or highly sensitive secrets in chat.'],
  ['How do I block or report someone?', 'In a chat, open the menu next to the person’s name and choose Block or Report. You can also report a single message from its menu.'],
  ['The app says too many attempts.', 'Sign-in and sign-up have a short limit to stop password guessing. Wait a few minutes and try again.'],
  ['How do I delete my account or get my data?', `Self-service tools are being added. For now email ${LEGAL.contactEmail} from your account email address and we will help.`],
];

export default function HelpPage() {
  return (
    <LegalLayout active="/help" title="Help" intro="Quick answers to common questions.">
      <div className="space-y-3">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <summary className="cursor-pointer list-none font-semibold text-slate-900 dark:text-white flex items-center justify-between gap-3">
              {q}
              <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-45 text-xl leading-none">+</span>
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{a}</p>
          </details>
        ))}
      </div>
      <Section title="Still stuck?">
        <p>
          Email <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> and tell us what you were doing and what you saw. A screenshot helps. Read our{' '}
          <Link className="underline" to="/privacy">Privacy Policy</Link> and <Link className="underline" to="/terms">Terms</Link>.
        </p>
      </Section>
    </LegalLayout>
  );
}
