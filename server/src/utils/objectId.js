import mongoose from 'mongoose';

/** Throws 400 when the id is not a valid ObjectId (keeps queries safe). */
export function assertObjectId(id, field = 'id') {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error(`Invalid ${field}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

/**
 * Converts a 24-char hex string to a real ObjectId.
 * Aggregation $match does NOT auto-cast strings the way find() does,
 * so every aggregate that filters by tenantId/userId must pass a real ObjectId.
 */
export function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}
