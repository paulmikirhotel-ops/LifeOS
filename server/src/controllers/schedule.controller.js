import * as scheduleService from '../services/schedule.service.js';
import { assertObjectId } from '../utils/objectId.js';

export async function listBlocks(req, res) {
  const data = await scheduleService.list(req.user, req.query);
  res.json({ success: true, data });
}

export async function createBlock(req, res) {
  const data = await scheduleService.create(req.user, req.tenant, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateBlock(req, res) {
  assertObjectId(req.params.id);
  const data = await scheduleService.update(req.user, req.tenant, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteBlock(req, res) {
  assertObjectId(req.params.id);
  await scheduleService.remove(req.user, req.params.id);
  res.json({ success: true, data: { deleted: true } });
}

export async function getAvailability(req, res) {
  const data = await scheduleService.availability(req.user, req.tenant, req.query);
  res.json({ success: true, data });
}
