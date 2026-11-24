import mongoose from 'mongoose';
import { env } from './env.js';

let cached: Promise<typeof mongoose> | null = null;

/** Serverless-safe connection: reused across warm invocations. */
export async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!cached) {
    mongoose.set('strictQuery', true);
    let uri = env.mongoUri;
    if (env.useMemoryDb) {
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      uri = rs.getUri();
      console.log('[db] in-memory MongoDB replica set started');
    }
    cached = mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, maxPoolSize: 10 });
  }
  try {
    return await cached;
  } catch (e) {
    cached = null;
    throw e;
  }
}
