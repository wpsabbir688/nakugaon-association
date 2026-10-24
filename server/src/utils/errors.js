export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const badRequest = (message, code = 'VALIDATION_ERROR') => new ApiError(400, code, message);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT') => new ApiError(409, code, message);
export const unprocessable = (message, code = 'UNPROCESSABLE') => new ApiError(422, code, message);
