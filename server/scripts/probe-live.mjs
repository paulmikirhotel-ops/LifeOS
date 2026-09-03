/* Read-only live probe: calls the RUNNING API on localhost:5000 exactly like the
   Finance page does, using a freshly minted dev token. Prints status + body shape. */
import jwt from 'jsonwebtoken';

const BASE = 'http://localhost:5000/api';
const USER_ID = '6a982ce39738bf980c5eb29e'; // admin@gmail.com
// .env has no JWT_SECRET -> the running server uses the dev fallback from env.js
const DEV_SECRET = process.env.PROBE_SECRET || 'dev-only-change-me';

const token = jwt.sign({ sub: USER_ID }, DEV_SECRET, { expiresIn: '10m' });

async function probe(label, path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    const data = body?.data;
    let shape;
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      if (Array.isArray(data.items)) {
        shape = `items[]=${data.items.length} first=${JSON.stringify(data.items[0] || null).slice(0, 220)}`;
      } else {
        shape = keys.map((k) => `${k}=${JSON.stringify(data[k]).slice(0, 120)}`).join('\n        ');
      }
    } else {
      shape = JSON.stringify(body).slice(0, 300);
    }
    console.log(`\n=== ${label}: GET ${path} -> HTTP ${res.status}`);
    console.log(`    ${shape}`);
  } catch (err) {
    console.log(`\n=== ${label}: GET ${path} -> REQUEST FAILED: ${err.message}`);
  }
}

await probe('health', '/health');
await probe('categories', '/finance/categories');
await probe('income list', '/finance/income');
await probe('summary', '/finance/summary?range=month');
await probe('expenses', '/finance/expenses');
await probe('dashboard', '/analytics/dashboard');
