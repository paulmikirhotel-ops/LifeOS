import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

if (isProd) {
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL'];
  const missing = requiredVars.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
}

export const env = {
  nodeEnv,
  isProd,
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lifeos',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-change-me-too',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  // Comma-separated list of allowed frontend origins for CORS.
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  security: {
    // When true, features that email other people (invites) or spend AI budget require a verified email.
    // Off by default so installs without working SMTP are not locked out.
    requireVerifiedEmail: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
  },
  cookie: {
    // Secure cookies require HTTPS — enabled automatically in production.
    secure: isProd || process.env.COOKIE_SECURE === 'true',
  },
  // ── Meetings: storage, speech-to-text, AI (all secrets stay server-side) ──
  storage: {
    // 's3' = any S3-compatible store (Cloudflare R2 recommended); 'local' = dev only.
    driver: process.env.STORAGE_DRIVER || (process.env.STORAGE_BUCKET ? 's3' : 'local'),
    endpoint: process.env.STORAGE_ENDPOINT || '',
    region: process.env.STORAGE_REGION || 'auto',
    bucket: process.env.STORAGE_BUCKET || '',
    accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
    secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
    allowLocalInProd: process.env.ALLOW_LOCAL_STORAGE === 'true',
  },
  stt: {
    provider: process.env.STT_PROVIDER || 'none', // 'deepgram' | 'none'
    apiKey: process.env.STT_API_KEY || '',
    model: process.env.STT_MODEL || 'nova-3',
    language: process.env.STT_LANGUAGE || 'en',
    live: process.env.STT_LIVE !== 'false', // near-live transcript while recording
    batch: process.env.STT_BATCH !== 'false', // diarized full-recording pass after the meeting
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'none', // 'anthropic' | 'openai' (any OpenAI-compatible API) | 'none'
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    baseUrl: process.env.AI_BASE_URL || '',
    maxTokensParam: process.env.AI_MAX_TOKENS_PARAM || 'max_tokens',
    // Only for "reasoning" models behind an OpenAI-compatible API (e.g. gpt-oss on Groq). They think before answering and that
    // hidden thinking counts against the answer limit. low|medium|high; empty = do not send the setting.
    reasoningEffort: ['low', 'medium', 'high'].includes(process.env.AI_REASONING_EFFORT) ? process.env.AI_REASONING_EFFORT : '',
    // Multiplies every answer limit (1 = unchanged, max 8). Use 3-4 for reasoning models.
    tokenMultiplier: Math.min(8, Math.max(1, parseFloat(process.env.AI_TOKEN_MULTIPLIER || '1') || 1)),
    // Free AI plans limit how much you can send per minute. These two keep LifeOS under such limits:
    //  chunkChars     = how much transcript goes in ONE request (24000 chars is about 6000 tokens)
    //  minIntervalMs  = minimum pause between two AI requests
    chunkChars: Math.min(60000, Math.max(3000, parseInt(process.env.AI_CHUNK_CHARS || '24000', 10) || 24000)),
    minIntervalMs: Math.min(60000, Math.max(0, parseInt(process.env.AI_MIN_INTERVAL_MS || '0', 10) || 0)),
  },
  // ── Meeting invitation links ──
  invite: {
    // Keys the link tokens + meeting passes. Falls back to JWT_SECRET; set its own value in production
    // (changing it invalidates every existing invitation link).
    tokenSecret: process.env.INVITE_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-only-change-me',
    passTtl: process.env.MEETING_PASS_TTL || '12h',
  },
  // ── Video rooms (LiveKit Cloud or self-hosted). All three must be set to switch video on. ──
  livekit: {
    url: process.env.LIVEKIT_URL || '', // e.g. wss://your-project.livekit.cloud
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },
  meetings: {
    chunkMaxBytes: parseInt(process.env.MEETING_CHUNK_MAX_MB || '3', 10) * 1024 * 1024,
    maxRecordingBytes: parseInt(process.env.MEETING_MAX_RECORDING_MB || '500', 10) * 1024 * 1024,
    maxChunks: 100000, // 20 recording segments of 5000 chunks each
  },
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'LifeOS <no-reply@lifeos.local>',
  // Public address of THIS server, used for links inside emails that hit the API (e.g. unsubscribe).
  serverPublicUrl: (process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || '5000'}`).replace(/\/$/, ''),
};

/** Redacts credentials from a MongoDB URI for safe logging. */
export function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<unparseable-uri>';
  }
}