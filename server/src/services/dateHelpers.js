/**
 * Local date helpers using server timezone as "local".
 * Conventions: 
 * - Use 'YYYY-MM-DD' for date strings.
 * - Do NOT use toISOString() for day keys as it uses UTC.
 */

export function dateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDayRange(dateString) {
  const d = dateString ? new Date(dateString + 'T00:00:00') : new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  
  return { start, end };
}

export function rangeDays(fromStr, toStr) {
  const start = new Date(fromStr + 'T00:00:00');
  const end = new Date(toStr + 'T00:00:00');
  const days = [];
  
  const curr = new Date(start);
  while (curr <= end) {
    days.push(dateStr(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return days;
}

export function addDays(date, n) {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}
