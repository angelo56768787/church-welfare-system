import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { seedAdmin } from './scripts/seedAdmin.js';

const app = createApp();
connectDb().then(async () => {
  if (env.useMemoryDb) {
    await seedAdmin();
    if (process.env.SEED_DEMO === '1') await (await import('./scripts/seedDemo.js')).seedDemo();
  }
  app.listen(env.port, () => console.log(`API on http://localhost:${env.port}`));
});
