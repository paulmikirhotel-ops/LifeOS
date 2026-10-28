import { env } from '../config/env.js';

/**
 * Startup configuration report. Prints ONLY variable names (never values) so a missing or empty setting is
 * obvious in the terminal instead of surfacing later as a silent "transcript never appeared".
 */
export function reportEnvironment() {
  const s = env.storage;
  const groups = [
    {
      feature: 'Database',
      required: [['MONGODB_URI', Boolean(process.env.MONGODB_URI)]],
    },
    {
      feature: 'Recording storage (Backblaze B2 / S3)',
      required: [
        ['STORAGE_ENDPOINT', Boolean(s.endpoint)],
        ['STORAGE_REGION', Boolean(process.env.STORAGE_REGION)],
        ['STORAGE_BUCKET', Boolean(s.bucket)],
        ['STORAGE_ACCESS_KEY', Boolean(s.accessKeyId)],
        ['STORAGE_SECRET_KEY', Boolean(s.secretAccessKey)],
      ],
      skip: s.driver === 'local',
    },
    {
      feature: 'Transcription (speech-to-text)',
      required: [
        ['STT_PROVIDER (deepgram)', env.stt.provider === 'deepgram'],
        ['STT_API_KEY', Boolean(env.stt.apiKey)],
      ],
    },
    {
      feature: 'AI summary',
      required: [
        ['AI_PROVIDER (anthropic | openai)', ['anthropic', 'openai'].includes(env.ai.provider)],
        ['AI_API_KEY', Boolean(env.ai.apiKey)],
        ...(env.ai.provider === 'openai' ? [['AI_MODEL', Boolean(env.ai.model)]] : []),
      ],
    },
    {
      feature: 'Video rooms (LiveKit)',
      required: [
        ['LIVEKIT_URL', Boolean(env.livekit.url)],
        ['LIVEKIT_API_KEY', Boolean(env.livekit.apiKey)],
        ['LIVEKIT_API_SECRET', Boolean(env.livekit.apiSecret)],
      ],
    },
  ];

  console.log(`[env] storage driver: ${s.driver}${s.driver === 'local' ? ' (development only: files stay on this computer)' : ''}`);
  console.log(`[env] STT_BATCH=${env.stt.batch} STT_LIVE=${env.stt.live} CLIENT_URL origins: ${env.clientUrls.join(', ')}`);
  for (const g of groups) {
    if (g.skip) continue;
    const missing = g.required.filter(([, ok]) => !ok).map(([name]) => name);
    if (!missing.length) console.log(`[env] ${g.feature}: OK`);
    else {
      console.warn(`[env] ${g.feature}: NOT READY`);
      for (const name of missing) console.warn(`Missing environment variable: ${name}`);
    }
  }
}
