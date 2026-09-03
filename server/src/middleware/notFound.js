import { ApiError } from '../utils/ApiError.js';

/** 404 for unmatched API routes (kept inside /api so it never swallows other responses). */
export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}
