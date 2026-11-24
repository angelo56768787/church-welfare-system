import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { assertEnv } from './config/env.js';
import { connectDb } from './config/db.js';
import { errorHandler } from './middleware/index.js';
import { auth, users, churches, beneficiaries, auditRoutes, settings } from './modules/routes1.js';
import { loans, repayments, assistance } from './modules/routes2.js';
import { dashboard, reports } from './modules/routes3.js';
import { seedAdmin } from './scripts/seedAdmin.js';

let bootstrap: Promise<void> | null = null;
/** Once per cold start (serverless has no separate boot step): ensure the admin exists, optionally load demo data. */
async function ensureBootstrap() {
  if (!bootstrap) {
    bootstrap = (async () => {
      await seedAdmin();
      if (process.env.SEED_DEMO === '1') await (await import('./scripts/seedDemo.js')).seedDemo();
    })().catch((e) => { bootstrap = null; throw e; });
  }
  return bootstrap;
}

export function createApp() {
  assertEnv();
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get('/api/health', (_q, r) => r.json({ ok: true }));
  app.use(async (_req, _res, next) => { try { await connectDb(); if (process.env.NODE_ENV !== 'test') await ensureBootstrap(); next(); } catch (e) { next(e); } });
  app.use('/api/auth', auth);
  app.use('/api/users', users);
  app.use('/api/churches', churches);
  app.use('/api/beneficiaries', beneficiaries);
  app.use('/api/loans', loans);
  app.use('/api/repayments', repayments);
  app.use('/api/assistance', assistance);
  app.use('/api/dashboard', dashboard);
  app.use('/api/reports', reports);
  app.use('/api/audit', auditRoutes);
  app.use('/api/settings', settings);
  app.use('/api', (_q, r) => r.status(404).json({ error: 'المسار غير موجود' }));
  app.use(errorHandler);
  return app;
}
