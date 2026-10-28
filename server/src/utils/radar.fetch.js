/**
 * Opportunity Radar: safe feed download.
 * Every connection (including each redirect) resolves DNS itself and refuses private or local addresses,
 * so a feed cannot be used to reach the server's own network. Size and time are capped.
 */
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { checkFeedUrl, isPrivateIp } from './radar.logic.js';

export const FETCH_LIMITS = { bytes: 1_500_000, ms: 10_000, redirects: 3 };

/** dns.lookup replacement used by the https request: validates every resolved address. */
export function guardedLookup(hostname, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs?.length || addrs.some((a) => isPrivateIp(a.address))) {
      const e = new Error('BLOCKED_ADDRESS');
      e.code = 'BLOCKED_ADDRESS';
      return cb(e);
    }
    if (options?.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

function once(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        protocol: 'https:',
        hostname: u.hostname.replace(/^\[|\]$/g, ''),
        port: 443,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        lookup: net.isIP(u.hostname) ? undefined : guardedLookup,
        headers: {
          'User-Agent': 'LifeOS-Radar/1.0 (+feed reader)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
          'Accept-Encoding': 'identity',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: String(res.headers.location) });
        }
        if (status !== 200) {
          res.resume();
          return reject(Object.assign(new Error(`HTTP_${status}`), { code: 'HTTP_STATUS', status }));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > FETCH_LIMITS.bytes) {
            req.destroy(Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' }));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      }
    );
    req.setTimeout(FETCH_LIMITS.ms, () => req.destroy(Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT' })));
    req.on('error', reject);
    req.end();
  });
}

/** Download a feed as text. Throws an Error whose `.friendly` is safe to show the user. */
export async function fetchFeedText(rawUrl) {
  let current = rawUrl;
  try {
    for (let hop = 0; hop <= FETCH_LIMITS.redirects; hop++) {
      const chk = checkFeedUrl(current);
      if (!chk.ok) throw Object.assign(new Error('BLOCKED_URL'), { friendly: chk.reason });
      const r = await once(chk.url);
      if (r.body !== undefined) return r.body;
      current = new URL(r.redirect, chk.url).toString();
    }
    throw Object.assign(new Error('TOO_MANY_REDIRECTS'), { friendly: 'That address redirects too many times.' });
  } catch (err) {
    if (err.friendly) throw err;
    const map = {
      BLOCKED_ADDRESS: 'That address points to a private or local place, so it is not allowed.',
      TOO_LARGE: 'That feed is too large (limit about 1.5 MB).',
      TIMEOUT: 'That site took too long to answer.',
      HTTP_STATUS: `The site answered with an error (${err.status}). Check the address.`,
      ENOTFOUND: 'That address could not be found.',
    };
    err.friendly = map[err.code] || 'Could not download that feed. Check the address and try again.';
    throw err;
  }
}
