// Environment configuration. All secrets come from the environment only.
// Production must use the DIRECT (non-pooled) Postgres connection string:
// PgBouncer transaction-mode pooling breaks Prisma interactive transactions,
// which this app relies on for every multi-write financial operation.
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://nakugaon:nakugaon_dev_local@127.0.0.1:5432/nakugaon_dev',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-only-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-refresh-secret-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  emailFrom: process.env.EMAIL_FROM || 'Nakugaon Association <no-reply@example.com>',
};
export const isProduction = env.nodeEnv === 'production';
