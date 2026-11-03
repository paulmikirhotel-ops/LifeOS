// Pure helpers for "where does the call sound go" (no phone code here, so they can be tested).

export const ROUTES = ['bluetooth', 'headset', 'speaker', 'earpiece'];
const LABELS = { speaker: 'Speaker', earpiece: 'Phone', bluetooth: 'Bluetooth', headset: 'Headset' };

/** Cleans what the Android side reports. Anything odd becomes a safe default. */
export function normalizeState(raw) {
  const route = ROUTES.includes(raw?.route) ? raw.route : 'speaker';
  const available = ROUTES.filter((r) => Array.isArray(raw?.available) && raw.available.includes(r));
  if (!available.includes('speaker')) available.push('speaker');
  if (!available.includes(route)) available.push(route);
  const name = typeof raw?.bluetoothName === 'string' ? raw.bluetoothName.trim().slice(0, 40) : '';
  return { route, available: ROUTES.filter((r) => available.includes(r)), bluetoothName: name };
}

/** The short word under the button. */
export function routeLabel(route) {
  return LABELS[route] || 'Speaker';
}

/** A longer line for screen readers and the menu, e.g. "Bluetooth (Galaxy Buds)". */
export function routeDescription(route, bluetoothName = '') {
  return route === 'bluetooth' && bluetoothName ? `Bluetooth (${bluetoothName})` : routeLabel(route);
}

/** With only two choices a tap switches between them; with more it opens a list. */
export function needsMenu(available) {
  return Array.isArray(available) && available.length > 2;
}

/** The route a plain tap switches to (loudspeaker <-> phone when there is no headset). */
export function nextRoute(current, available) {
  const list = ROUTES.filter((r) => available?.includes(r));
  if (list.length < 2) return current;
  return list[(list.indexOf(current) + 1) % list.length] ?? list[0];
}
