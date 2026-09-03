/**
 * Format an API error for display. The backend error envelope is:
 *   { success: false, message, code?, errors: [{ field, message }] }
 * The axios interceptor rejects with that object (or a network fallback).
 */
export function formatApiError(err) {
  const first = Array.isArray(err?.errors) ? err.errors[0] : undefined;
  const msg = err?.message || 'Something went wrong';
  if (first?.message) {
    const field = first.field ? `${first.field}: ` : '';
    return `${msg} — ${field}${first.message}`;
  }
  return msg;
}
