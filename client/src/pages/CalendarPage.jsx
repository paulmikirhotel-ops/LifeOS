import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, 
  Clock, MapPin, X, Layers
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
  Select, Spinner, Badge 
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';

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
  const { data: eventsData, loading, reload: reloadEvents } = useApi(`/calendar?${rangeParams}`, {
    deps: [currentMonth]
  });
  const { data: blocksData, reload: reloadBlocks } = useApi(`/schedules?${rangeParams}`, {
    deps: [currentMonth]
  });

  const scheduleData = useMemo(
    () => ({ events: eventsData?.items || [], blocks: blocksData?.items || [] }),
    [eventsData, blocksData]
  );
  const reload = () => { reloadEvents(); reloadBlocks(); };

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

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-160px)]">
      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold dark:text-white truncate">{format(currentMonth, 'MMMM yyyy')}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors">
              Today
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </header>

        <Card className="flex-1 overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2 text-center text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">{d}</div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 grid-rows-6 min-w-0">
            {calendarDays.map((day, idx) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay[dateKey] || [];
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, monthStart);

              return (
                <div 
                  key={idx}
                  onClick={() => onDateClick(day)}
                  className={`
                    min-h-[60px] sm:min-h-[80px] p-1 sm:p-2 border-r border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-all
                    ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-900/20' : ''}
                    ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10 ring-1 ring-inset ring-indigo-500/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
                  `}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`
                      text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                      ${isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-700'}
                    `}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((item, i) => (
                      <div 
                        key={i} 
                        className={`text-[9px] px-1.5 py-0.5 rounded border truncate ${item.type === 'event' ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' : 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'}`}
                      >
                        {item.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[9px] text-slate-400 font-bold pl-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Detail Panel */}
      <aside className="w-full lg:w-80 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold dark:text-white">Day Detail</h2>
          <Button size="sm" icon={Plus} onClick={() => setIsModalOpen(true)}>Add Event</Button>
        </div>
        <Card className="flex-1 p-6 flex flex-col space-y-6">
          <div className="text-center pb-6 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-bold text-indigo-600 uppercase tracking-widest">{format(selectedDate, 'EEEE')}</p>
            <p className="text-3xl font-black dark:text-white">{format(selectedDate, 'MMMM d')}</p>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {eventsByDay[format(selectedDate, 'yyyy-MM-dd')]?.length > 0 ? (
              eventsByDay[format(selectedDate, 'yyyy-MM-dd')].map((item, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className="text-[10px] font-bold text-slate-400 w-12 pt-1 uppercase">
                    {item.type === 'event' 
                      ? format(parseISO(item.startAt), 'h:mm a') 
                      : `${Math.floor(item.startMin/60)}:${(item.startMin%60).toString().padStart(2, '0')}`
                    }
                  </div>
                  <div className={`flex-1 p-3 rounded-xl border ${item.type === 'event' ? 'border-blue-100 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-900/30' : 'border-amber-100 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-900/30'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold dark:text-white">{item.title}</p>
                      <Badge variant={item.type === 'event' ? 'info' : 'warning'} className="text-[8px]">{item.meetingId ? 'meeting' : item.type}</Badge>
                    </div>
                    {item.location && <div className="flex items-center gap-1 text-[10px] text-slate-500"><MapPin className="w-2 h-2" />{item.location}</div>}
                    {item.category && <div className="flex items-center gap-1 text-[10px] text-slate-500"><Layers className="w-2 h-2" />{item.category}</div>}
                    {item.meetingId && <Link to={`/meetings/${item.meetingId}`} className="inline-block mt-1 text-[10px] font-bold text-indigo-600 hover:underline">Open meeting →</Link>}
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-10">
                <CalendarIcon className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-500">No events scheduled</p>
              </div>
            )}
          </div>
        </Card>
      </aside>

      {/* Create Event Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={`New Event — ${format(selectedDate, 'MMM d')}`}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Event Title" placeholder="What's happening?" {...register('title', { required: true })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Start Time" type="time" {...register('startTime', { required: true })} />
            <Input label="End Time" type="time" {...register('endTime', { required: true })} />
          </div>
          <Input label="Location" placeholder="Where? (Optional)" {...register('location')} />
          <Select 
            label="Category" 
            options={[
              {value: 'work', label: 'Work'}, 
              {value: 'personal', label: 'Personal'}, 
              {value: 'study', label: 'Study'}, 
              {value: 'other', label: 'Other'}
            ]} 
            {...register('category')}
          />
          <Textarea label="Description" placeholder="Notes..." {...register('description')} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Create Event</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
