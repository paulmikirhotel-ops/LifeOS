import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

/**
 * Central error handler — converts every thrown error into the standard envelope:
 *   { success: false, message, code?, errors? }
 * Handles: ApiError, Zod validation, Mongoose cast/validation/duplicate-key,
 * Multer file errors, oversized payloads, and unexpected 500s.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by its 4-arity.
export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || null;
  let errors = err.errors || [];

  if (err instanceof ApiError) {
    // Already structured — keep as-is.
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    errors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = `Invalid value for "${err.path}"`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (err && err.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    const key = err.keyValue ? Object.keys(err.keyValue)[0] : null;
    message = key
      ? `A record with this ${key} already exists`
      : 'Duplicate value violates a unique constraint';
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    code = 'FILE_ERROR';
    message = err.message;
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body exceeds the size limit';
  } else {
    // Unexpected error — log it, and never leak internals in production.
    statusCode = 500;
    code = 'INTERNAL_ERROR';
    if (!env.isProd) {
      message = err.message || 'Internal server error';
    } else {
      message = 'Internal server error';
    }
  }

  if (statusCode >= 500) {
    console.error(`[error] ${err.stack || err.message}`);
  }

  const body = { success: false, message };
  if (code) body.code = code;
  if (errors.length > 0) body.errors = errors;

  res.status(statusCode).json(body);
}
