import React from 'react';
import LegalLayout, { Section, Bullets } from './LegalLayout.jsx';
import { LEGAL } from './legalConfig.js';

export default function TermsPage() {
  return (
    <LegalLayout
      active="/terms"
      title="Terms of Use"
      intro={`By creating an account or using ${LEGAL.appName} you agree to these terms. If you do not agree, please do not use the service.`}
    >
      <Section title="Your account">
        <Bullets
          items={[
            'Give accurate details and keep your password private. You are responsible for activity on your account.',
            'Tell us straight away if you think someone else has accessed your account.',
          ]}
        />
      </Section>
      <Section title="Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            'harass, threaten, scam or spam other people, including through Connect messages and meeting invitations;',
            'share illegal content, malware, or material that exploits or endangers children;',
            'record other people in meetings without a lawful basis. If you record, you are responsible for telling participants and following the recording laws that apply to you;',
            'try to break, overload or gain unauthorised access to the service or other users’ data;',
            'use the service to impersonate someone or mislead people.',
          ]}
        />
        <p>We may remove content, limit features or suspend accounts that break these rules or that are reported and confirmed as abusive.</p>
      </Section>
      <Section title="Your content">
        <p>
          You own what you create. You give us permission to store, process and display it only as needed to run the service for you and the
          people you choose to share with, including sending it to the providers listed in the Privacy Policy. You are responsible for having the
          right to upload and share what you add.
        </p>
      </Section>
      <Section title="AI and automatic features">
        <p>
          Transcripts, summaries, action items and other AI output can contain mistakes. Check anything important before relying on it. AI
          features may be limited or unavailable at times.
        </p>
      </Section>
      <Section title="Availability and changes">
        <p>
          We work to keep {LEGAL.appName} running but cannot promise it will always be available or error-free. We may change, limit or end
          features, and some features may depend on third-party services and usage limits.
        </p>
      </Section>
      <Section title="Not professional advice">
        <p>
          Finance, goal and productivity tools are for personal organisation only. They are not financial, legal, medical or other professional advice.
        </p>
      </Section>
      <Section title="Ending your account">
        <p>
          You can stop using the service at any time and ask us to delete your account (see the Privacy Policy). We may suspend or close accounts
          that break these terms or put others at risk.
        </p>
      </Section>
      <Section title="Liability">
        <p>
          The service is provided “as is”. To the extent the law allows, {LEGAL.owner} is not liable for indirect or consequential losses, or for
          loss of data, and our total liability for any claim is limited to the amount you paid us in the 12 months before it (which is zero for free accounts).
          Nothing here limits rights you have under law that cannot be limited.
        </p>
      </Section>
      <Section title="Law and contact">
        <p>
          These terms are governed by the laws of {LEGAL.country}. We may update them and will change the date above when we do; continuing to
          use {LEGAL.appName} after an update means you accept it. Contact: <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </Section>
    </LegalLayout>
  );
}
