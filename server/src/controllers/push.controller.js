import * as push from '../services/push.service.js';

export async function config(_req, res) {
  res.json({ success: true, data: await push.publicConfig() });
}
export async function subscribe(req, res) {
  await push.subscribe(req.user.id, req.body.subscription, req.get('user-agent'));
  res.json({ success: true, data: { message: 'Alerts turned on for this device' } });
}
export async function unsubscribe(req, res) {
  await push.unsubscribe(req.user.id, req.body.endpoint);
  res.json({ success: true, data: { message: 'Alerts turned off for this device' } });
}
export async function test(req, res) {
  const sent = await push.sendToUser(req.user.id, { title: 'LifeOS alerts are on', body: 'This is a test alert.', url: '/settings', tag: 'test' });
  res.json({ success: true, data: { sent } });
}
