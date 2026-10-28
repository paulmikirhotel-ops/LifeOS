import React, { useState } from 'react';
import { Target, Plus, CheckCircle2, Circle, Edit2, Trash2, Calendar, Flag, ListTodo } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button, Card, Badge, Modal, Input, Select, Textarea, EmptyState, ErrorState, SkeletonCard, PageHeader,
  IconButton, ConfirmDialog, ProgressBar
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';
import { formatDate } from '../utils/format.js';
import GoalDetail from '../components/GoalDetail.jsx';

const label = (v) => String(v || '').replace(/[-_]/g, ' ');

export default function GoalsPage() {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data: goals, loading, error, reload } = useApi('/goals');
  const items = Array.isArray(goals?.items) ? goals.items : [];

  const { register, handleSubmit, reset, setValue } = useForm();

  const openModal = (goal = null) => {
    if (goal) {
      setEditingGoal(goal);
      setValue('title', goal.title);
      setValue('description', goal.description);
      setValue('type', goal.type);
      setValue('status', goal.status);
      setValue('targetDate', goal.targetDate ? goal.targetDate.split('T')[0] : '');
    } else {
      setEditingGoal(null);
      reset({ type: 'short_term', status: 'active' });
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data) => {
    try {
      const res = editingGoal
        ? await api.patch(`/goals/${editingGoal._id}`, data)
        : await api.post('/goals', data);
      if (res.success) {
        addToast(editingGoal ? 'Goal updated' : 'Goal created');
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
      await api.delete(`/goals/${toDelete._id}`);
      addToast('Goal deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleMilestone = async (goalId, milestoneIdx) => {
    const goal = items.find((g) => g._id === goalId);
    if (!goal) return;
    const milestones = (goal.milestones || []).map((m) => ({ ...m }));
    milestones[milestoneIdx].isDone = !milestones[milestoneIdx].isDone;
    try {
      await api.patch(`/goals/${goalId}`, { milestones });
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const statusVariant = { active: 'success', completed: 'brand', cancelled: 'error' };

  return (
    <div className="space-y-6 sm:space-y-8 pb-10 max-w-6xl mx-auto">
      <PageHeader
        title="Goals"
        description="Define your future and track your journey"
        actions={<Button icon={Plus} onClick={() => openModal()} className="w-full sm:w-auto">Define Goal</Button>}
      />

      {loading && !goals ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">{[0, 1].map((i) => <SkeletonCard key={i} lines={5} />)}</div>
      ) : error && !goals ? (
        <Card><ErrorState title="Goals couldn't load" details={error} onRetry={reload} /></Card>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
          {items.map((goal) => {
            const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
            const completedMilestones = milestones.filter((m) => m.isDone).length;
            const totalMilestones = milestones.length;
            const progress = typeof goal.progress === 'number' ? goal.progress : 0;
            const linked = goal.linked || { tasks: 0, tasksDone: 0, habits: 0 };

            return (
              <Card key={goal._id} className="p-5 sm:p-6 flex flex-col h-full min-w-0">
                <div className="flex justify-between items-start mb-3">
                  <Badge variant={statusVariant[goal.status] || 'neutral'} className="uppercase text-[10px] font-bold tracking-wider">
                    {label(goal.status) || 'active'}
                  </Badge>
                  <div className="flex items-center -mr-2 -mt-1">
                    <IconButton icon={Edit2} label={`Edit ${goal.title}`} onClick={() => openModal(goal)} />
                    <IconButton icon={Trash2} tone="danger" label={`Delete ${goal.title}`} onClick={() => setToDelete(goal)} />
                  </div>
                </div>

                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-2 break-words">{goal.title}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-5 flex-1">{goal.description}</p>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-indigo-600 dark:text-indigo-400 tabular-nums">{Math.round(progress)}%</span>
                    </div>
                    <ProgressBar value={progress} label={`${goal.title} progress`} />
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                      <Calendar className="w-4 h-4" aria-hidden="true" /> {goal.targetDate ? formatDate(goal.targetDate, 'MMM d, yyyy') : 'No date'}
                    </div>
                    {goal.type && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                        <Flag className="w-4 h-4" aria-hidden="true" /> {label(goal.type)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {linked.tasks} task{linked.tasks === 1 ? '' : 's'} · {linked.habits} habit{linked.habits === 1 ? '' : 's'}
                    </p>
                    <Button variant="secondary" onClick={() => setOpenId(goal._id)} aria-label={`Open plan for ${goal.title}`}>Open plan</Button>
                  </div>

                  {totalMilestones > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-3 sm:p-4 border border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2 mb-1 px-1">
                        <ListTodo className="w-3.5 h-3.5" aria-hidden="true" /> Milestones · {completedMilestones}/{totalMilestones}
                      </p>
                      <ul>
                        {milestones.map((m, idx) => (
                          <li key={idx}>
                            <button
                              onClick={() => toggleMilestone(goal._id, idx)}
                              role="checkbox"
                              aria-checked={!!m.isDone}
                              className="w-full min-h-11 flex items-center gap-3 text-left hover:bg-white dark:hover:bg-slate-800 px-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
                            >
                              {m.isDone ? <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-500" aria-hidden="true" /> : <Circle className="w-5 h-5 flex-shrink-0 text-slate-300" aria-hidden="true" />}
                              <span className={`text-sm ${m.isDone ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>{m.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals set yet"
            description="Aim high. Start by defining what you want to achieve."
            action={<Button icon={Plus} onClick={() => openModal()}>Set goal</Button>}
          />
        </Card>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingGoal ? 'Edit Goal' : 'Define Goal'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Goal Title" placeholder="What's your objective?" data-autofocus {...register('title', { required: true })} />
          <Textarea label="Description" placeholder="Why is this important? How will you achieve it?" {...register('description')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Goal Type"
              options={[{ value: 'short_term', label: 'Short Term' }, { value: 'long_term', label: 'Long Term' }]}
              {...register('type')}
            />
            <Input label="Target Date" type="date" {...register('targetDate')} />
          </div>
          <Select
            label="Status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            {...register('status')}
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Goal</Button>
          </div>
        </form>
      </Modal>

      {openId && <GoalDetail goalId={openId} onClose={() => setOpenId(null)} onChanged={reload} />}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this goal?"
        description={toDelete ? `"${toDelete.title}" and its milestones will be removed. This can't be undone.` : ''}
        confirmLabel="Delete goal"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}
