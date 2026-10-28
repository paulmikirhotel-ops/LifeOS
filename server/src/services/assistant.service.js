import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId } from '../utils/objectId.js';
import { Task, CalendarEvent, Goal, Habit, HabitLog, Income, Expense } from '../models/index.js';
import { toObjectId } from '../utils/objectId.js';
import * as habitService from './habit.service.js';
import { AssistantChat, AssistantProposal, AssistantUsage } from '../models/assistant.model.js';
import { NextStepPlan } from '../models/nextstep.model.js';
import * as nextstep from './nextstep.service.js';
import { generateJson, aiConfigured } from './ai.service.js';
import { runTurn, replySchema, TOOLS, hasPerm } from '../utils/assistant.engine.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const PROPOSAL_TTL = 15 * MIN;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dayKey = () => new Date().toISOString().slice(0, 10);

export function dailyLimit(raw = process.env.ASSISTANT_DAILY_AI) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(200, Math.max(1, n)) : 20;
}

// ───────────────────────── Allowance ─────────────────────────

export async function usageNow(userId) {
  const row = await AssistantUsage.findOne({ userId, day: dayKey() }).lean();
  const limit = dailyLimit();
  const used = Math.min(row?.count || 0, limit);
  return { used, limit, left: Math.max(0, limit - used) };
}

async function takeAllowance(userId) {
  const limit = dailyLimit();
  const d = dayKey();
  const bump = () =>
    AssistantUsage.findOneAndUpdate(
      { userId, day: d },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 3 * DAY) } },
      { upsert: true, new: true }
    );
  let row;
  try {
    row = await bump();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    row = await bump();
  }
  if (row.count > limit) {
    await AssistantUsage.updateOne({ userId, day: d }, { $inc: { count: -1 } });
    throw new ApiError(429, `You used today's ${limit} assistant messages. It resets tomorrow (UTC). Everything else in LifeOS still works.`, { code: 'AI_ALLOWANCE_USED' });
  }
}

const refundAllowance = (userId) => AssistantUsage.updateOne({ userId, day: dayKey(), count: { $gt: 0 } }, { $inc: { count: -1 } }).catch(() => {});

// ───────────────────────── Read tools (database, scoped to the workspace) ─────────────────────────

async function readTool(user, name, args) {
  const tenantId = user.tenantId;
  if (name === 'list_tasks') {
    const q = { tenantId };
    if (args.status === 'open') q.status = { $in: ['not_started', 'in_progress', 'postponed'] };
    else if (args.status === 'completed') q.status = 'completed';
    else q.status = { $ne: 'cancelled' };
    if (args.dueFrom || args.dueTo) q.dueDate = { ...(args.dueFrom && { $gte: args.dueFrom }), ...(args.dueTo && { $lte: args.dueTo }) };
    const rows = await Task.find(q).sort({ dueDate: 1, createdAt: -1 }).limit(args.limit).select('title status priority dueDate estimatedMinutes').lean();
    return rows.map((t) => ({ id: String(t._id), title: clip(t.title, 100), status: t.status, priority: t.priority, due: day(t.dueDate), minutes: t.estimatedMinutes || null }));
  }
  if (name === 'list_events') {
    const from = args.from || new Date();
    const to = args.to || new Date(from.getTime() + 14 * DAY);
    const rows = await CalendarEvent.find({ tenantId, userId: user.id, startAt: { $gte: from, $lte: to } }).sort({ startAt: 1 }).limit(args.limit).select('title startAt endAt type').lean();
    return rows.map((e) => ({ id: String(e._id), title: clip(e.title, 100), start: e.startAt?.toISOString(), end: e.endAt?.toISOString() || null }));
  }
  if (name === 'list_goals') {
    const rows = await Goal.find({ tenantId, status: 'active' }).sort({ createdAt: -1 }).limit(args.limit).select('title progress targetDate').lean();
    return rows.map((g) => ({ id: String(g._id), title: clip(g.title, 100), progress: g.progress, target: day(g.targetDate) }));
  }
  if (name === 'nextstep_progress') {
    const { items } = await nextstep.listPlans(user);
    return items.slice(0, 5).map((p) => {
      const all = p.phases.flatMap((ph) => ph.items);
      return {
        planId: String(p._id),
        title: clip(p.title, 100),
        status: p.status,
        progress: p.progress,
        scheduled: all
          .filter((i) => i.state === 'created')
          .slice(0, 10)
          .map((i) => ({ itemId: String(i._id), title: clip(i.title, 100), due: day(i.dueDate), minutes: i.estimatedMinutes })),
        nextItemId: p.nextItemId,
      };
    });
  }
  if (name === 'list_habits') {
    const { items } = await habitService.list(user);
    const today = localDay();
    return items.slice(0, 20).map((h) => ({
      id: String(h._id),
      name: clip(h.name, 80),
      targetPerDay: h.targetPerDay,
      doneToday: (h.logs || []).find((l) => l.date === today)?.count || 0,
      streak: h.streak || 0,
    }));
  }
  if (name === 'finance_summary') return financeSummary(tenantId, args.period);
  throw new Error('unknown read tool');
}

/** Same local-date rule the Habits module uses, so "today" matches what the person sees. */
function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Read-only totals. The assistant never records or edits money. */
async function financeSummary(tenantId, period) {
  const now = new Date();
  let start;
  let end = now;
  if (period === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'last_30_days') start = new Date(now.getTime() - 30 * DAY);
  else start = new Date(now.getFullYear(), now.getMonth(), 1);

  const oid = toObjectId(tenantId);
  const match = { tenantId: oid, date: { $gte: start, $lt: end } };
  const [inc, exp, cats] = await Promise.all([
    Income.aggregate([{ $match: match }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Expense.aggregate([{ $match: match }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Expense.aggregate([{ $match: match }, { $group: { _id: '$category', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }, { $limit: 5 }]),
  ]);
  const round = (n) => Math.round((n || 0) * 100) / 100;
  const income = round(inc[0]?.sum);
  const expenses = round(exp[0]?.sum);
  return {
    period,
    from: day(start),
    to: day(end),
    income,
    expenses,
    balance: round(income - expenses),
    incomeEntries: inc[0]?.n || 0,
    expenseEntries: exp[0]?.n || 0,
    topExpenseCategories: cats.map((c) => ({ category: clip(c._id, 60), total: round(c.total) })),
    note: 'Amounts are in the workspace currency. Figures cover recorded entries only.',
  };
}

// ───────────────────────── Proposals ─────────────────────────

async function findTask(user, id) {
  const task = await Task.findOne({ _id: id, tenantId: user.tenantId });
  if (!task) throw new Error('that task was not found in this workspace');
  return task;
}

/** Validates against the real database and builds the summary shown to the person. Nothing is changed here. */
async function propose(user, chatId, name, args) {
  let summary;
  const details = [];
  if (name === 'create_task') {
    summary = `Create task: ${clip(args.title, 100)}`;
    if (args.dueDate) details.push(`Due ${day(args.dueDate)}`);
    details.push(`Priority: ${args.priority || 'medium'}`);
    if (args.estimatedMinutes) details.push(`${args.estimatedMinutes} min`);
  } else if (name === 'update_task_due') {
    const t = await findTask(user, args.taskId);
    summary = `Move task: ${clip(t.title, 100)}`;
    details.push(`From ${day(t.dueDate) || 'no date'} to ${day(args.dueDate)}`);
  } else if (name === 'complete_task') {
    const t = await findTask(user, args.taskId);
    if (t.status === 'completed') throw new Error('that task is already completed');
    summary = `Complete task: ${clip(t.title, 100)}`;
  } else if (name === 'create_event') {
    summary = `Create event: ${clip(args.title, 100)}`;
    const end = args.endAt || new Date(args.startAt.getTime() + 60 * MIN);
    details.push(`${args.startAt.toISOString().slice(0, 16).replace('T', ' ')} to ${end.toISOString().slice(11, 16)} UTC`);
  } else if (name === 'log_habit') {
    assertObjectId(args.habitId, 'habitId');
    const h = await Habit.findOne({ _id: args.habitId, tenantId: user.tenantId, userId: user.id, isArchived: false }).lean();
    if (!h) throw new Error('that habit was not found');
    summary = `Log habit: ${clip(h.name, 80)}`;
    details.push('Counts once for today');
  } else if (name === 'mark_nextstep_done') {
    assertObjectId(args.planId, 'planId');
    const plan = await NextStepPlan.findOne({ _id: args.planId, tenantId: user.tenantId, userId: user.id }).lean();
    const item = plan?.phases.flatMap((p) => p.items).find((i) => String(i._id) === args.itemId);
    if (!item || item.state !== 'created') throw new Error('that NextStep step is not scheduled');
    summary = `Mark NextStep step done: ${clip(item.title, 100)}`;
  } else {
    throw new Error('unknown write tool');
  }

  const doc = await AssistantProposal.create({
    tenantId: user.tenantId,
    userId: user.id,
    chatId,
    tool: name,
    args: JSON.parse(JSON.stringify(args)),
    summary,
    details,
    expiresAt: new Date(Date.now() + PROPOSAL_TTL),
    purgeAt: new Date(Date.now() + 7 * DAY),
  });
  return viewProposal(doc);
}

export function viewProposal(p) {
  const obj = p.toObject ? p.toObject() : p;
  const expired = obj.status === 'pending' && new Date(obj.expiresAt) < new Date();
  return {
    _id: obj._id,
    tool: obj.tool,
    summary: obj.summary,
    details: obj.details || [],
    status: expired ? 'expired' : obj.status,
    expiresAt: obj.expiresAt,
    result: obj.result || '',
    canUndo: obj.status === 'confirmed' && Boolean(obj.undo) && !obj.undoneAt,
    undone: Boolean(obj.undoneAt),
  };
}

/** Runs a confirmed proposal. Re-validates and re-checks permission, never trusting what was stored earlier. */
async function execute(user, proposal) {
  const tool = TOOLS[proposal.tool];
  if (!tool || tool.kind !== 'write') throw ApiError.badRequest('Unknown action');
  if (!hasPerm(user.permissions, tool.permission)) throw ApiError.forbidden(`Missing permission: ${tool.permission}`);
  const parsed = tool.args.safeParse(proposal.args);
  if (!parsed.success) throw ApiError.badRequest('This proposal is no longer valid');
  const a = parsed.data;
  const tenantId = user.tenantId;

  switch (proposal.tool) {
    case 'create_task': {
      const t = await Task.create({
        tenantId,
        createdBy: user.id,
        title: a.title,
        dueDate: a.dueDate,
        priority: a.priority || 'medium',
        estimatedMinutes: a.estimatedMinutes,
        notes: a.notes,
        category: 'Assistant',
      });
      return { result: 'Task created.', undo: { kind: 'delete_task', id: String(t._id) } };
    }
    case 'update_task_due': {
      const t = await findTask(user, a.taskId).catch(() => {
        throw ApiError.notFound('That task no longer exists');
      });
      const before = t.dueDate || null;
      t.dueDate = a.dueDate;
      await t.save();
      return { result: 'Task moved.', undo: { kind: 'restore_due', id: String(t._id), dueDate: before } };
    }
    case 'complete_task': {
      const t = await findTask(user, a.taskId).catch(() => {
        throw ApiError.notFound('That task no longer exists');
      });
      const status = t.status;
      t.status = 'completed';
      t.completedAt = new Date();
      await t.save();
      return { result: 'Task completed.', undo: { kind: 'restore_status', id: String(t._id), status } };
    }
    case 'create_event': {
      const e = await CalendarEvent.create({
        tenantId,
        userId: user.id,
        title: a.title,
        type: 'other',
        startAt: a.startAt,
        endAt: a.endAt || new Date(a.startAt.getTime() + 60 * MIN),
      });
      return { result: 'Event created.', undo: { kind: 'delete_event', id: String(e._id) } };
    }
    case 'log_habit': {
      const entry = await habitService.log(user, a.habitId, { count: 1 });
      return { result: 'Habit logged.', undo: { kind: 'unlog_habit', id: a.habitId, date: entry.date } };
    }
    case 'mark_nextstep_done': {
      await nextstep.markItem(user, a.planId, a.itemId, 'done');
      return { result: 'Step marked done.', undo: null };
    }
    default:
      throw ApiError.badRequest('Unknown action');
  }
}

async function loadOwnProposal(user, id) {
  assertObjectId(id);
  const p = await AssistantProposal.findOne({ _id: id, userId: user.id, tenantId: user.tenantId });
  if (!p) throw ApiError.notFound('Proposal not found');
  return p;
}

export async function confirmProposal(user, id) {
  assertObjectId(id);
  // Atomic: only ONE request can move pending -> confirmed, so a double click or a retry never runs it twice.
  const claimed = await AssistantProposal.findOneAndUpdate(
    { _id: id, userId: user.id, tenantId: user.tenantId, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: 'confirmed' } },
    { new: true }
  );
  if (!claimed) {
    const p = await loadOwnProposal(user, id);
    const v = viewProposal(p);
    throw ApiError.conflict(v.status === 'expired' ? 'This proposal expired. Ask again.' : `This proposal is already ${v.status}.`, { code: v.status === 'expired' ? 'PROPOSAL_EXPIRED' : 'PROPOSAL_CLOSED' });
  }
  try {
    const { result, undo } = await execute(user, claimed);
    claimed.result = result;
    claimed.undo = undo || undefined;
    await claimed.save();
    return viewProposal(claimed);
  } catch (err) {
    claimed.status = 'failed';
    claimed.result = clip(err?.message || 'failed', 180);
    await claimed.save().catch(() => {});
    throw err;
  }
}

export async function cancelProposal(user, id) {
  assertObjectId(id);
  const p = await AssistantProposal.findOneAndUpdate(
    { _id: id, userId: user.id, tenantId: user.tenantId, status: 'pending' },
    { $set: { status: 'cancelled', result: 'Cancelled. Nothing was changed.' } },
    { new: true }
  );
  if (!p) throw ApiError.conflict('This proposal can no longer be cancelled');
  return viewProposal(p);
}

export async function undoProposal(user, id) {
  assertObjectId(id);
  const p = await AssistantProposal.findOneAndUpdate(
    { _id: id, userId: user.id, tenantId: user.tenantId, status: 'confirmed', undoneAt: { $exists: false }, undo: { $ne: null } },
    { $set: { undoneAt: new Date() } },
    { new: true }
  );
  if (!p) throw ApiError.conflict('This cannot be undone');
  const u = p.undo;
  const tenantId = user.tenantId;
  try {
    if (!hasPerm(user.permissions, TOOLS[p.tool].permission)) throw ApiError.forbidden(`Missing permission: ${TOOLS[p.tool].permission}`);
    if (u.kind === 'delete_task') await Task.deleteOne({ _id: u.id, tenantId, createdBy: user.id });
    else if (u.kind === 'restore_due') await Task.updateOne({ _id: u.id, tenantId }, u.dueDate ? { $set: { dueDate: u.dueDate } } : { $unset: { dueDate: 1 } });
    else if (u.kind === 'restore_status') await Task.updateOne({ _id: u.id, tenantId }, { $set: { status: u.status }, $unset: { completedAt: 1 } });
    else if (u.kind === 'unlog_habit') {
      // Take back exactly the one count we added; remove the row if that leaves nothing.
      const row = await HabitLog.findOneAndUpdate({ tenantId, userId: user.id, habitId: u.id, date: u.date }, { $inc: { count: -1 } }, { new: true });
      if (row && row.count <= 0) await HabitLog.deleteOne({ _id: row._id });
    } else if (u.kind === 'delete_event') await CalendarEvent.deleteOne({ _id: u.id, tenantId, userId: user.id });
    else throw ApiError.badRequest('Unknown undo');
  } catch (err) {
    await AssistantProposal.updateOne({ _id: p._id }, { $unset: { undoneAt: 1 } });
    throw err;
  }
  return viewProposal(p);
}

// ───────────────────────── Chats ─────────────────────────

async function findOwnChat(user, id) {
  assertObjectId(id);
  const chat = await AssistantChat.findOne({ _id: id, tenantId: user.tenantId, userId: user.id });
  if (!chat) throw ApiError.notFound('Chat not found');
  return chat;
}

async function hydrate(chat) {
  const ids = chat.messages.flatMap((m) => m.proposalIds || []);
  const proposals = ids.length ? await AssistantProposal.find({ _id: { $in: ids } }).lean() : [];
  const map = new Map(proposals.map((p) => [String(p._id), viewProposal(p)]));
  return {
    _id: chat._id,
    title: chat.title,
    messages: chat.messages.map((m) => ({
      _id: m._id,
      role: m.role,
      text: m.text,
      createdAt: m.createdAt,
      blocked: m.blocked || [],
      proposals: (m.proposalIds || []).map((id) => map.get(String(id))).filter(Boolean),
    })),
  };
}

export async function status(user) {
  return { aiConfigured: aiConfigured(), usage: await usageNow(user.id) };
}

export async function listChats(user) {
  const items = await AssistantChat.find({ tenantId: user.tenantId, userId: user.id }).sort({ updatedAt: -1 }).limit(20).select('title updatedAt').lean();
  return { items };
}

export async function getChat(user, id) {
  return hydrate(await findOwnChat(user, id));
}

export async function deleteChat(user, id) {
  const chat = await findOwnChat(user, id);
  await AssistantProposal.deleteMany({ chatId: chat._id, userId: user.id });
  await chat.deleteOne();
  return { message: 'Chat deleted' };
}

export async function sendMessage(user, { chatId, message }) {
  const text = String(message || '').trim();
  if (!text) throw ApiError.badRequest('Write a message first');
  if (!aiConfigured()) throw new ApiError(503, 'The assistant is not available yet: AI is not set up on the server.', { code: 'AI_NOT_CONFIGURED' });

  let chat;
  let created = false;
  if (chatId) chat = await findOwnChat(user, chatId);
  else {
    chat = await AssistantChat.create({ tenantId: user.tenantId, userId: user.id, title: clip(text, 60) || 'New chat' });
    created = true;
  }

  try {
    await takeAllowance(user.id);
  } catch (err) {
    if (created) await chat.deleteOne().catch(() => {});
    throw err;
  }

  // Short history, with what happened to earlier proposals so the model does not repeat itself.
  const recent = chat.messages.slice(-8);
  const ids = recent.flatMap((m) => m.proposalIds || []);
  const old = ids.length ? await AssistantProposal.find({ _id: { $in: ids } }).lean() : [];
  const oldMap = new Map(old.map((p) => [String(p._id), viewProposal(p)]));
  const history = recent.map((m) => ({
    role: m.role,
    text: `${m.text}${(m.proposalIds || []).map((id) => oldMap.get(String(id))).filter(Boolean).map((p) => ` [proposal: ${p.summary} (${p.status})]`).join('')}`,
  }));

  const now = new Date();
  const today = `${now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })} ${now.toISOString().slice(0, 10)}`;

  let turn;
  try {
    turn = await runTurn({
      history,
      message: text,
      today,
      permissions: user.permissions || [],
      ask: ({ system, prompt }) => generateJson({ system, prompt, schema: replySchema, maxTokens: 1500 }),
      readTool: (name, args) => readTool(user, name, args),
      propose: (name, args) => propose(user, chat._id, name, args),
    });
  } catch (err) {
    await refundAllowance(user.id);
    if (created) await chat.deleteOne().catch(() => {});
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'The assistant did not finish. Nothing was changed and this message was not counted. Please try again.', { code: 'AI_FAILED' });
  }

  chat.messages.push({ role: 'user', text: clip(text, 1000) });
  chat.messages.push({ role: 'assistant', text: turn.reply, proposalIds: turn.proposals.map((p) => p._id), blocked: turn.blocked });
  if (chat.messages.length > 100) chat.messages = chat.messages.slice(-100);
  await chat.save();

  return { chat: await hydrate(chat), usage: await usageNow(user.id) };
}
