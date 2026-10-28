/** In-meeting chat text rules (pure, shared by both doors). */
export const CHAT_MAX = 1000;

/**
 * Returns the cleaned message, or '' when there is nothing to send.
 * Control characters are removed, line breaks kept (max 3 in a row), and the length is capped.
 * HTML is NOT stripped here: the page renders messages as plain text, never as markup.
 */
export function cleanMessage(raw) {
  const s = Array.from(String(raw ?? ''))
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c === 10 || (c >= 32 && c !== 127);
    })
    .join('')
    .replace(/\r/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return s.slice(0, CHAT_MAX);
}
