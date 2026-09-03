import { Router } from 'express';
import { z } from 'zod';
import * as journalController from '../controllers/journal.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { optDate } from '../utils/flex.js';

const router = Router();

const noteSchema = z.object({
  type: z.enum(['journal', 'myday', 'review']).optional(),
  entryDate: optDate,
  title: z.string().max(200).optional(),
  content: z.string().optional(),
  sections: z.array(z.object({
    key: z.string(),
    text: z.string(),
  })).optional(),
  mood: z.enum(['great', 'good', 'ok', 'low', 'bad']).optional(),
  tags: z.array(z.string()).optional(),
  isPrivate: z.boolean().optional(),
});

const notePatchSchema = noteSchema.partial();

const querySchema = z.object({
  type: z.enum(['journal', 'myday', 'review']).optional(),
  from: optDate,
  to: optDate,
  tag: z.string().optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const dayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.use(authenticate, requireTenant);

router.get('/', requirePermission('journal.view'), validateRequest(querySchema, 'query'), journalController.listNotes);
router.get('/day', requirePermission('journal.view'), validateRequest(dayQuerySchema, 'query'), journalController.getDaySummary);
router.get('/:id', requirePermission('journal.view'), journalController.getNote);

router.post('/', requirePermission('journal.create'), validateRequest(noteSchema), journalController.createNote);
router.patch('/:id', requirePermission('journal.edit'), validateRequest(notePatchSchema), journalController.updateNote);
router.delete('/:id', requirePermission('journal.delete'), journalController.deleteNote);

export default router;
