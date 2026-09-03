import { CalendarService } from '../services/calendar.service.js';
import { assertObjectId } from '../utils/objectId.js';

export async function listEvents(req, res) {
  const data = await CalendarService.list(req.user, req.query);
  res.json({ success: true, data: { items: data } });
}

export async function createEvent(req, res) {
  const data = await CalendarService.create(req.user, req.body);
  res.status(201).json({ success: true, data });
}

export async function updateEvent(req, res) {
  assertObjectId(req.params.id, 'id');
  const data = await CalendarService.update(req.user, req.params.id, req.body);
  res.json({ success: true, data });
}

export async function deleteEvent(req, res) {
  assertObjectId(req.params.id, 'id');
  await CalendarService.remove(req.user, req.params.id);
  res.json({ success: true, data: { message: 'Event deleted' } });
}
