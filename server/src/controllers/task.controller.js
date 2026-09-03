import * as taskService from '../services/task.service.js';
import { assertObjectId } from '../utils/objectId.js';

export async function listTasks(req, res) {
  const data = await taskService.list(req.user, req.query);
  res.json({ success: true, data });
}

export async function getTodayTasks(req, res) {
  const data = await taskService.todayList(req.user);
  res.json({ success: true, data });
}

export async function getTask(req, res) {
  assertObjectId(req.params.id);
  const data = await taskService.get(req.user, req.params.id);
  res.json({ success: true, data });
}

export async function createTask(req, res) {
  const data = await taskService.create(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateTask(req, res) {
  assertObjectId(req.params.id);
  const data = await taskService.update(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteTask(req, res) {
  assertObjectId(req.params.id);
  await taskService.remove(req.user, req.params.id);
  res.json({ success: true, data: { deleted: true } });
}

export async function planSmart(req, res) {
  const data = await taskService.planSmart(req.user, req.body);
  res.json({ success: true, data });
}
