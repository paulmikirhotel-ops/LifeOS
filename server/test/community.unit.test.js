/**
 * Community (Skill Exchange): pure logic. No database, no network.
 *   node --test test/community.unit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const L = await import('../src/utils/community.logic.js');
const M = await import('../src/models/community.model.js').catch((e) => (e.code === 'ERR_MODULE_NOT_FOUND' ? null : Promise.reject(e)));

test('contact details are caught: emails, phones, links, handles, chat apps', () => {
  const bad = [
    'mail me at jo@example.com', 'jo (at) example (dot) com', 'call +231 77 123 4567', '0777123456', 'see https://x.io/me', 'www.mysite.org',
    'my site is cool.com', 'add me @jo_dev', 'find me on WhatsApp', 'DM me', 'text me tonight', 'telegram: jo',
  ];
  for (const t of bad) assert.equal(L.looksLikeContact(t), true, t);
});

test('normal profile text is not flagged', () => {
  const ok = ['I teach spreadsheets and budgeting', 'Available weekends, 2 hours', 'Since 2019 I have mentored 12 students', 'Excel, Python 3.12', 'Open on Sat 10:00 to 12:00', 'Learn node.js basics'];
  for (const t of ok) assert.equal(L.looksLikeContact(t), false, t);
});

test('assertNoContact throws a friendly message and checks arrays', () => {
  assert.throws(() => L.assertNoContact({ a: 'fine', b: ['ok', 'ping me on whatsapp'] }), /Connect chat/);
  assert.doesNotThrow(() => L.assertNoContact({ a: 'fine', b: ['ok'] }));
});

test('cleanTags lowercases, dedupes, trims and caps', () => {
  assert.deepEqual(L.cleanTags(['  Excel ', 'excel', 'A', 'Public Speaking', '']), ['excel', 'public speaking']);
  assert.equal(L.cleanTags(Array.from({ length: 30 }, (_, i) => `skill${i}`)).length, L.LIMITS.tags);
  assert.deepEqual(L.cleanTags('nope'), []);
});

test('a profile is listable only when switched on, named, not hidden and has a skill', () => {
  const base = { enabled: true, hidden: false, displayName: 'Sam', offers: ['excel'], wants: [] };
  assert.equal(L.isListable(base), true);
  assert.equal(L.isListable({ ...base, enabled: false }), false);
  assert.equal(L.isListable({ ...base, hidden: true }), false);
  assert.equal(L.isListable({ ...base, displayName: '' }), false);
  assert.equal(L.isListable({ ...base, offers: [], wants: [] }), false);
  assert.equal(L.isListable(null), false);
});

test('visibility: friends-only needs friendship, everyone does not, blocks always win', () => {
  assert.equal(L.canView({ audience: 'friends', isFriend: false, blocked: false }), false);
  assert.equal(L.canView({ audience: 'friends', isFriend: true, blocked: false }), true);
  assert.equal(L.canView({ audience: 'everyone', isFriend: false, blocked: false }), true);
  assert.equal(L.canView({ audience: 'everyone', isFriend: true, blocked: true }), false);
  assert.equal(L.canView({ audience: 'friends', isFriend: false, blocked: false, isOwner: true }), true);
});

test('search is simple, case-insensitive and covers arrays', () => {
  assert.equal(L.matchesQuery(['Sam', ['excel', 'budgeting']], 'BUDGET'), true);
  assert.equal(L.matchesQuery(['Sam', ['excel']], 'python'), false);
  assert.equal(L.matchesQuery(['x'], ''), true);
});

test('new accounts wait before publishing; 0 hours switches the wait off', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  assert.equal(L.mayPublish(new Date('2026-10-14T00:00:00Z'), now, 24).ok, false);
  assert.equal(L.mayPublish(new Date('2026-10-13T00:00:00Z'), now, 24).ok, true);
  assert.equal(L.mayPublish(new Date('2026-10-14T11:00:00Z'), now, 0).ok, true);
  assert.equal(L.mayPublish(undefined, now, 24).ok, true);
  assert.equal(L.newAccountWaitHours('abc'), 24);
  assert.equal(L.newAccountWaitHours('9999'), 168);
});

test('three different reporters hide a listing', () => {
  assert.equal(L.shouldHide(2), false);
  assert.equal(L.shouldHide(3), true);
});

test('request schema: short message, valid id; group schema bounds', () => {
  const id = 'a'.repeat(24);
  assert.equal(L.requestSchema.safeParse({ userId: id, message: 'x'.repeat(201) }).success, false);
  assert.equal(L.requestSchema.safeParse({ userId: id }).success, true);
  assert.equal(L.requestSchema.safeParse({ userId: 'short' }).success, false);
  assert.equal(L.groupSchema.safeParse({ title: 'ab' }).success, false);
  assert.equal(L.groupSchema.safeParse({ title: 'Intro to JS', maxMembers: 51 }).success, false);
  assert.equal(L.groupSchema.safeParse({ title: 'Intro to JS', maxMembers: 10, audience: 'everyone' }).success, true);
  assert.equal(L.groupPatchSchema.safeParse({ status: 'hidden' }).success, false); // people cannot un-hide or hide by hand
});

test('report schema needs the right target', () => {
  const id = 'b'.repeat(24);
  assert.equal(L.reportSchema.safeParse({ targetType: 'profile', userId: id, reason: 'spam' }).success, true);
  assert.equal(L.reportSchema.safeParse({ targetType: 'profile', reason: 'spam' }).success, false);
  assert.equal(L.reportSchema.safeParse({ targetType: 'group', groupId: id, reason: 'asks_for_money' }).success, true);
  assert.equal(L.reportSchema.safeParse({ targetType: 'group', userId: id, reason: 'spam' }).success, false);
  assert.equal(L.reportSchema.safeParse({ targetType: 'group', groupId: id, reason: 'rude' }).success, false);
});

test('models: profile is off by default and one open request per target is enforced by an index', { skip: !M && 'mongoose not installed in this sandbox' }, () => {
  const p = new M.CommunityProfile({ userId: '6500000000000000000000a1' });
  assert.equal(p.enabled, false);
  assert.equal(p.audience, 'friends');
  assert.equal(p.validateSync(), undefined);
  const idx = M.CommunityRequest.schema.indexes().find(([k]) => k.fromId === 1 && k.toId === 1 && k.kind === 1);
  assert.ok(idx && idx[1].unique && idx[1].partialFilterExpression.status === 'pending');
  assert.ok(M.CommunityReport.schema.indexes().some(([k, o]) => o.unique && k.reporterId === 1 && k.targetType === 1));
});

test('money asks are caught in listings, normal volunteering text is not', () => {
  const bad = ['Pay a registration fee to join', 'send money to confirm your slot', 'use Western Union', 'mobile money deposit required', 'buy a gift card', 'pay upfront', 'share your bank details'];
  for (const t of bad) assert.equal(L.looksLikeMoneyAsk(t), true, t);
  const ok = ['Free weekend class for beginners', 'Help clean the riverbank. Bring gloves.', 'Tutoring is free, we need 3 tutors', 'Funded by a local charity'];
  for (const t of ok) assert.equal(L.looksLikeMoneyAsk(t), false, t);
  assert.throws(() => L.assertNoMoneyAsk({ a: 'fine', b: ['training fee required'] }), /cannot ask/);
});

test('listing schema: category, lengths, spots, no free status change', () => {
  const base = { category: 'tutoring', title: 'Maths help', description: 'Free maths help for students' };
  assert.equal(L.listingSchema.safeParse(base).success, true);
  assert.equal(L.listingSchema.safeParse({ ...base, category: 'selling' }).success, false);
  assert.equal(L.listingSchema.safeParse({ ...base, title: 'abc' }).success, false);
  assert.equal(L.listingSchema.safeParse({ ...base, spots: 0 }).success, false);
  assert.equal(L.listingSchema.safeParse({ ...base, spots: 101 }).success, false);
  assert.equal(L.listingPatchSchema.safeParse({ status: 'hidden' }).success, false);
  assert.equal(L.listingPatchSchema.safeParse({ status: 'closed' }).success, true);
});

test('volunteer log schema: hours range, date shape, sharing is optional', () => {
  const base = { title: 'River cleanup', hours: 2.5, date: '2026-10-10' };
  assert.equal(L.logSchema.safeParse(base).success, true);
  assert.equal(L.logSchema.safeParse({ ...base, hours: 0 }).success, false);
  assert.equal(L.logSchema.safeParse({ ...base, hours: 25 }).success, false);
  assert.equal(L.logSchema.safeParse({ ...base, date: '10/10/2026' }).success, false);
  assert.equal(L.logPatchSchema.safeParse({ shared: true }).success, true);
});

test('report schema accepts listings with a listingId', () => {
  const id = 'c'.repeat(24);
  assert.equal(L.reportSchema.safeParse({ targetType: 'listing', listingId: id, reason: 'asks_for_money' }).success, true);
  assert.equal(L.reportSchema.safeParse({ targetType: 'listing', groupId: id, reason: 'spam' }).success, false);
});

test('impact models: open by default, one pending interest per listing and person, sharing off by default', { skip: !M && 'mongoose not installed in this sandbox' }, async () => {
  const I = await import('../src/models/impact.model.js');
  const l = new I.ImpactListing({ ownerId: '6500000000000000000000a1', category: 'project', title: 'Community garden', description: 'Help plant a garden' });
  assert.equal(l.status, 'open');
  assert.equal(l.verified, false);
  assert.equal(l.audience, 'friends');
  assert.equal(l.validateSync(), undefined);
  const idx = I.ImpactInterest.schema.indexes().find(([k]) => k.listingId === 1 && k.fromId === 1);
  assert.ok(idx && idx[1].unique && idx[1].partialFilterExpression.status === 'pending');
  const e = new I.VolunteerLog({ userId: '6500000000000000000000a1', title: 'x', hours: 1, date: new Date() });
  assert.equal(e.shared, false);
});
