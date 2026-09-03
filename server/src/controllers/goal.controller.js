import * as goalService from '../services/goal.service.js';

export async function listGoals(req, res) {
  const data = await goalService.list(req.user, req.query);
  res.json({ success: true, data });
}

export async function createGoal(req, res) {
  const data = await goalService.create(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateGoal(req, res) {
  const data = await goalService.update(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function removeGoal(req, res) {
  await goalService.remove(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Goal removed' } });
}
