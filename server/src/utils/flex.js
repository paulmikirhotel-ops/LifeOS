import { z } from 'zod';

/**
 * Tolerant date/number schemas — the UI sends dates from <input type="date">
 * as 'YYYY-MM-DD' and numbers from forms as strings. These accept every
 * reasonable client format while still rejecting garbage.
 */

/** Required date: Date, ISO datetime, or 'YYYY-MM-DD'. */
export const flexDate = z.coerce.date();

/** Optional date — '' / null / undefined all mean "absent". */
export const optDate = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.date().optional()
);

/** Nullable date — '' / null clear the stored value. */
export const clearableDate = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.date().nullable().optional()
);
