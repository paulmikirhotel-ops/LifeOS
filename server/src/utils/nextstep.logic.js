import { z } from 'zod';

/**
 * NextStep pure logic: validation of AI output, scheduling, progress and next-action selection.
 * No database or network here, so it is fully unit-testable.
 */

export const LIMITS = { phases: 6, itemsPerPhase: 8, items: 40, maxWeek: 104 };
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const DAY = 24 * 60 * 60 * 1000;

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Loose schema for what the model returns; normalizeDraft then enforces the real limits. */
export const aiPlanSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().default(''),
  phases: z
    .array(
      z.object({
        title: z.string().min(1),
        weeksLabel: z.string().optional().default(''),
        items: z
          .array(
            z.object({
              title: z.string().min(1),
              // Loose on purpose: sloppy values are clamped to safe defaults in normalizeDraft instead of failing the whole draft.
              kind: z.unknown().optional(),
              priority: z.unknown().optional(),
              estimatedMinutes: z.unknown().optional(),
              weekOffset: z.unknown().optional(),
            })
          )
          .min(1),
      })
    )
    .min(1),
});

/** UTC day key used by the daily AI allowance, e.g. "2026-10-13". */
export function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

export function dailyLimit(raw = process.env.NEXTSTEP_DAILY_AI) {
  return clampInt(raw, 1, 50, 5);
}

/**
 * Turns the AI reply into a safe draft: trimmed text, capped sizes, valid kinds/priorities,
 * and real dates computed here (the model only suggests a week number, never a date).
 */
export function normalizeDraft(raw, { now = new Date(), targetDate } = {}) {
  const parsed = aiPlanSchema.parse(raw);
  const start = new Date(now);
  const end = targetDate ? new Date(targetDate) : null;
  let total = 0;
  const phases = [];

  for (const p of parsed.phases.slice(0, LIMITS.phases)) {
    const items = [];
    for (const it of p.items.slice(0, LIMITS.itemsPerPhase)) {
      if (total >= LIMITS.items) break;
      const title = clean(it.title, 140);
      if (!title) continue;
      const kind = String(it.kind || '').toLowerCase() === 'event' ? 'event' : 'task';
      const priority = PRIORITIES.includes(String(it.priority || '').toLowerCase()) ? String(it.priority).toLowerCase() : 'medium';
      const estimatedMinutes = clampInt(it.estimatedMinutes, 10, 600, 45);
      const weekOffset = clampInt(it.weekOffset, 0, LIMITS.maxWeek, 0);
      let dueDate = new Date(start.getTime() + (weekOffset * 7 + 1) * DAY);
      if (end && dueDate > end) dueDate = new Date(end);
      if (dueDate < start) dueDate = new Date(start.getTime() + DAY);
      items.push({
        title,
        kind,
        priority,
        estimatedMinutes,
        durationMinutes: kind === 'event' ? Math.min(estimatedMinutes, 240) : undefined,
        dueDate,
        startAt: kind === 'event' ? withHour(dueDate, 9) : undefined,
        approved: false,
        state: 'draft',
      });
      total += 1;
    }
    if (items.length) phases.push({ title: clean(p.title, 100), weeksLabel: clean(p.weeksLabel, 40), items });
  }
  if (!phases.length) throw new Error('The AI draft had no usable steps');
  return { title: clean(parsed.title, 120), summary: clean(parsed.summary, 400), phases };
}

function withHour(date, hour) {
  const d = new Date(date);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/** Every item in phase order, with its phase for context. */
export function flatItems(plan) {
  const out = [];
  (plan.phases || []).forEach((phase, pi) => {
    (phase.items || []).forEach((item, ii) => out.push({ phase, item, pi, ii }));
  });
  return out;
}

/** Percent done among steps that are still part of the plan (skipped/removed steps do not count). */
export function progressOf(plan) {
  const live = flatItems(plan).filter(({ item }) => item.state !== 'skipped');
  if (!live.length) return 0;
  const done = live.filter(({ item }) => item.state === 'done').length;
  return Math.round((done / live.length) * 100);
}

/** The earliest scheduled step that is not done. Only real tasks/events count, never unapproved drafts. */
export function pickNextAction(plan) {
  const open = flatItems(plan).filter(({ item }) => item.state === 'created');
  if (!open.length) return null;
  open.sort((a, b) => {
    const da = a.item.dueDate ? new Date(a.item.dueDate).getTime() : Infinity;
    const db = b.item.dueDate ? new Date(b.item.dueDate).getTime() : Infinity;
    return da - db || a.pi - b.pi || a.ii - b.ii;
  });
  return open[0];
}

/** Steps finished vs scheduled in the 7 days up to `now`. */
export function weekSummary(plan, now = new Date()) {
  const from = now.getTime() - 7 * DAY;
  const items = flatItems(plan).map((x) => x.item);
  const done = items.filter((i) => i.state === 'done' && i.completedAt && new Date(i.completedAt).getTime() >= from).length;
  const open = items.filter((i) => i.state === 'created').length;
  return { done, open };
}

/** True when the plan should offer a lighter schedule instead of piling on. */
export function shouldOfferLighter(plan) {
  return (plan.skipStreak || 0) >= 3;
}

/** Moves a date forward by one day, keeping the time of day. */
export function pushOneDay(date, now = new Date()) {
  const base = date ? new Date(date) : new Date(now);
  const next = new Date(Math.max(base.getTime(), now.getTime()) + DAY);
  return next;
}

/** Makes the revise prompt context short: what is already scheduled or done, so the AI does not repeat it. */
export function lockedTitles(plan) {
  return flatItems(plan)
    .filter(({ item }) => item.state !== 'draft')
    .map(({ item }) => `${item.title} [${item.state}]`)
    .slice(0, 40);
}

/** Phases that survive a revision: everything that is no longer a draft keeps its place. */
export function keepLockedPhases(plan) {
  return (plan.phases || [])
    .map((p) => ({
      title: p.title,
      weeksLabel: p.weeksLabel,
      items: (p.items || []).filter((i) => i.state !== 'draft'),
    }))
    .filter((p) => p.items.length);
}
