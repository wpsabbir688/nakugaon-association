import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { z } from 'zod';
import { User } from '../models/User.js';
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

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !user.isActive) throw unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid credentials');
  const refresh = signRefreshToken(user);
  user.refreshTokenHash = hashToken(refresh);
  await user.save();
  res.cookie('nakugaon_refresh', refresh, refreshCookieOptions());
  await audit({ actor: user._id, actorName: user.name, action: 'user.login', entity: 'User', entityId: user._id.toString(), ipAddress: req.ip });
  let memberPublicId = null;
  if (user.memberId) {
    const { Member } = await import('../models/Member.js');
    const m = await Member.findById(user.memberId).select('memberId');
    memberPublicId = m?.memberId || null;
  }
  res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, memberId: user.memberId, memberPublicId }, accessToken: signAccessToken(user) });
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.nakugaon_refresh;
  if (!token) throw unauthorized();
  let payload;
  try {
    const jwt = (await import('jsonwebtoken')).default;
    payload = jwt.verify(token, (await import('../config/env.js')).env.jwtRefreshSecret);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user || !user.isActive || user.refreshTokenHash !== hashToken(token)) throw unauthorized();
  const next = signRefreshToken(user);
  user.refreshTokenHash = hashToken(next);
  await user.save();
  res.cookie('nakugaon_refresh', next, refreshCookieOptions());
  res.json({ accessToken: signAccessToken(user) });
}));

authRouter.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  req.user.refreshTokenHash = null;
  await req.user.save();
  res.clearCookie('nakugaon_refresh', { path: '/api/v1/auth' });
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  let memberPublicId = null;
  if (req.user.memberId) {
    const { Member } = await import('../models/Member.js');
    const m = await Member.findById(req.user.memberId).select('memberId');
    memberPublicId = m?.memberId || null;
  }
  res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, memberId: req.user.memberId, memberPublicId } });
}));

// Password reset: token is stored hashed with a 1-hour expiry. Email delivery
// requires SMTP configuration (see README); without it the request is logged
// and the generic response below is returned — tokens are never exposed via API.
authRouter.post('/request-reset', authLimiter, validate({ body: resetRequestSchema }), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    console.log(`[password-reset] Token issued for ${user.email}. Email provider not configured — deliver this token through a verified channel; it is NOT returned by this API.`);
  }
  res.json({ message: 'If an account exists for this email, reset instructions have been issued.' });
}));

authRouter.post('/reset-password', validate({ body: resetSchema }), asyncHandler(async (req, res) => {
  const user = await User.findOne({ resetTokenHash: hashToken(req.body.token), resetTokenExpiresAt: { $gt: new Date() } }).select('+resetTokenHash +resetTokenExpiresAt');
  if (!user) throw badRequest('Invalid or expired reset token');
  user.passwordHash = await bcrypt.hash(req.body.password, 12);
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  user.refreshTokenHash = null;
  await user.save();
  res.json({ ok: true });
}));
