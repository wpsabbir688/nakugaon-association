import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { signAccessToken, signRefreshToken, hashToken, refreshCookieOptions, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { unauthorized, badRequest } from '../utils/errors.js';
import { audit } from '../services/ledgerService.js';

export const authRouter = express.Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const resetRequestSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(10), password: z.string().min(8).max(128) });

async function memberPublicIdOf(user) {
  if (!user.memberId) return null;
  const m = await prisma.member.findUnique({ where: { id: user.memberId }, select: { memberId: true } });
  return m?.memberId || null;
}

function authUserShape(user, memberPublicId) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.memberId, memberPublicId };
}

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) throw unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid credentials');
  const refresh = signRefreshToken(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: hashToken(refresh) } });
  res.cookie('nakugaon_refresh', refresh, refreshCookieOptions());
  await audit({ actor: user.id, actorName: user.name, action: 'user.login', entity: 'User', entityId: user.id, ipAddress: req.ip });
  res.json({ user: authUserShape(user, await memberPublicIdOf(user)), accessToken: signAccessToken(user) });
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.nakugaon_refresh;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtRefreshSecret);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.refreshTokenHash !== hashToken(token)) throw unauthorized();
  const next = signRefreshToken(user);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: hashToken(next) } });
  res.cookie('nakugaon_refresh', next, refreshCookieOptions());
  res.json({ accessToken: signAccessToken(user) });
}));

authRouter.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { refreshTokenHash: null } });
  res.clearCookie('nakugaon_refresh', { path: '/api/v1/auth' });
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: authUserShape(req.user, await memberPublicIdOf(req.user)) });
}));

// Password reset: token is stored hashed with a 1-hour expiry. Email delivery
// requires SMTP configuration (see README); without it the request is logged
// and the generic response below is returned — tokens are never exposed via API.
authRouter.post('/request-reset', authLimiter, validate({ body: resetRequestSchema }), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email.toLowerCase() } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: hashToken(token), resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    console.log(`[password-reset] Token issued for ${user.email}. Email provider not configured — deliver this token through a verified channel; it is NOT returned by this API.`);
  }
  res.json({ message: 'If an account exists for this email, reset instructions have been issued.' });
}));

authRouter.post('/reset-password', validate({ body: resetSchema }), asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(req.body.token), resetTokenExpiresAt: { gt: new Date() } } });
  if (!user) throw badRequest('Invalid or expired reset token');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(req.body.password, 12), resetTokenHash: null, resetTokenExpiresAt: null, refreshTokenHash: null } });
  res.json({ ok: true });
}));
