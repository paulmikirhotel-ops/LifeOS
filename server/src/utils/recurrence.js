/**
 * Recurrence expansion with wall-clock preservation in the meeting's IANA time zone
 * (a 09:00 meeting stays at 09:00 local across daylight-saving changes).
 * Pure functions — no I/O — so they are easy to unit test.
 */

const DAY_MS = 86400000;

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(date)) p[type] = value;
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    h: +p.hour === 24 ? 0 : +p.hour,
    mi: +p.minute,
    s: +p.second,
  };
}

function offsetMs(utcMs, timeZone) {
  const p = zonedParts(new Date(utcMs), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}

/** Converts a wall-clock time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc({ y, m, d, h = 0, mi = 0 }, timeZone) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMs(guess, timeZone);
  const off2 = offsetMs(utc, timeZone);
  utc = guess - off2;
  return new Date(utc);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Expands a recurrence rule into concrete occurrences (the original start is always first).
 * @returns {{startAt: Date, endAt: Date}[]}
 */
export function expandRecurrence(
  { startAt, endAt, timezone = 'UTC', recurrence },
  { maxCount = 60, horizonDays = 180 } = {}
) {
  const first = { startAt: new Date(startAt), endAt: new Date(endAt) };
  const freq = recurrence?.frequency || 'none';
  if (freq === 'none') return [first];

  const interval = Math.max(1, recurrence.interval || 1);
  const durationMs = first.endAt - first.startAt;
  const local = zonedParts(first.startAt, timezone);
  const baseDay = Date.UTC(local.y, local.m - 1, local.d); // local calendar day as UTC midnight
  const baseDow = new Date(baseDay).getUTCDay();
  const limit = first.startAt.getTime() + horizonDays * DAY_MS;
  const until = recurrence.until ? new Date(recurrence.until).getTime() : Infinity;

  const days = []; // candidate local days (UTC-midnight ms), ascending
  const push = (dayMs) => {
    if (dayMs > baseDay) days.push(dayMs);
  };

  const weekly = freq === 'weekly' || (freq === 'custom' && recurrence.daysOfWeek?.length);
  const guardDays = horizonDays + 8;

  if (weekly) {
    const dows = [...new Set(recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [baseDow])].sort((a, b) => a - b);
    const weekStart = baseDay - baseDow * DAY_MS; // Sunday of the start week
    for (let k = 0; k * 7 * interval <= guardDays; k += 1) {
      for (const dow of dows) push(weekStart + (k * 7 * interval + dow) * DAY_MS);
    }
  } else if (freq === 'monthly') {
    for (let k = 1; k <= Math.ceil(guardDays / 28) + 1; k += 1) {
      const idx = local.m - 1 + k * interval;
      const y = local.y + Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const d = Math.min(local.d, daysInMonth(y, m)); // 31st → last day of shorter months
      push(Date.UTC(y, m - 1, d));
    }
  } else {
    // daily, or custom without weekdays = every N days
    for (let k = 1; k * interval <= guardDays; k += 1) push(baseDay + k * interval * DAY_MS);
  }

  const out = [first];
  for (const dayMs of days) {
    if (out.length >= maxCount) break;
    const dt = new Date(dayMs);
    const s = zonedTimeToUtc(
      { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: local.h, mi: local.mi },
      timezone
    );
    if (s.getTime() > limit || s.getTime() > until) break;
    out.push({ startAt: s, endAt: new Date(s.getTime() + durationMs) });
  }
  return out;
}
