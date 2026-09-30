import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ChevronLeft, Plus, X, Users } from 'lucide-react';
import { Button, Card, Input, Select, Textarea, Spinner } from '../../components/ui.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { MEETING_TYPES, REMINDER_OPTIONS } from '../../utils/meetingFormat.js';
import { browserTimeZone, timeZoneOptions, toUtcIso, utcToInputs } from '../../utils/tz.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatApiError } from '../../utils/errors.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FREQUENCIES = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ScheduleMeetingPage() {
  const { id } = useParams(); // present when editing
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { addToast } = useToast();
  const { user } = useAuth();
  const zones = useMemo(timeZoneOptions, []);

  const [loading, setLoading] = useState(editing);
  const [members, setMembers] = useState([]);
  const [participants, setParticipants] = useState([]); // { userId?, name, email? }
  const [external, setExternal] = useState({ name: '', email: '' });
  const [reminders, setReminders] = useState([15]);
  const [customReminder, setCustomReminder] = useState('');
  const [days, setDays] = useState([]);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const tzDefault = browserTimeZone();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: {
      title: '', description: '', date: params.get('date') || '', startTime: params.get('time') || '09:00', endTime: '',
      timezone: tzDefault, type: 'team', agenda: '', location: '', frequency: 'none', interval: 1, until: '',
    },
  });
  const frequency = watch('frequency');

  useEffect(() => {
    meetingsApi.members().then((r) => setMembers(r.data.items)).catch(() => {});
  }, []);

  // End time defaults to start + 1 h when arriving from a calendar slot.
  useEffect(() => {
    if (editing) return;
    const t = params.get('time');
    if (t) {
      const [h, m] = t.split(':').map(Number);
      reset((v) => ({ ...v, endTime: `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}` }));
    } else {
      reset((v) => ({ ...v, endTime: '10:00' }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing) return;
    meetingsApi
      .get(id)
      .then((r) => {
        const m = r.data;
        if (m.status !== 'scheduled') {
          addToast(`A ${m.status} meeting can't be edited`, 'error');
          navigate(`/meetings/${id}`, { replace: true });
          return;
        }
        const tz = m.timezone || 'UTC';
        const s = utcToInputs(m.startAt, tz);
        const e = utcToInputs(m.endAt, tz);
        reset({ title: m.title, description: m.description || '', date: s.date, startTime: s.time, endTime: e.time, timezone: tz, type: m.type, agenda: m.agenda || '', location: m.location || '', frequency: 'none', interval: 1, until: '' });
        setParticipants((m.participants || []).filter((p) => String(p.userId) !== String(user?.id)).map((p) => ({ userId: p.userId, name: p.name, email: p.email })));
        setReminders(m.reminders || []);
      })
      .catch((err) => {
        addToast(formatApiError(err), 'error');
        navigate('/meetings', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIds = new Set(participants.filter((p) => p.userId).map((p) => String(p.userId)));
  const toggleMember = (m) =>
    setParticipants((list) =>
      selectedIds.has(m.id) ? list.filter((p) => String(p.userId) !== m.id) : [...list, { userId: m.id, name: m.name }]
    );

  const addExternal = () => {
    const name = external.name.trim();
    const email = external.email.trim();
    if (!name) return;
    if (email && !EMAIL_RE.test(email)) return setFormError('Enter a valid email for the guest, or leave it empty.');
    setFormError(null);
    setParticipants((l) => [...l, { name, ...(email ? { email } : {}) }]);
    setExternal({ name: '', email: '' });
  };

  const toggleReminder = (v) => setReminders((r) => (r.includes(v) ? r.filter((x) => x !== v) : [...r, v].sort((a, b) => b - a)));
  const addCustomReminder = () => {
    const n = parseInt(customReminder, 10);
    if (!Number.isFinite(n) || n < 1 || n > 10080) return setFormError('Custom reminder must be between 1 and 10080 minutes.');
    setFormError(null);
    if (!reminders.includes(n) && reminders.length < 5) setReminders([...reminders, n].sort((a, b) => b - a));
    setCustomReminder('');
  };

  const onSubmit = async (v) => {
    setFormError(null);
    const startAt = toUtcIso(v.date, v.startTime, v.timezone);
    const endAt = toUtcIso(v.date, v.endTime, v.timezone);
    if (new Date(endAt) <= new Date(startAt)) return setFormError('The end time must be after the start time.');
    if (!editing && new Date(endAt) < new Date()) return setFormError('That time is already in the past.');
    if (reminders.length > 5) return setFormError('Choose at most 5 reminders.');

    const body = {
      title: v.title.trim(),
      description: v.description.trim() || undefined,
      type: v.type,
      agenda: v.agenda.trim() || undefined,
      location: v.location.trim() || undefined,
      timezone: v.timezone,
      startAt,
      endAt,
      reminders,
      participants,
    };
    if (!editing && v.frequency !== 'none') {
      body.recurrence = {
        frequency: v.frequency,
        interval: parseInt(v.interval, 10) || 1,
        ...(['weekly', 'custom'].includes(v.frequency) && days.length ? { daysOfWeek: days } : {}),
        ...(v.until ? { until: toUtcIso(v.until, '23:59', v.timezone) } : {}),
      };
    }

    setSaving(true);
    try {
      const res = editing ? await meetingsApi.update(id, body) : await meetingsApi.create(body);
      const n = res.data.occurrences;
      addToast(editing ? 'Meeting updated' : n > 1 ? `${n} meetings scheduled` : 'Meeting scheduled');
      navigate(`/meetings/${res.data.id}`);
    } catch (err) {
      setFormError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-28 md:pb-8">
      <Link to={editing ? `/meetings/${id}` : '/meetings'} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600">
        <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back
      </Link>
      <h1 className="text-2xl font-black text-slate-900 dark:text-white">{editing ? 'Edit meeting' : 'Schedule meeting'}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Card className="p-5 space-y-4">
          <Input label="Meeting title" placeholder="e.g. Sprint planning" maxLength={200} error={errors.title && 'A title is required'} {...register('title', { required: true, validate: (v) => v.trim().length > 0 })} />
          <Textarea label="Description" rows={2} maxLength={5000} {...register('description')} />
          <Select label="Meeting type" options={MEETING_TYPES} {...register('type')} />
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">When</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Date" type="date" error={errors.date && 'Pick a date'} {...register('date', { required: true })} />
            <Input label="Start time" type="time" error={errors.startTime && 'Required'} {...register('startTime', { required: true })} />
            <Input label="End time" type="time" error={errors.endTime && 'Required'} {...register('endTime', { required: true })} />
          </div>
          <Select label="Time zone" options={zones} {...register('timezone')} />

          {!editing && (
            <div className="space-y-3">
              <Select label="Repeat" options={FREQUENCIES} {...register('frequency')} />
              {frequency !== 'none' && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label={frequency === 'monthly' ? 'Every N months' : frequency === 'weekly' ? 'Every N weeks' : 'Every N days'} type="number" min={1} max={52} {...register('interval')} />
                    <Input label="Repeat until (optional)" type="date" {...register('until')} />
                  </div>
                  {(frequency === 'weekly' || frequency === 'custom') && (
                    <fieldset>
                      <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">On these days</legend>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((d, i) => (
                          <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => setDays((x) => (x.includes(i) ? x.filter((n) => n !== i) : [...x, i]))}
                            className={`min-h-[40px] min-w-[44px] rounded-lg border px-3 text-sm font-medium ${days.includes(i) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <p className="text-xs text-slate-500">Up to 60 occurrences within the next 6 months are created, each as its own meeting you can record separately.</p>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Users className="w-4 h-4" aria-hidden="true" /> Participants</h2>
          {members.length > 0 && (
            <fieldset>
              <legend className="text-xs text-slate-500 mb-2">Workspace members (they can view this meeting)</legend>
              <div className="flex flex-wrap gap-2">
                {members.filter((m) => String(m.id) !== String(user?.id)).map((m) => (
                  <button key={m.id} type="button" aria-pressed={selectedIds.has(m.id)} onClick={() => toggleMember(m)}
                    className={`min-h-[40px] rounded-full border px-3.5 text-sm ${selectedIds.has(m.id) ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {m.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Input label="Add a guest" placeholder="Name" value={external.name} onChange={(e) => setExternal({ ...external, name: e.target.value })} maxLength={120} />
            <Input label="Email (optional)" type="email" placeholder="guest@example.com" value={external.email} onChange={(e) => setExternal({ ...external, email: e.target.value })} />
            <Button type="button" variant="secondary" icon={Plus} onClick={addExternal} disabled={!external.name.trim()}>Add</Button>
          </div>
          {participants.filter((p) => !p.userId).length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {participants.map((p, i) => !p.userId && (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-sm dark:text-slate-200">
                  {p.name}{p.email ? <span className="text-xs text-slate-400">· {p.email}</span> : null}
                  <button type="button" onClick={() => setParticipants((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`} className="text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">Guests are listed on the minutes but don’t get access. You are added as chairperson automatically.</p>
        </Card>

        <Card className="p-5 space-y-4">
          <Textarea label="Agenda" rows={4} placeholder={'1. Status update\n2. Blockers\n3. Next steps'} maxLength={10000} {...register('agenda')} />
          <Input label="Location or meeting link" placeholder="Room 2, or https://…" maxLength={500} {...register('location')} />
          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Reminders</legend>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((r) => (
                <button key={r.value} type="button" aria-pressed={reminders.includes(r.value)} onClick={() => toggleReminder(r.value)}
                  className={`min-h-[40px] rounded-lg border px-3 text-sm ${reminders.includes(r.value) ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {r.label}
                </button>
              ))}
              {reminders.filter((r) => !REMINDER_OPTIONS.some((o) => o.value === r)).map((r) => (
                <button key={r} type="button" onClick={() => toggleReminder(r)} className="min-h-[40px] rounded-lg border border-indigo-600 bg-indigo-50 px-3 text-sm text-indigo-700" aria-label={`Remove ${r} minute reminder`}>
                  {r} min <X className="inline w-3 h-3 ml-1" />
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-end gap-2 max-w-xs">
              <Input label="Custom (minutes before)" type="number" min={1} max={10080} value={customReminder} onChange={(e) => setCustomReminder(e.target.value)} />
              <Button type="button" variant="secondary" onClick={addCustomReminder} disabled={!customReminder}>Add</Button>
            </div>
          </fieldset>
        </Card>

        {formError && <p role="alert" className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{formError}</p>}

        <div className="fixed inset-x-0 bottom-14 md:static z-30 border-t md:border-0 border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 md:bg-transparent backdrop-blur px-4 py-3 md:p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-0 flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} className="min-h-[44px]">Cancel</Button>
          <Button type="submit" loading={saving} className="min-h-[44px] flex-1 md:flex-none">{editing ? 'Save changes' : 'Schedule meeting'}</Button>
        </div>
      </form>
    </div>
  );
}
