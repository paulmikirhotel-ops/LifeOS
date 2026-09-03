import * as timeService from '../services/time.service.js';

export async function listEntries(req, res) {
  const data = await timeService.list(req.user, req.query);
  res.json({ success: true, data });
}

export async function createEntry(req, res) {
  const data = await timeService.create(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateEntry(req, res) {
  const data = await timeService.update(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function removeEntry(req, res) {
  await timeService.remove(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Time entry removed' } });
}

export async function getSummary(req, res) {
  const data = await timeService.summary(req.user, req.query);
  res.json({ success: true, data });
}
