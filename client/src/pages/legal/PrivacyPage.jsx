import React from 'react';
import LegalLayout, { Section, Bullets } from './LegalLayout.jsx';
import { LEGAL } from './legalConfig.js';

export default function PrivacyPage() {
  return (
    <LegalLayout
      active="/privacy"
      title="Privacy Policy"
      intro={`${LEGAL.appName} holds personal information such as your plans, notes and meetings. This page explains what we keep, why, and who helps us run the service.`}
    >
      <Section title="What we collect">
        <Bullets
          items={[
            'Account details: your name, email address and a securely hashed password (we never store your password itself).',
            'What you create: tasks, calendar events, journal entries, habits, goals, focus sessions, finance records and the files you attach.',
            'Meetings: titles, participants, invitation links, chat, and, if you or the host turn recording on, the audio/video recording, transcript and AI summary.',
            'Connect: your friends list, messages, files, voice notes, call history, notifications, and block and report records.',
            'Technical data: sign-in sessions, basic logs (such as IP address and time of request) used for security and fixing faults.',
          ]}
        />
      </Section>
      <Section title="Why we use it">
        <Bullets
          items={[
            'To provide the features you use and keep your data available when you sign in again.',
            'To send emails you ask for or need: verification, password reset, meeting invitations, minutes and digests.',
            'To protect the service: preventing abuse, investigating reports and keeping accounts secure.',
          ]}
        />
        <p>We do not sell your personal data and we do not show advertising.</p>
      </Section>
      <Section title="Companies that help us run LifeOS">
        <p>Some data passes through service providers who process it for us:</p>
        <Bullets
          items={[
            'Database hosting (MongoDB Atlas): stores your account and content.',
            'File storage (Backblaze B2 / S3-compatible): stores recordings and attachments.',
            'Speech-to-text (Deepgram): receives meeting audio to produce a transcript, only when recording is on.',
            'AI summaries (Groq or the configured AI provider): receives transcript text to write summaries and action items, only when you use those features.',
            'Video and voice rooms (LiveKit): carries live audio and video during meetings and calls.',
            'Email delivery (SMTP provider such as Gmail): sends the emails described above.',
            'Application hosting (Render for the server, Netlify for the website).',
          ]}
        />
        <p>The providers in use for your deployment may change; we keep this list up to date.</p>
      </Section>
      <Section title="Who can see what">
        <Bullets
          items={[
            'Your tasks, journal, finance and similar records are private to your account and workspace permissions.',
            'Meeting content is visible to the meeting owner and to people the owner shares it with. People who join through an invitation link can see only what that meeting gives them.',
            'Connect messages are visible to the people in that conversation. Messages are protected in transit and stored on our servers, but they are not end-to-end encrypted. The service operator and our providers can technically access stored content, and we may review content that is reported for abuse.',
            'Items you share in Connect (tasks, goals, events, notes, meetings) are sent as a copy at that moment, not live access to your account.',
          ]}
        />
      </Section>
      <Section title="How long we keep it">
        <p>
          We keep your data while your account is active. Recordings and files stay until you or the owner delete them. When an account is
          deleted we remove its personal data, except records we must keep for security or legal reasons, and backups that expire on a normal schedule.
        </p>
      </Section>
      <Section title="Your choices">
        <Bullets
          items={[
            'You can edit or delete most of what you create inside the app, and delete your own Connect messages.',
            'In Connect you can block people, report abuse, and choose whether others can find you.',
            `To get a copy of your data, correct it, or have your account deleted, email ${LEGAL.contactEmail}. We will reply and complete valid requests within a reasonable time.`,
          ]}
        />
      </Section>
      <Section title="Security">
        <p>
          We use encrypted connections (HTTPS), hashed passwords, access checks on every request and limits on sign-in attempts. No system is
          perfectly secure, so please use a strong, unique password and keep your account details private. If we learn of a breach affecting
          you, we will tell you as the law requires.
        </p>
      </Section>
      <Section title="Children">
        <p>{LEGAL.appName} is not meant for children under 13 (or the minimum age in your country). Do not create an account if you are under that age.</p>
      </Section>
      <Section title="Changes and contact">
        <p>
          If we change this policy in a meaningful way we will update the date above and, where appropriate, tell you in the app or by email.
          Contact us at <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
