import { spawn } from 'node:child_process';
import mongoose from 'mongoose';

const MONGODB_URI_TEST = process.env.MONGODB_URI_TEST;

export async function wipeDB() {
  if (!MONGODB_URI_TEST) return;
  const uri = MONGODB_URI_TEST.endsWith('/')
    ? `${MONGODB_URI_TEST}lifeos_test`
    : `${MONGODB_URI_TEST}/lifeos_test`;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

export async function boot() {
  const port = Math.floor(Math.random() * 1000) + 4000;
  const uri = MONGODB_URI_TEST.endsWith('/')
    ? `${MONGODB_URI_TEST}lifeos_test`
    : `${MONGODB_URI_TEST}/lifeos_test`;

  const child = spawn('node', ['src/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: port.toString(),
      MONGODB_URI: uri,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-lifeos-2026',
      JWT_REFRESH_SECRET: 'test-refresh-secret-key-lifeos-2026',
    },
  });

  const baseUrl = `http://localhost:${port}/api`;

  // Wait for server ready
  let ready = false;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch (err) {
      // Server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!ready) {
    child.kill();
    throw new Error('Server failed to start within 30s');
  }

  return {
    baseUrl,
    stop: async () => {
      child.kill();
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    },
  };
}

export async function request(baseUrl, path, { method = 'GET', body, cookies, query } = {}) {
  let url = `${baseUrl}${path}`;
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookieStr = setCookie.join('; ');

  let json;
  try {
    json = await res.json();
  } catch (err) {
    json = null;
  }

  return { status: res.status, json, cookies: cookieStr, headers: res.headers };
}

export async function registerUser(baseUrl, { name, email, password, tenantType, organizationName }) {
  const res = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: { name, email, password, tenantType, organizationName },
  });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Registration failed (${res.status}): ${JSON.stringify(res.json)}`);
  }

  // Registration auto-logs-in, so we get cookies.
  // We also need to extract tenantId for some tests if needed, but usually it's in req.user.
  return {
    cookies: res.cookies,
    userId: res.json.data.user.id,
    tenantId: res.json.data.user.activeTenantId,
    json: res.json.data,
  };
}

let counter = 0;
export function uniqueEmail() {
  return `a${Date.now()}${counter++}@test.dev`;
}
