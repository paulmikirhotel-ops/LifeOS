/**
 * Time-zone helpers (no dependencies). A meeting is scheduled in a chosen IANA zone, so the
 * date/time the user types is converted to a UTC instant for that zone (and back for editing).
 */

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
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour === 24 ? 0 : +p.hour, mi: +p.minute, s: +p.second };
}

function offsetMs(utcMs, timeZone) {
  const p = zonedParts(new Date(utcMs), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}

export function zonedTimeToUtc({ y, m, d, h = 0, mi = 0 }, timeZone) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMs(guess, timeZone);
  utc = guess - offsetMs(utc, timeZone);
  return new Date(utc);
}

/** "2026-10-05" + "14:30" in `tz` → ISO string (UTC). */
export function toUtcIso(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  return zonedTimeToUtc({ y, m, d, h, mi }, tz).toISOString();
}

/** ISO instant → { date: 'yyyy-MM-dd', time: 'HH:mm' } as seen in `tz`. */
export function utcToInputs(iso, tz) {
  const p = zonedParts(new Date(iso), tz);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timeZoneOptions() {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['UTC', 'Africa/Monrovia', 'Africa/Lagos', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo'];
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  return zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}
