import * as focusService from '../services/focus.service.js';

export async function startSession(req, res) {
  const data = await focusService.start(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function performAction(req, res) {
  const data = await focusService.action(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function listSessions(req, res) {
  const data = await focusService.list(req.user, req.query);
  res.json({ success: true, data });
}

export async function getSummary(req, res) {
  const data = await focusService.todaySummary(req.user);
  res.json({ success: true, data });
}
