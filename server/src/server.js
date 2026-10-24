import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { ensureReferenceData } from './services/referenceData.js';

const app = createApp();
connectDb()
  .then(async () => {
    await ensureReferenceData();
    app.listen(env.port, () => console.log(`Nakugaon API listening on :${env.port}`));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
