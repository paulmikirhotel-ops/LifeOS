import React, { useState } from 'react';
import { 
  Flame, Plus, MoreVertical, Edit2, 
  Trash2, CheckCircle2, Circle, Trophy,
  ChevronLeft, ChevronRight, Zap
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { 
  Button, Card, Badge, Spinner, Modal, 
  Input, Select, EmptyState 
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';
import { todayStr } from '../utils/format.js';
import { format, subDays, isSameDay } from 'date-fns';

export default function HabitsPage() {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);

  const { data: habits, loading, reload } = useApi('/habits');

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const handleToggle = async (habitId, isCompletedToday) => {
    try {
      if (isCompletedToday) {
        await api.delete(`/habits/${habitId}/log?date=${todayStr()}`);
        addToast('Log removed');
      } else {
        await api.post(`/habits/${habitId}/log`, { date: todayStr() });
        addToast('Habit completed! Keep it up 🔥');
      }
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const openModal = (habit = null) => {
    if (habit) {
      setEditingHabit(habit);
      setValue('name', habit.name);
      setValue('goal', habit.targetPerDay || 7);
    } else {
      setEditingHabit(null);
      reset();
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data) => {
    try {
      // The API models targetPerDay (daily goal), not weekly frequency/goal.
      const payload = { name: data.name, targetPerDay: data.goal || 7 };
      const res = editingHabit 
        ? await api.patch(`/habits/${editingHabit._id}`, payload)
        : await api.post('/habits', payload);
      if (res.success) {
        addToast(editingHabit ? 'Habit updated' : 'Habit created');
        setIsModalOpen(false);
        reload();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const deleteHabit = async (id) => {
    if (!confirm('Delete this habit? Statistics will be lost.')) return;
    try {
      await api.delete(`/habits/${id}`);
      addToast('Habit deleted');
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const last7Days = Array.from({ length: 7 }).map((_, i) => subDays(new Date(), 6 - i));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Habits</h1>
          <p className="text-sm text-slate-500 font-medium">Build consistency and transform your life</p>
        </div>
        <Button icon={Plus} onClick={() => openModal()} className="w-full sm:w-auto">New Habit</Button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : habits?.items?.length > 0 ? (
          habits.items.map(habit => {
            const isCompletedToday = habit.logs?.some(l => isSameDay(new Date(l.date), new Date()));
            const streak = habit.streak || 0;

            return (
              <Card key={habit._id} className="p-6 group relative">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-2xl ${isCompletedToday ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-50 text-slate-400 dark:bg-slate-800'}`}>
                    <CheckCircle2 className={`w-6 h-6 ${isCompletedToday ? 'fill-emerald-100 dark:fill-emerald-900/50' : ''}`} />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openModal(habit)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteHabit(habit._id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                <h3 className="text-lg font-bold dark:text-white mb-1">{habit.name}</h3>
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-500">
                    <Flame className="w-4 h-4" /> {streak} Day Streak
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <Trophy className="w-3 h-3" /> Best: {habit.bestStreak || 0}
                  </div>
                </div>

                {/* Heat strip */}
                <div className="flex justify-between gap-1 mb-6">
                  {last7Days.map((day, idx) => {
                    const done = habit.logs?.some(l => isSameDay(new Date(l.date), day));
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-100 dark:border-slate-800 text-slate-300'}`}>
                          {done && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">{format(day, 'EEE')}</span>
                      </div>
                    );
                  })}
                </div>

                <Button 
                  className={`w-full font-bold py-3 rounded-xl transition-all ${isCompletedToday ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'}`}
                  variant={isCompletedToday ? 'secondary' : 'primary'}
                  icon={isCompletedToday ? CheckCircle2 : Plus}
                  onClick={() => handleToggle(habit._id, isCompletedToday)}
                >
                  {isCompletedToday ? 'Completed Today' : 'Log Completion'}
                </Button>
              </Card>
            );
          })
        ) : (
          <EmptyState 
            icon={Zap} 
            title="No habits tracked" 
            description="Start building a better you by tracking your first habit."
            action={<Button icon={Plus} onClick={() => openModal()}>Add Habit</Button>}
          />
        )}
      </div>

      {/* Habit Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingHabit ? 'Edit Habit' : 'Create New Habit'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Habit Name" placeholder="e.g., Morning Run, Read 20 pages" {...register('name', { required: true })} />
          <Select 
            label="Frequency" 
            options={[{value:'daily', label:'Daily'}, {value:'weekly', label:'Weekly'}]}
            {...register('frequency', { required: true })}
          />
          <Input label="Goal (per week)" type="number" defaultValue={7} {...register('goal', { valueAsNumber: true })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Habit</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
