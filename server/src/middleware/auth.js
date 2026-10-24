import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { User, ROLE_PERMISSIONS } from '../models/User.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtAccessSecret, { expiresIn: '15m' });
}
export function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), type: 'refresh' }, env.jwtRefreshSecret, { expiresIn: '7d' });
}
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function refreshCookieOptions() {
  const isProd = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    // Production frontend (Vercel/Netlify) and API live on different origins,
    // so the refresh cookie must be SameSite=None + Secure to be sent with
    // cross-site API calls. Local dev stays lax (no HTTPS needed).
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(unauthorized());
    const payload = jwt.verify(token, env.jwtAccessSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return next(unauthorized());
    req.user = user;
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
}

export function requirePermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const granted = ROLE_PERMISSIONS[req.user.role] || [];
    if (granted.includes('*')) return next();
    const ok = permissions.every((p) => granted.includes(p));
    if (!ok) return next(forbidden('Your role does not allow this operation'));
    return next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('Your role does not allow this operation'));
    return next();
  };
}

// A MEMBER user may only touch their own linked member record.
export function requireOwnMemberOrStaff(param = 'memberId') {
  return async (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== 'MEMBER') return next();
    const { Member } = await import('../models/Member.js');
    const member = await Member.findOne({ memberId: req.params[param] });
    if (!member || !req.user.memberId || !req.user.memberId.equals(member._id)) {
      return next(forbidden('Members can only access their own records'));
    }
    return next();
  };
}
