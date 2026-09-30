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
  },
  meetings: {
    chunkMaxBytes: parseInt(process.env.MEETING_CHUNK_MAX_MB || '3', 10) * 1024 * 1024,
    maxRecordingBytes: parseInt(process.env.MEETING_MAX_RECORDING_MB || '500', 10) * 1024 * 1024,
    maxChunks: 20000,
  },
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'LifeOS <no-reply@lifeos.local>',
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
