/** Escape user text so it can be used literally inside a RegExp / $regex (prevents regex injection and ReDoS). */
export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
