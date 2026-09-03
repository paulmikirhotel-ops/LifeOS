import * as habitService from '../services/habit.service.js';

export async function listHabits(req, res) {
  const data = await habitService.list(req.user);
  res.json({ success: true, data });
}

export async function createHabit(req, res) {
  const data = await habitService.create(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateHabit(req, res) {
  const data = await habitService.update(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function removeHabit(req, res) {
  await habitService.remove(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Habit removed' } });
}

export async function logHabit(req, res) {
  const data = await habitService.log(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function unlogHabit(req, res) {
  await habitService.unlog(req.user, req.params.id, req.query);
  res.json({ success: true, data: { message: 'Habit log removed' } });
}

export async function getStats(req, res) {
  const data = await habitService.stats(req.user, req.query);
  res.json({ success: true, data });
}
