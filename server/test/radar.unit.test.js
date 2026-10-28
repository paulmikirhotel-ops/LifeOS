/**
 * Opportunity Radar: pure logic, address safety, feed reading, models. No database, no internet.
 *   node --test test/radar.unit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const L = await import('../src/utils/radar.logic.js');
const F = await import('../src/utils/radar.fetch.js');
const M = await import('../src/models/radar.model.js').catch((e) => (e.code === 'ERR_MODULE_NOT_FOUND' ? null : Promise.reject(e)));

const NOW = new Date('2026-10-14T10:00:00Z');
const DAY = 86400000;

test('private, local and reserved IPs are refused; public ones pass', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'ff02::1', 'nonsense'])
    assert.equal(L.isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '151.101.1.1', '2606:4700:4700::1111']) assert.equal(L.isPrivateIp(ip), false, ip);
});

test('checkFeedUrl allows only public https on the standard port', () => {
  assert.equal(L.checkFeedUrl('https://example.org/feed.xml#x').url, 'https://example.org/feed.xml');
  const bad = ['http://example.org/feed', 'ftp://example.org/f', 'javascript:alert(1)', 'https://localhost/f', 'https://foo.local/f', 'https://intranet/f', 'https://127.0.0.1/f', 'https://[::1]/f', 'https://169.254.169.254/latest', 'https://user:pw@example.org/f', 'https://example.org:8443/f', 'not a url', 'https://x.internal/f', 'https://10.0.0.5/f'];
  for (const u of bad) assert.equal(L.checkFeedUrl(u).ok, false, u);
  assert.equal(L.checkFeedUrl('https://example.org/' + 'a'.repeat(600)).ok, false);
});

test('guardedLookup refuses names that resolve to local addresses', async () => {
  const err = await new Promise((res) => F.guardedLookup('localhost', {}, (e) => res(e)));
  assert.equal(err?.code, 'BLOCKED_ADDRESS');
});

test('fetchFeedText refuses unsafe addresses before connecting', async () => {
  await assert.rejects(F.fetchFeedText('https://127.0.0.1/feed'), (e) => /private or local/.test(e.friendly));
  await assert.rejects(F.fetchFeedText('http://example.org/feed'), (e) => /secure/.test(e.friendly));
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Careers &amp; Grants</title>
<item><title><![CDATA[Junior React Developer (remote)]]></title><link>https://jobs.example.com/p/1</link><guid>g1</guid>
 <pubDate>Mon, 12 Oct 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>We are <b>hiring</b>. Deadline: 30 October 2026. Apply on our site.</p>]]></description></item>
<item><title>Tuition Scholarship for Women in STEM</title><link>https://uni.example.edu/s/2</link>
 <description>Closing date: November 15, 2026. Covers tuition.</description></item>
<item><title>Community Seed Grant</title><link>https://fund.example.org/g/3</link><deadline>2026-12-01</deadline><description>Small grants for local projects</description></item>
<item><title>Old post</title><link>https://x.example.org/old</link><pubDate>Mon, 01 Jan 2024 08:00:00 GMT</pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
<item><link>https://x.example.org/notitle</link></item>
</channel></rss>`;

test('parseFeed reads RSS, strips HTML, drops unsafe links, takes deadlines only from the feed', () => {
  const f = L.parseFeed(RSS, { now: NOW });
  assert.equal(f.title, 'Careers & Grants');
  assert.equal(f.items.length, 4); // javascript: link and title-less item dropped
  const [job, sch, grant, old] = f.items;
  assert.equal(job.title, 'Junior React Developer (remote)');
  assert.equal(job.domain, 'jobs.example.com');
  assert.ok(!/[<>]/.test(job.summary));
  assert.equal(job.type, 'job');
  assert.equal(job.typeGuessed, true);
  assert.equal(job.deadline.toISOString().slice(0, 10), '2026-10-30');
  assert.equal(sch.type, 'scholarship');
  assert.equal(sch.deadline.toISOString().slice(0, 10), '2026-11-15');
  assert.equal(grant.type, 'grant');
  assert.equal(grant.deadline.toISOString().slice(0, 10), '2026-12-01');
  assert.equal(old.deadline, null); // never invented
});

test('a type chosen on the source overrides guessing and is not labelled as guessed', () => {
  const f = L.parseFeed(RSS, { now: NOW, sourceType: 'other' });
  assert.ok(f.items.every((i) => i.type === 'other' && i.typeGuessed === false));
});

test('parseFeed reads Atom', () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Fund news</title>
  <entry><title>Research fellowship 2027</title><id>urn:1</id><link rel="alternate" href="https://f.example.org/a?x=1&amp;y=2"/><link rel="self" href="https://f.example.org/self"/>
  <updated>2026-10-10T00:00:00Z</updated><summary>Apply by 20 November 2026</summary></entry></feed>`;
  const f = L.parseFeed(atom, { now: NOW });
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].link, 'https://f.example.org/a?x=1&y=2');
  assert.equal(f.items[0].type, 'scholarship');
  assert.equal(f.items[0].deadline.toISOString().slice(0, 10), '2026-11-20');
});

test('parseFeed rejects non-feeds and does not expand entities', () => {
  assert.throws(() => L.parseFeed('<html><body>hello</body></html>'), /NOT_A_FEED/);
  const evil = `<!DOCTYPE x [<!ENTITY a "AAAA">]><rss><channel><title>t</title><item><title>&a; hi</title><link>https://e.example.org/1</link></item></channel></rss>`;
  assert.equal(L.parseFeed(evil).items[0].title, '&a; hi');
});

test('parseFeed caps the number of items', () => {
  const many = '<rss><channel>' + Array.from({ length: 400 }, (_, i) => `<item><title>t${i}</title><link>https://e.example.org/${i}</link></item>`).join('') + '</channel></rss>';
  assert.equal(L.parseFeed(many).items.length, L.LIMITS.itemsPerSource);
});

test('parseDateLoose handles common formats and refuses ambiguous or impossible ones', () => {
  assert.equal(L.parseDateLoose('1st Dec 2026').toISOString().slice(0, 10), '2026-12-01');
  assert.equal(L.parseDateLoose('Sept 9, 2026').toISOString().slice(0, 10), '2026-09-09');
  assert.equal(L.parseDateLoose('05/06/2026'), null);
  assert.equal(L.parseDateLoose('31 February 2026'), null);
});

test('matching: whole words only, title counts more than summary', () => {
  const kw = L.normalizeKeywords(['  React ', 'react', 'design', 'ai', '', 'x']);
  assert.deepEqual(kw, ['react', 'design', 'ai']);
  const m = L.matchItem({ title: 'Junior React Developer', summary: 'We need design skills' }, kw);
  assert.deepEqual(m.matched, ['react', 'design']);
  assert.equal(m.score, 3);
  assert.equal(L.matchItem({ title: 'Maintain the chair', summary: 'said' }, ['ai']).score, 0); // "ai" inside words does not match
  assert.equal(L.normalizeKeywords(Array.from({ length: 50 }, (_, i) => 'kw' + i)).length, L.LIMITS.keywords);
});

test('expiry: past deadline hidden, today still shown, undated items go stale after 60 days', () => {
  assert.equal(L.isExpired({ deadline: new Date(NOW.getTime() - 2 * DAY) }, NOW), true);
  assert.equal(L.isExpired({ deadline: new Date('2026-10-14T23:59:59Z') }, NOW), false);
  assert.equal(L.isExpired({ publishedAt: new Date(NOW.getTime() - 90 * DAY) }, NOW), true);
  assert.equal(L.isExpired({ publishedAt: new Date(NOW.getTime() - 10 * DAY) }, NOW), false);
  assert.equal(L.isExpired({}, NOW), false);
  assert.equal(L.closingSoon({ deadline: new Date(NOW.getTime() + 3 * DAY) }, NOW), true);
  assert.equal(L.closingSoon({ deadline: new Date(NOW.getTime() + 30 * DAY) }, NOW), false);
  assert.equal(L.daysLeft({ deadline: new Date('2026-10-17T23:59:59Z') }, NOW), 4);
  assert.equal(L.daysLeft({}, NOW), null);
});

test('rankItems: best match, then soonest deadline, then newest', () => {
  const r = L.rankItems([
    { id: 'a', score: 0, deadline: null, publishedAt: new Date('2026-10-13') },
    { id: 'b', score: 2, deadline: new Date('2026-12-01'), publishedAt: new Date('2026-10-01') },
    { id: 'c', score: 2, deadline: new Date('2026-11-01'), publishedAt: new Date('2026-10-01') },
    { id: 'd', score: 0, deadline: null, publishedAt: new Date('2026-10-14') },
  ]).map((x) => x.id);
  assert.deepEqual(r, ['c', 'b', 'd', 'a']);
});

test('safeItemLink only allows http(s)', () => {
  assert.equal(L.safeItemLink('javascript:alert(1)'), null);
  assert.equal(L.safeItemLink('data:text/html,hi'), null);
  assert.equal(L.safeItemLink('https://www.Example.org/p').domain, 'example.org');
});

test('models: items are unique per source+hash and state defaults to new', { skip: !M && 'mongoose not installed in this sandbox' }, () => {
  const it = new M.RadarItem({ tenantId: '6500000000000000000000a1', userId: '6500000000000000000000a2', sourceId: '6500000000000000000000a3', hash: 'h', title: 't', link: 'https://e.example.org/1' });
  assert.equal(it.state, 'new');
  assert.equal(it.validateSync(), undefined);
  assert.equal(new M.RadarItem({ ...it.toObject(), state: 'bogus' }).validateSync()?.errors?.state?.name, 'ValidatorError');
  assert.ok(M.RadarItem.schema.indexes().some(([k, o]) => o.unique && k.sourceId === 1 && k.hash === 1));
});

test('daily AI limit is clamped', () => {
  assert.equal(L.dailyLimit(undefined), 10);
  assert.equal(L.dailyLimit('0'), 1);
  assert.equal(L.dailyLimit('9999'), 100);
});
