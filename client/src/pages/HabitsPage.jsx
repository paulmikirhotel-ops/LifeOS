import React, { useState } from 'react';
import { Flame, Plus, Edit2, Trash2, CheckCircle2, Trophy, Zap, Check } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button, Card, Modal, Input, Select, EmptyState, ErrorState, SkeletonCard, PageHeader, IconButton, ConfirmDialog
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';
import { todayStr } from '../utils/format.js';
import { format, subDays, isSameDay } from 'date-fns';

export default function HabitsPage() {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { data: habits, loading, error, reload } = useApi('/habits');
  const items = Array.isArray(habits?.items) ? habits.items : [];

  const { register, handleSubmit, reset, setValue } = useForm();

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

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/habits/${toDelete._id}`);
      addToast('Habit deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const last7Days = Array.from({ length: 7 }).map((_, i) => subDays(new Date(), 6 - i));
  const doneToday = items.filter((h) => h.logs?.some((l) => isSameDay(new Date(l.date), new Date()))).length;

  return (
    <div className="space-y-6 sm:space-y-8 pb-10 max-w-6xl mx-auto">
      <PageHeader
        title="Habits"
        description={items.length > 0 ? `${doneToday} of ${items.length} done today` : 'Build consistency and transform your life'}
        actions={<Button icon={Plus} onClick={() => openModal()} className="w-full sm:w-auto">New Habit</Button>}
      />

      {loading && !habits ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={4} />)}
        </div>
      ) : error && !habits ? (
        <Card><ErrorState title="Habits couldn't load" details={error} onRetry={reload} /></Card>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {items.map((habit) => {
            const isCompletedToday = habit.logs?.some((l) => isSameDay(new Date(l.date), new Date()));
            const streak = habit.streak || 0;

            return (
              <Card key={habit._id} className="p-5 sm:p-6 min-w-0">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-2xl transition-colors ${isCompletedToday ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-slate-50 text-slate-400 dark:bg-slate-800'}`}>
                    <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div className="flex items-center -mr-2 -mt-1">
                    <IconButton icon={Edit2} label={`Edit ${habit.name}`} onClick={() => openModal(habit)} />
                    <IconButton icon={Trash2} tone="danger" label={`Delete ${habit.name}`} onClick={() => setToDelete(habit)} />
                  </div>
                </div>

                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1 break-words">{habit.name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5">
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-500">
                    <Flame className="w-4 h-4" aria-hidden="true" /> {streak} day streak
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <Trophy className="w-3 h-3" aria-hidden="true" /> Best {habit.bestStreak || 0}
                  </div>
                </div>

                {/* Last 7 days */}
                <div className="grid grid-cols-7 gap-1.5 mb-5" role="group" aria-label="Last 7 days">
                  {last7Days.map((day, idx) => {
                    const done = habit.logs?.some((l) => isSameDay(new Date(l.date), day));
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1 min-w-0" title={`${format(day, 'EEEE')}: ${done ? 'done' : 'not done'}`}>
                        <div className={`w-full aspect-square max-w-9 rounded-lg flex items-center justify-center border-2 transition-colors ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-100 dark:border-slate-800 text-slate-300'}`}>
                          {done && <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />}
                          <span className="sr-only">{format(day, 'EEEE')}: {done ? 'done' : 'not done'}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase" aria-hidden="true">{format(day, 'EEEEE')}</span>
                      </div>
                    );
                  })}
                </div>

                <Button
                  className="w-full"
                  variant={isCompletedToday ? 'soft' : 'primary'}
                  icon={isCompletedToday ? CheckCircle2 : Plus}
                  aria-pressed={!!isCompletedToday}
                  onClick={() => handleToggle(habit._id, isCompletedToday)}
                >
                  {isCompletedToday ? 'Completed today' : 'Log completion'}
                </Button>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Zap}
            title="No habits tracked yet"
            description="Start building a better you by tracking your first habit."
            action={<Button icon={Plus} onClick={() => openModal()}>Add habit</Button>}
          />
        </Card>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingHabit ? 'Edit Habit' : 'Create New Habit'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Habit Name" placeholder="e.g., Morning Run, Read 20 pages" data-autofocus {...register('name', { required: true })} />
          <Select
            label="Frequency"
            options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
            {...register('frequency', { required: true })}
          />
          <Input label="Goal (per week)" type="number" defaultValue={7} {...register('goal', { valueAsNumber: true })} />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Habit</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this habit?"
        description={toDelete ? `"${toDelete.name}" and its statistics will be removed. This can't be undone.` : ''}
        confirmLabel="Delete habit"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}
