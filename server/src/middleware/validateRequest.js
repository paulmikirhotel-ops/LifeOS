import { ApiError } from '../utils/ApiError.js';

/**
 * validateRequest(schema, source='body') — zod parse middleware.
 * Fails with 400 VALIDATION_ERROR + field-level errors.
 */
export function validateRequest(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (result.success) {
      // Express 5 exposes req.query / req.params as GETTER-ONLY properties —
      // plain assignment throws ("Cannot set property query of #<IncomingMessage>").
      // Defining an own property shadows the getter and keeps downstream
      // code reading req.query / req.body unchanged.
      Object.defineProperty(req, source, {
        value: result.data,
        configurable: true,
        enumerable: true,
        writable: true,
      });
      return next();
    }
    next(
      new ApiError(400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    );
  };
}
