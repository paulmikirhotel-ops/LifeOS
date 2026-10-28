import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/assistant.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/requireTenant.js';
import { validateRequest } from '../middleware/validateRequest.js';

/**
 * Assistant. Needs a signed-in member of the active workspace. There is no blanket permission here on purpose:
 * each tool checks its own permission (tasks.view, tasks.create, ...) inside the assistant, and again when a change is confirmed.
 */
const router = Router();
router.use(authenticate, requireTenant);

const sendSchema = z.object({
  chatId: z.string().length(24).optional(),
  message: z.string().trim().min(1).max(1000),
});

router.get('/status', c.status);
router.get('/chats', c.listChats);
router.get('/chats/:id', c.getChat);
router.delete('/chats/:id', c.deleteChat);
router.post('/chat', validateRequest(sendSchema), c.send);
router.post('/proposals/:id/confirm', c.confirm);
router.post('/proposals/:id/cancel', c.cancel);
router.post('/proposals/:id/undo', c.undo);

export default router;
