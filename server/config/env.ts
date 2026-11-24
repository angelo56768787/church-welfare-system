import 'dotenv/config';

export const env = {
  mongoUri: process.env.MONGODB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  adminName: process.env.ADMIN_NAME ?? 'مدير النظام',
  useMemoryDb: process.env.USE_MEMORY_DB === '1',
};

export function assertEnv() {
  if (!env.useMemoryDb && !env.mongoUri) throw new Error('MONGODB_URI is required');
  if (!env.jwtSecret || env.jwtSecret.length < 24) throw new Error('JWT_SECRET (24+ chars) is required');
}
