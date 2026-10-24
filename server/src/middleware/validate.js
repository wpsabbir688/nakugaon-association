import { z } from 'zod';
import { badRequest } from '../utils/errors.js';

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body);
      if (query) req.query = query.parse(req.query);
      if (params) req.params = params.parse(req.params);
      return next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(badRequest(err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
      }
      return next(err);
    }
  };
}

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional().default(''),
});

export function paginate(query) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}

// Case-insensitive substring search across the given fields. Prisma
// parameterizes these values, so search input cannot inject operators.
export function searchFilter(text, fields) {
  if (!text) return undefined;
  return {
    OR: fields.map((f) => ({ [f]: { contains: text, mode: 'insensitive' } })),
  };
}
