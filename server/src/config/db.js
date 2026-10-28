import mongoose from 'mongoose';
import { env, redactMongoUri } from './env.js';

const MONGOOSE_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
  // Atlas / routers silently drop idle TCP connections; the next query on that socket then fails with
  // "read ECONNRESET". Closing idle sockets ourselves first (and probing more often) avoids most of them.
  maxIdleTimeMS: 60_000,
  heartbeatFrequencyMS: 10_000,
  socketTimeoutMS: 120_000,
};

function attachConnectionListeners() {
  mongoose.connection.on('connected', () => {
    console.log(`[db] connected to ${redactMongoUri(env.mongoUri)}`);
  });
  mongoose.connection.on('error', (err) => {
    console.error(`[db] connection error: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });
}

/**
 * Connects to MongoDB. Throws if the initial connection fails
 * (caller decides whether to exit or keep serving /api/health).
 */
export async function connectDB() {
  attachConnectionListeners();
  await mongoose.connect(env.mongoUri, MONGOOSE_OPTIONS);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export function dbState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}
