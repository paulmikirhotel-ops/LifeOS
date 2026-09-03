import React, { useState } from 'react';
import { 
  Target, Plus, CheckCircle2, Circle, 
  MoreVertical, Edit2, Trash2, Calendar,
  ChevronRight, Flag, ListTodo
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { 
  Button, Card, Badge, Spinner, Modal, 
  Input, Select, Textarea, EmptyState 
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';
import { formatDate } from '../utils/format.js';

export default function GoalsPage() {
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  const { data: goals, loading, reload } = useApi('/goals');

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

  const deleteGoal = async (id) => {
    if (!confirm('Are you sure?')) return;
    try {
      await api.delete(`/goals/${id}`);
      addToast('Goal deleted');
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const toggleMilestone = async (goalId, milestoneIdx) => {
    const goal = goals.items.find(g => g._id === goalId);
    const milestones = [...goal.milestones];
    milestones[milestoneIdx].isDone = !milestones[milestoneIdx].isDone;
    
    try {
      await api.patch(`/goals/${goalId}`, { milestones });
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    completed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Goals</h1>
          <p className="text-sm text-slate-500 font-medium">Define your future and track your journey</p>
        </div>
        <Button icon={Plus} onClick={() => openModal()} className="w-full sm:w-auto">Define Goal</Button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        {loading ? (
          <div className="col-span-full py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : goals?.items?.length > 0 ? (
          goals.items.map(goal => {
            const completedMilestones = goal.milestones?.filter(m => m.isDone).length || 0;
            const totalMilestones = goal.milestones?.length || 0;
            const progress = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

            return (
              <Card key={goal._id} className="p-6 flex flex-col h-full group">
                <div className="flex justify-between items-start mb-4">
                  <Badge className={`uppercase text-[9px] font-black tracking-widest ${statusColors[goal.status]}`}>
                    {goal.status.replace(/[-_]/g, ' ')}
                  </Badge>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openModal(goal)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteGoal(goal._id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                <h3 className="text-xl font-bold dark:text-white mb-2">{goal.title}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-6 flex-1">{goal.description}</p>

                <div className="space-y-6">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-indigo-600">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                      <Calendar className="w-4 h-4" /> {goal.targetDate ? formatDate(goal.targetDate, 'MMM d, yyyy') : 'No date'}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                      <Flag className="w-4 h-4" /> {goal.type.replace(/[-_]/g, ' ')}
                    </div>
                  </div>

                  {/* Milestones */}
                  {totalMilestones > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 space-y-3 border border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <ListTodo className="w-3 h-3" /> Milestones
                      </p>
                      {goal.milestones.map((m, idx) => (
                        <button 
                          key={idx}
                          onClick={() => toggleMilestone(goal._id, idx)}
                          className="w-full flex items-center gap-3 text-left hover:bg-white dark:hover:bg-slate-800 p-2 rounded-lg transition-colors group/m"
                        >
                          {m.isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300 group-hover/m:text-indigo-400" />}
                          <span className={`text-xs font-medium ${m.isDone ? 'line-through text-slate-400' : 'dark:text-slate-300'}`}>{m.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState 
            icon={Target} 
            title="No goals set" 
            description="Aim high! Start by defining what you want to achieve."
            action={<Button icon={Plus} onClick={() => openModal()}>Set Goal</Button>}
          />
        )}
      </div>

      {/* Goal Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingGoal ? 'Edit Goal' : 'Define Goal'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Goal Title" placeholder="What's your objective?" {...register('title', { required: true })} />
          <Textarea label="Description" placeholder="Why is this important? How will you achieve it?" {...register('description')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select 
              label="Goal Type" 
              options={[{value:'short_term', label:'Short Term'}, {value:'long_term', label:'Long Term'}]}
              {...register('type')}
            />
            <Input label="Target Date" type="date" {...register('targetDate')} />
          </div>
          <Select 
            label="Status" 
            options={[
              {value:'active', label:'Active'}, 
              {value:'completed', label:'Completed'},
              {value:'cancelled', label:'Cancelled'}
            ]}
            {...register('status')}
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Goal</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
