import * as journalService from '../services/journal.service.js';
import { assertObjectId } from '../utils/objectId.js';

export async function listNotes(req, res) {
  const data = await journalService.list(req.user, req.query);
  res.json({ success: true, data });
}

export async function getDaySummary(req, res) {
  const data = await journalService.daySummary(req.user, req.query);
  res.json({ success: true, data });
}

export async function getNote(req, res) {
  assertObjectId(req.params.id);
  const data = await journalService.get(req.user, req.params.id);
  res.json({ success: true, data });
}

export async function createNote(req, res) {
  const data = await journalService.create(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateNote(req, res) {
  assertObjectId(req.params.id);
  const data = await journalService.update(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteNote(req, res) {
  assertObjectId(req.params.id);
  await journalService.remove(req.user, req.params.id);
  res.json({ success: true, data: { deleted: true } });
}
