import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { User } from '../models/index.js';

export async function seedAdmin() {
  if (!env.adminPassword) throw new Error('ADMIN_PASSWORD is required to create the first admin');
  const exists = await User.findOne({ username: env.adminUsername.toLowerCase() });
  if (exists) { console.log('[seed] admin already exists'); return; }
  await User.create({ name: env.adminName, username: env.adminUsername, passwordHash: await bcrypt.hash(env.adminPassword, 12), role: 'admin' });
  console.log(`[seed] admin "${env.adminUsername}" created`);
}

if (process.argv[1]?.endsWith('seedAdmin.ts')) {
  connectDb().then(seedAdmin).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
