import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Plus, Pencil, X, Check, Clock, Sparkles, Archive, AlertCircle, CalendarDays } from 'lucide-react';
import { nextstepApi } from '../api/nextstep.js';
import { useToast } from '../context/ToastContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { formatApiError } from '../utils/errors.js';
import { Button, Card, Badge, Spinner, Modal, Input, Select, Textarea, EmptyState } from '../components/ui.jsx';

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const niceDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function NextStepPage() {
  const { addToast } = useToast();
  const { can } = useTenant();
  const canWrite = can('goals.create');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState({ used: 0, limit: 5, left: 5 });
  const [aiOn, setAiOn] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false); // show the "new goal" form
  const [busy, setBusy] = useState(''); // '' | 'draft' | 'revise' | 'approve' | 'save'

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await nextstepApi.list();
      setPlans(res.data.items);
      setUsage(res.data.usage);
      setAiOn(res.data.aiConfigured);
      setSelectedId((cur) => cur && res.data.items.some((p) => p._id === cur) ? cur : res.data.items[0]?._id || null);
    } catch (err) {
      setLoadError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const plan = useMemo(() => plans.find((p) => p._id === selectedId) || null, [plans, selectedId]);

  const putPlan = (next) => setPlans((all) => (all.some((p) => p._id === next._id) ? all.map((p) => (p._id === next._id ? next : p)) : [next, ...all]));

  const run = async (kind, fn, okMsg) => {
    setBusy(kind);
    try {
      const res = await fn();
      if (okMsg) addToast(okMsg);
      return res.data;
    } catch (err) {
      addToast(formatApiError(err), 'error');
      if (err?.code === 'AI_ALLOWANCE_USED') setUsage((u) => ({ ...u, used: u.limit, left: 0 }));
      return null;
    } finally {
      setBusy('');
    }
  };

  const onCreate = async (form) => {
    const data = await run('draft', () => nextstepApi.create(form), 'Draft ready. Nothing is in your tasks until you approve it.');
    if (data) {
      putPlan(data.plan);
      setUsage(data.usage);
      setSelectedId(data.plan._id);
      setCreating(false);
    }
  };

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner size="lg" /></div>;

  if (loadError) {
    return (
      <Card className="p-6 max-w-xl mx-auto text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" aria-hidden="true" />
        <h2 className="font-bold dark:text-white">NextStep could not load</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">{loadError}</p>
        <Button onClick={load}>Try again</Button>
      </Card>
    );
  }

  const showForm = creating || !plans.length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Compass className="w-6 h-6 text-indigo-600" aria-hidden="true" /> NextStep
          </h1>
          <p className="text-sm text-slate-500">Turn one goal into a roadmap you control. Nothing is added until you approve it.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={usage.left ? 'info' : 'warning'}>AI drafts today: {usage.used}/{usage.limit}</Badge>
          {canWrite && plans.length > 0 && !showForm && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCreating(true)}>New goal</Button>
          )}
        </div>
      </header>

      {!aiOn && (
        <Card className="p-4 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            AI is not set up on the server yet, so new drafts are unavailable. Ask the admin to set the AI variables. Your existing roadmaps still work.
          </p>
        </Card>
      )}

      {showForm && (
        <GoalForm
          busy={busy === 'draft'}
          disabled={!canWrite || !aiOn || usage.left === 0}
          reason={!canWrite ? 'You do not have permission to create roadmaps.' : !aiOn ? 'AI is not set up on the server.' : usage.left === 0 ? "You have used today's AI drafts. It resets tomorrow (UTC)." : ''}
          onSubmit={onCreate}
          onCancel={plans.length ? () => setCreating(false) : null}
        />
      )}

      {!showForm && plan && (
        <>
          {plans.length > 1 && (
            <Select
              label="Roadmap"
              value={selectedId || ''}
              onChange={(e) => setSelectedId(e.target.value)}
              options={plans.map((p) => ({ value: p._id, label: p.title }))}
            />
          )}
          <PlanView
            key={plan._id}
            plan={plan}
            usage={usage}
            busy={busy}
            canWrite={canWrite}
            aiOn={aiOn}
            run={run}
            putPlan={putPlan}
            setUsage={setUsage}
            onArchived={() => {
              setPlans((all) => all.filter((p) => p._id !== plan._id));
              setSelectedId(null);
              load();
            }}
          />
        </>
      )}
    </div>
  );
}

function GoalForm({ busy, disabled, reason, onSubmit, onCancel }) {
  const [goalText, setGoalText] = useState('');
  const [hoursPerWeek, setHours] = useState('5');
  const [targetDate, setTarget] = useState('');
  const tooShort = goalText.trim().length < 8;

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-bold dark:text-white">What do you want to achieve?</h2>
      <p className="text-sm text-slate-500 mt-1 mb-4">Describe one goal in your own words. NextStep drafts a roadmap you can edit before anything is added.</p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (tooShort || disabled) return;
          onSubmit({ goalText: goalText.trim(), hoursPerWeek: Number(hoursPerWeek) || 5, ...(targetDate ? { targetDate } : {}) });
        }}
      >
        <Textarea
          label="Your goal"
          rows={3}
          maxLength={1000}
          placeholder="For example: pass my driving test by March"
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Hours per week you can give" type="number" min="1" max="60" value={hoursPerWeek} onChange={(e) => setHours(e.target.value)} />
          <Input label="Target date (optional)" type="date" min={dateOnly(new Date(Date.now() + 86400000))} value={targetDate} onChange={(e) => setTarget(e.target.value)} />
        </div>
        {reason && <p className="text-sm text-amber-700 dark:text-amber-400">{reason}</p>}
        {busy && <p className="text-sm text-slate-500">Drafting your roadmap. Free AI can take up to a minute. Please keep this page open.</p>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={tooShort || disabled}>Draft my roadmap</Button>
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        </div>
      </form>
    </Card>
  );
}

function PlanView({ plan, usage, busy, canWrite, aiOn, run, putPlan, setUsage, onArchived }) {
  const [edit, setEdit] = useState(null); // { item?, phaseId }
  const [note, setNote] = useState('');
  const reviseRef = useRef(null);

  const drafts = plan.phases.flatMap((p) => p.items).filter((i) => i.state === 'draft');
  const approvedCount = drafts.filter((i) => i.approved).length;
  const nextItem = plan.nextItemId ? plan.phases.flatMap((p) => p.items).find((i) => i._id === plan.nextItemId) : null;

  const toggle = async (item) => {
    const data = await run('save', () => nextstepApi.patchItem(plan._id, item._id, { approved: !item.approved }));
    if (data) putPlan(data);
  };
  const setAll = async (value) => {
    let latest = null;
    for (const i of drafts.filter((d) => d.approved !== value)) {
      const res = await run('save', () => nextstepApi.patchItem(plan._id, i._id, { approved: value }));
      if (!res) break;
      latest = res;
    }
    if (latest) putPlan(latest);
  };
  const remove = async (item) => {
    const data = await run('save', () => nextstepApi.removeItem(plan._id, item._id));
    if (data) putPlan(data);
  };
  const approve = async () => {
    const data = await run('approve', () => nextstepApi.approve(plan._id));
    if (data) {
      putPlan(data.plan);
      addToast2(data.created);
    }
  };
  const { addToast } = useToast();
  const addToast2 = ({ tasks, events }) => {
    const parts = [];
    if (tasks) parts.push(`${tasks} task${tasks > 1 ? 's' : ''}`);
    if (events) parts.push(`${events} event${events > 1 ? 's' : ''}`);
    addToast(`Added ${parts.join(' and ')}. Find them in Tasks and Calendar.`);
  };
  const revise = async () => {
    const data = await run('revise', () => nextstepApi.revise(plan._id, note), 'Roadmap revised. Review the new steps.');
    if (data) {
      putPlan(data.plan);
      setUsage(data.usage);
      setNote('');
    }
  };
  const mark = async (action) => {
    const data = await run('save', () => nextstepApi.mark(plan._id, nextItem._id, action), action === 'done' ? 'Nice. Step completed.' : 'Moved to tomorrow.');
    if (data) putPlan(data);
  };
  const archive = async () => {
    if (!window.confirm('Archive this roadmap? Tasks and events already created are kept.')) return;
    const data = await run('save', () => nextstepApi.archive(plan._id));
    if (data) onArchived();
  };
  const saveEdit = async (form) => {
    const data = await run('save', () =>
      edit.item ? nextstepApi.patchItem(plan._id, edit.item._id, form) : nextstepApi.addItem(plan._id, { ...form, phaseId: edit.phaseId })
    );
    if (data) {
      putPlan(data);
      setEdit(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant={plan.status === 'active' ? 'success' : 'info'}>{plan.status === 'active' ? 'Active' : 'Draft, not saved to tasks yet'}</Badge>
            <h2 className="text-xl font-bold dark:text-white mt-2">{plan.title}</h2>
            {plan.summary && <p className="text-sm text-slate-500 mt-1">{plan.summary}</p>}
          </div>
          <div className="text-right text-sm text-slate-500">
            {plan.targetDate && <div className="flex items-center gap-1 justify-end"><CalendarDays className="w-4 h-4" aria-hidden="true" /> {niceDate(plan.targetDate)}</div>}
            <div>{plan.hoursPerWeek} h/week</div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1"><span className="text-slate-500">Progress</span><span className="font-semibold dark:text-white">{plan.progress}%</span></div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={plan.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-indigo-600 transition-all" style={{ width: `${plan.progress}%` }} />
          </div>
        </div>
      </Card>

      {nextItem && (
        <Card className="p-5 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30">
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">Your next step</div>
          <div className="font-semibold dark:text-white mt-1">{nextItem.title}</div>
          <div className="text-sm text-slate-500">{nextItem.estimatedMinutes} min · due {niceDate(nextItem.dueDate)}</div>
          {canWrite && (
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" icon={Check} loading={busy === 'save'} onClick={() => mark('done')}>Done</Button>
              <Button size="sm" variant="secondary" icon={Clock} disabled={busy === 'save'} onClick={() => mark('later')}>Not today</Button>
            </div>
          )}
        </Card>
      )}

      {plan.offerLighter && canWrite && aiOn && (
        <Card className="p-4 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-300">You have moved steps 3 days in a row. A lighter plan may fit better than piling on.</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              setNote('Make the remaining steps lighter: fewer steps per week and shorter sessions.');
              reviseRef.current?.focus();
            }}
          >
            Ask for a lighter plan
          </Button>
        </Card>
      )}

      <div className="space-y-4">
        {plan.phases.map((phase) => (
          <Card key={phase._id} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold dark:text-white">{phase.title}</h3>
              <span className="text-sm text-slate-500">{phase.weeksLabel}</span>
            </div>
            <ul>
              {phase.items.map((item) => (
                <ItemRow key={item._id} item={item} canWrite={canWrite} onToggle={() => toggle(item)} onEdit={() => setEdit({ item, phaseId: phase._id })} onRemove={() => remove(item)} />
              ))}
            </ul>
            {canWrite && (
              <button
                type="button"
                onClick={() => setEdit({ phaseId: phase._id })}
                className="w-full min-h-[44px] px-5 text-left text-sm text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800"
              >
                + Add a step
              </button>
            )}
          </Card>
        ))}
      </div>

      {canWrite && drafts.length > 0 && (
        <div className="sticky bottom-20 md:bottom-4 z-10">
          <Card className="p-3 sm:p-4 shadow-lg flex flex-wrap items-center gap-2 justify-between">
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)} disabled={busy === 'save'}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => setAll(false)} disabled={busy === 'save'}>Clear</Button>
            </div>
            <Button loading={busy === 'approve'} disabled={!approvedCount} onClick={approve}>
              Add {approvedCount} approved to Tasks and Calendar
            </Button>
          </Card>
        </div>
      )}

      {canWrite && (
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold dark:text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-600" aria-hidden="true" /> Ask AI to revise</h3>
          <p className="text-sm text-slate-500">Steps already in your tasks stay. Only the draft steps are replaced. AI drafts left today: {usage.left}.</p>
          <Textarea ref={reviseRef} rows={2} maxLength={500} placeholder="For example: I only have weekends, and I want to skip the video courses" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2 justify-between">
            <Button variant="secondary" loading={busy === 'revise'} disabled={!aiOn || usage.left === 0 || note.trim().length < 4} onClick={revise}>Revise roadmap</Button>
            <Button variant="ghost" icon={Archive} onClick={archive}>Archive roadmap</Button>
          </div>
        </Card>
      )}

      <EditModal edit={edit} busy={busy === 'save'} onClose={() => setEdit(null)} onSave={saveEdit} />
    </div>
  );
}

function ItemRow({ item, canWrite, onToggle, onEdit, onRemove }) {
  const meta = `${item.kind === 'event' ? 'Event' : 'Task'} · ${item.estimatedMinutes} min · ${niceDate(item.dueDate)}`;
  const isDraft = item.state === 'draft';
  return (
    <li className="flex items-center gap-1 pl-1 pr-2 sm:pr-3 border-t first:border-t-0 border-slate-100 dark:border-slate-800">
      {isDraft && canWrite ? (
        <button type="button" onClick={onToggle} aria-pressed={item.approved} aria-label={`Approve: ${item.title}`} className="w-11 h-11 shrink-0 flex items-center justify-center">
          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${item.approved ? 'bg-indigo-600 border-indigo-600' : 'border-slate-400 bg-white dark:bg-slate-900'}`}>
            {item.approved && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
          </span>
        </button>
      ) : (
        <span className="w-11 h-11 shrink-0 flex items-center justify-center">
          <span className={`w-2.5 h-2.5 rounded-full ${item.state === 'done' ? 'bg-emerald-500' : item.state === 'created' ? 'bg-indigo-500' : 'bg-slate-300'}`} />
        </span>
      )}
      <div className="flex-1 min-w-0 py-2">
        <div className={`text-sm ${item.state === 'done' ? 'line-through text-slate-400' : item.state === 'skipped' ? 'text-slate-400' : 'dark:text-white'}`}>{item.title}</div>
        <div className="text-xs text-slate-500">{meta}</div>
      </div>
      {item.state === 'created' && <Badge variant="info">In your tasks</Badge>}
      {item.state === 'done' && <Badge variant="success">Done</Badge>}
      {item.state === 'skipped' && <Badge variant="warning">Removed</Badge>}
      {isDraft && canWrite && (
        <>
          <button type="button" onClick={onEdit} aria-label={`Edit: ${item.title}`} className="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"><Pencil className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" onClick={onRemove} aria-label={`Remove: ${item.title}`} className="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-red-600"><X className="w-4 h-4" aria-hidden="true" /></button>
        </>
      )}
    </li>
  );
}

function EditModal({ edit, busy, onClose, onSave }) {
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (!edit) return setForm(null);
    const i = edit.item;
    setForm({
      title: i?.title || '',
      kind: i?.kind || 'task',
      priority: i?.priority || 'medium',
      estimatedMinutes: String(i?.estimatedMinutes || 45),
      dueDate: dateOnly(i?.dueDate || new Date(Date.now() + 7 * 86400000)),
    });
  }, [edit]);
  if (!edit || !form) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal isOpen onClose={onClose} title={edit.item ? 'Edit step' : 'Add a step'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) return;
          onSave({ title: form.title.trim(), kind: form.kind, priority: form.priority, estimatedMinutes: Number(form.estimatedMinutes) || 45, ...(form.dueDate ? { dueDate: form.dueDate } : {}) });
        }}
      >
        <Input label="Step" value={form.title} maxLength={140} onChange={set('title')} autoFocus />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Type" value={form.kind} onChange={set('kind')} options={[{ value: 'task', label: 'Task' }, { value: 'event', label: 'Calendar event (09:00 UTC)' }]} />
          <Select label="Priority" value={form.priority} onChange={set('priority')} options={PRIORITIES} />
          <Input label="Minutes" type="number" min="10" max="600" value={form.estimatedMinutes} onChange={set('estimatedMinutes')} />
          <Input label="Due" type="date" value={form.dueDate} onChange={set('dueDate')} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
