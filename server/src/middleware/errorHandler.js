import { ApiError } from '../utils/errors.js';

// Never leak stack traces or internals to clients.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with this unique value already exists' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
