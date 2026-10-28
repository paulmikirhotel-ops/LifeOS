import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  MapPin, Layers, CheckSquare
} from 'lucide-react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, 
  eachDayOfInterval, parseISO 
} from 'date-fns';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button, Card, Modal, Input, Textarea,
  Select, Badge, ErrorState, Skeleton, IconButton
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';

const TONE = {
  event: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800', card: 'border-blue-100 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-900/30', badge: 'info' },
  block: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800', card: 'border-amber-100 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-900/30', badge: 'warning' },
  task: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800', card: 'border-emerald-100 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-900/30', badge: 'success' },
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  // Fetch calendar events and schedule blocks for the month range
  const rangeParams = `from=${format(startDate, 'yyyy-MM-dd')}&to=${format(endDate, 'yyyy-MM-dd')}`;
  const { data: eventsData, loading, error, reload: reloadEvents } = useApi(`/calendar?${rangeParams}`, {
    deps: [currentMonth]
  });
  const { data: blocksData, reload: reloadBlocks } = useApi(`/schedules?${rangeParams}`, {
    deps: [currentMonth]
  });

  // Tasks with a due date show up too (a failed or forbidden request simply shows none).
  const { data: tasksData, reload: reloadTasks } = useApi(`/calendar/tasks?${rangeParams}`, {
    deps: [currentMonth]
  });

  const scheduleData = useMemo(
    () => ({ events: eventsData?.items || [], blocks: blocksData?.items || [], tasks: tasksData?.items || [] }),
    [eventsData, blocksData, tasksData]
  );
  const reload = () => { reloadEvents(); reloadBlocks(); reloadTasks(); };

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [startDate, endDate]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const eventsByDay = useMemo(() => {
    const map = {};
    if (!scheduleData) return map;
    
    // Process Calendar Events
    (scheduleData.events || []).forEach(event => {
      const dateKey = format(parseISO(event.startAt), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push({ ...event, type: 'event' });
    });

    // Process Schedule Blocks
    (scheduleData.blocks || []).forEach(block => {
      const dateKey = block.date;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push({ ...block, type: 'block' });
    });

    // Process tasks due (bucketed by the viewer's local day)
    (scheduleData.tasks || []).forEach(task => {
      if (!task.dueDate) return;
      const dateKey = format(parseISO(task.dueDate), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push({ ...task, type: 'task' });
    });

    return map;
  }, [scheduleData]);

  const onDateClick = (day) => setSelectedDate(day);
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const onSubmit = async (data) => {
    try {
      const res = await api.post('/calendar', {
        title: data.title,
        type: data.category || 'other',
        description: data.description,
        startAt: `${format(selectedDate, 'yyyy-MM-dd')}T${data.startTime}`,
        endAt: `${format(selectedDate, 'yyyy-MM-dd')}T${data.endTime}`,
      });
      if (res.success) {
        addToast('Event created');
        setIsModalOpen(false);
        reset();
        reload();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedItems = eventsByDay[selectedKey] || [];
  const timeOf = (item) => item.type === 'event'
    ? format(parseISO(item.startAt), 'h:mm a')
    : item.type === 'task'
    ? (() => { const d = parseISO(item.dueDate); return d.getHours() || d.getMinutes() ? format(d, 'h:mm a') : 'Due'; })()
    : `${Math.floor((item.startMin || 0) / 60)}:${((item.startMin || 0) % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start">
      {/* Month grid */}
      <section className="flex-1 flex flex-col min-w-0" aria-label="Calendar">
        <header className="flex flex-row items-center justify-between gap-3 mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white truncate" aria-live="polite">{format(currentMonth, 'MMMM yyyy')}</h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton icon={ChevronLeft} label="Previous month" onClick={prevMonth} className="!text-slate-500" />
            <Button variant="soft" size="sm" onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}>Today</Button>
            <IconButton icon={ChevronRight} label="Next month" onClick={nextMonth} className="!text-slate-500" />
          </div>
        </header>

        {error && !eventsData ? (
          <Card><ErrorState title="Calendar couldn't load" details={error} onRetry={reload} /></Card>
        ) : (
          <Card className="overflow-hidden flex flex-col">
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-2 text-center text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <span className="sm:hidden" aria-hidden="true">{d[0]}</span><span className="hidden sm:inline">{d}</span><span className="sr-only sm:hidden">{d}</span>
                </div>
              ))}
            </div>
            <div className={`grid grid-cols-7 min-w-0 transition-opacity ${loading ? 'opacity-60' : ''}`} role="grid" aria-label={format(currentMonth, 'MMMM yyyy')}>
              {calendarDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDay[dateKey] || [];
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => onDateClick(day)}
                    aria-pressed={isSelected}
                    aria-label={`${format(day, 'EEEE, MMMM d')}${dayEvents.length ? `, ${dayEvents.length} item${dayEvents.length > 1 ? 's' : ''}` : ''}`}
                    className={`
                      relative min-h-14 sm:min-h-24 p-1 sm:p-2 border-r border-b border-slate-100 dark:border-slate-800 text-left flex flex-col min-w-0 transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500
                      ${!isCurrentMonth ? 'bg-slate-50/60 dark:bg-slate-900/30' : ''}
                      ${isSelected ? 'bg-indigo-50/70 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
                    `}
                  >
                    <span className={`
                      text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0
                      ${isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'}
                    `}>
                      {format(day, 'd')}
                    </span>
                    {/* Phones: dots (no room for text). Larger screens: event chips. */}
                    {dayEvents.length > 0 && (
                      <span className="sm:hidden flex gap-0.5 mt-1 px-0.5" aria-hidden="true">
                        {dayEvents.slice(0, 3).map((item, i) => (
                          <span key={i} className={`w-1.5 h-1.5 rounded-full ${TONE[item.type].dot}`} />
                        ))}
                      </span>
                    )}
                    <span className="hidden sm:block mt-1 space-y-1 w-full">
                      {dayEvents.slice(0, 2).map((item, i) => (
                        <span
                          key={i}
                          className={`block text-[10px] px-1.5 py-0.5 rounded border truncate ${TONE[item.type].chip}`}
                        >
                          {item.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && <span className="block text-[10px] text-slate-400 font-bold pl-1">+{dayEvents.length - 2} more</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </section>

      {/* Day detail */}
      <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col" aria-label="Day detail">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Day Detail</h2>
          <Button size="sm" icon={Plus} onClick={() => setIsModalOpen(true)}>Add Event</Button>
        </div>
        <Card className="p-5 sm:p-6 flex flex-col gap-5">
          <div className="text-center pb-5 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{format(selectedDate, 'EEEE')}</p>
            <p className="text-3xl font-black text-slate-900 dark:text-white">{format(selectedDate, 'MMMM d')}</p>
          </div>

          {loading && !eventsData ? (
            <div className="space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : selectedItems.length > 0 ? (
            <ul className="space-y-3 lg:max-h-[50vh] lg:overflow-y-auto">
              {selectedItems.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-[11px] font-bold text-slate-400 w-14 pt-3 uppercase tabular-nums flex-shrink-0">{timeOf(item)}</span>
                  <div className={`flex-1 min-w-0 p-3 rounded-xl border ${TONE[item.type].card}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white break-words min-w-0">{item.title}</p>
                      <Badge variant={TONE[item.type].badge} className="text-[10px] flex-shrink-0">{item.meetingId ? 'meeting' : item.type === 'task' ? 'due' : item.type}</Badge>
                    </div>
                    {item.location && <div className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="w-3 h-3" aria-hidden="true" />{item.location}</div>}
                    {item.category && <div className="flex items-center gap-1 text-xs text-slate-500"><Layers className="w-3 h-3" aria-hidden="true" />{item.category}</div>}
                    {item.type === 'task' && <Link to="/tasks" className="inline-flex items-center min-h-8 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"><CheckSquare className="w-3 h-3 mr-1" aria-hidden="true" />Open tasks →</Link>}
                    {item.meetingId && <Link to={`/meetings/${item.meetingId}`} className="inline-flex items-center min-h-8 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Open meeting →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-8">
              <div className="mb-3 w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 flex items-center justify-center"><CalendarIcon className="w-6 h-6" aria-hidden="true" /></div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nothing scheduled</p>
              <p className="text-xs text-slate-400 mt-0.5">Add an event to plan this day.</p>
            </div>
          )}
        </Card>
      </aside>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`New Event — ${format(selectedDate, 'MMM d')}`}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Event Title" placeholder="What's happening?" data-autofocus {...register('title', { required: true })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Start Time" type="time" {...register('startTime', { required: true })} />
            <Input label="End Time" type="time" {...register('endTime', { required: true })} />
          </div>
          <Input label="Location" placeholder="Where? (Optional)" {...register('location')} />
          <Select
            label="Category"
            options={[
              { value: 'work', label: 'Work' },
              { value: 'personal', label: 'Personal' },
              { value: 'study', label: 'Study' },
              { value: 'other', label: 'Other' },
            ]}
            {...register('category')}
          />
          <Textarea label="Description" placeholder="Notes..." {...register('description')} />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Create Event</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
