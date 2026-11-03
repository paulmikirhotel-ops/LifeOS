import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, routeLabel, routeDescription, needsMenu, nextRoute } from '../src/native/audioRoute.js';

test('labels', () => {
  assert.equal(routeLabel('speaker'), 'Speaker');
  assert.equal(routeLabel('earpiece'), 'Phone');
  assert.equal(routeLabel('bluetooth'), 'Bluetooth');
  assert.equal(routeLabel('headset'), 'Headset');
  assert.equal(routeLabel('weird'), 'Speaker');
  assert.equal(routeDescription('bluetooth', 'Buds'), 'Bluetooth (Buds)');
  assert.equal(routeDescription('speaker', 'Buds'), 'Speaker');
});
test('normalizeState cleans odd input', () => {
  assert.deepEqual(normalizeState(null), { route: 'speaker', available: ['speaker'], bluetoothName: '' });
  const s = normalizeState({ route: 'bluetooth', available: ['speaker', 'bluetooth', 'bogus'], bluetoothName: '  Buds  ' });
  assert.deepEqual(s, { route: 'bluetooth', available: ['bluetooth', 'speaker'], bluetoothName: 'Buds' });
  assert.ok(normalizeState({ route: 'headset', available: [] }).available.includes('headset'));
});
test('menu only with more than two outputs; tap toggles otherwise', () => {
  assert.equal(needsMenu(['speaker', 'earpiece']), false);
  assert.equal(needsMenu(['bluetooth', 'speaker', 'earpiece']), true);
  assert.equal(nextRoute('speaker', ['speaker', 'earpiece']), 'earpiece');
  assert.equal(nextRoute('earpiece', ['speaker', 'earpiece']), 'speaker');
  assert.equal(nextRoute('speaker', ['speaker']), 'speaker');
});
