// Run from the client folder:  node scripts/apply-community-extras-patch.mjs
// Adds the "Learning" and "Sessions" tabs to the Community page, and the resource reports list to the admin reports page.
// Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

if (!fs.existsSync(path.resolve('src/pages/CommunityPage.jsx'))) {
  console.error('WARNING: run this inside the client folder (src/pages/CommunityPage.jsx not found). Apply the Community phase first.');
  process.exit(1);
}
function patch(rel, steps) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) return console.log(`WARNING: ${rel} not found, skipped.`);
  let src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;
  for (const { done, re, to, hint } of steps) {
    if (done(src)) continue;
    if (!re.test(src)) { console.log(`WARNING: ${rel}: could not find the place for: ${hint}`); continue; }
    src = src.replace(re, (...m) => to(m, eol));
    changed = true;
  }
  if (changed) { fs.writeFileSync(file, src); console.log(`patched ${rel}`); } else console.log(`${rel}: nothing to do`);
}

patch('src/pages/CommunityPage.jsx', [
  {
    hint: "the two imports (LearningTab, SessionsTab) after the VolunteerLog import",
    done: (s) => s.includes('LearningTab'),
    re: /(import VolunteerLog from '\.\.\/components\/community\/VolunteerLog\.jsx';)/,
    to: (m, eol) => `${m[1]}${eol}import LearningTab from '../components/community/LearningTab.jsx';${eol}import SessionsTab from '../components/community/SessionsTab.jsx';`,
  },
  {
    hint: "['impact', 'Impact Network'] in the TABS list",
    done: (s) => s.includes("['learning', 'Learning']"),
    re: /(\['impact', 'Impact Network'\],)/,
    to: (m) => `${m[1]} ['learning', 'Learning'], ['sessions', 'Sessions'],`,
  },
  {
    hint: "the line  {tab === 'impact' && <ImpactTab ... />}",
    done: (s) => s.includes("tab === 'learning'"),
    re: /([ \t]*)(\{tab === 'impact' && <ImpactTab[^\n]*\})/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}{tab === 'learning' && <LearningTab profileOn={me.profile.enabled} />}${eol}${m[1]}{tab === 'sessions' && <SessionsTab />}`,
  },
]);

patch('src/pages/CommunityReportsPage.jsx', [
  {
    hint: "the import of ResourceReportsSection",
    done: (s) => s.includes('ResourceReportsSection'),
    re: /(import \{ communityAdminApi \} from '\.\.\/api\/community\.js';)/,
    to: (m, eol) => `${m[1]}${eol}import ResourceReportsSection from '../components/community/ResourceReportsSection.jsx';`,
  },
  {
    hint: "<Listings /> (to add <ResourceReportsSection /> after it)",
    done: (s) => s.includes('<ResourceReportsSection />'),
    re: /([ \t]*)(<Listings \/>)/,
    to: (m, eol) => `${m[1]}${m[2]}${eol}${m[1]}<ResourceReportsSection />`,
  },
]);
