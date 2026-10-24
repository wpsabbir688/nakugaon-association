import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env } from './config/env.js';
import { prisma } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { membersRouter } from './routes/members.js';
import { vehiclesRouter } from './routes/vehicles.js';
import { weighbridgeRouter } from './routes/weighbridge.js';
import { paymentsRouter } from './routes/payments.js';
import { feeRulesRouter } from './routes/feeRules.js';
import { reportsRouter } from './routes/reports.js';
import { noticesRouter, settingsRouter, auditRouter } from './routes/notices.js';
import { adminRouter } from './routes/admin.js';
import { expensesRouter } from './routes/expenses.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  const v1 = express.Router();
  v1.use('/auth', authRouter);
  v1.use('/public', publicRouter);
  v1.use('/members', membersRouter);
  v1.use('/vehicles', vehiclesRouter);
  v1.use('/weighbridge', weighbridgeRouter);
  v1.use('/payments', paymentsRouter);
  v1.use('/fee-rules', feeRulesRouter);
  v1.use('/reports', reportsRouter);
  v1.use('/notices', noticesRouter);
  v1.use('/settings', settingsRouter);
  v1.use('/audit', auditRouter);
  v1.use('/admin', adminRouter);
  v1.use('/expenses', expensesRouter);
  app.use('/api/v1', v1);

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
