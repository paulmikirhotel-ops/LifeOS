import React, { useState } from 'react';
import { 
  CheckCircle2, Plus, Filter, Search, 
  MoreVertical, Edit2, Trash2, Calendar, 
  Clock, Flag, Wand2, X 
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { 
  Button, Input, Select, Card, Badge, Modal, 
  Spinner, EmptyState, Textarea 
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatDate } from '../utils/format.js';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  category: z.string().min(1, 'Category is required'),
  dueDate: z.string().optional(),
  estimatedMinutes: z.number().min(1).optional(),
});

export default function TasksPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [smartInput, setSmartInput] = useState('');
  const [planning, setPlanning] = useState(false);

  const { data: tasks, loading, reload } = useApi('/tasks', { 
    deps: [activeTab, priorityFilter] 
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(taskSchema),
    defaultValues: { priority: 'medium', category: 'General' }
  });

  const filteredTasks = (tasks?.items || []).filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesTab = activeTab === 'All' || 
                       (activeTab === 'Today' && t.dueDate?.startsWith(new Date().toISOString().split('T')[0])) ||
                       (activeTab === 'Overdue' && t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed');
    return matchesSearch && matchesPriority && matchesTab;
  });

  const openModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setValue('title', task.title);
      setValue('description', task.description);
      setValue('priority', task.priority);
      setValue('category', task.category);
      setValue('dueDate', task.dueDate ? task.dueDate.split('T')[0] : '');
      setValue('estimatedMinutes', task.estimatedMinutes);
    } else {
      setEditingTask(null);
      reset({ priority: 'medium', category: 'General' });
    }
    setIsModalOpen(true);
  };

  const onSubmit = async (data) => {
    try {
      const res = editingTask 
        ? await api.patch(`/tasks/${editingTask._id}`, data)
        : await api.post('/tasks', data);
      
      if (res.success) {
        addToast(editingTask ? 'Task updated' : 'Task created');
        setIsModalOpen(false);
        reload();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const toggleStatus = async (task) => {
    try {
      const newStatus = task.status === 'completed' ? 'not_started' : 'completed';
      await api.patch(`/tasks/${task._id}`, { status: newStatus });
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const deleteTask = async (id) => {
    if (!confirm('Are you sure?')) return;
    try {
      await api.delete(`/tasks/${id}`);
      addToast('Task deleted');
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleSmartPlan = async () => {
    if (!smartInput.trim()) return;
    setPlanning(true);
    try {
      const text = smartInput.trim();
      const durationMatch = text.match(/for\s+(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min)\b/i);
      let durationMin = 60;
      if (durationMatch) {
        const val = parseInt(durationMatch[1], 10);
        durationMin = durationMatch[2].toLowerCase().startsWith('h') ? val * 60 : val;
      }
      durationMin = Math.max(15, Math.min(480, durationMin));
      const title = text.replace(/for\s+\d+\s*(hours?|hrs?|h|minutes?|mins?|min)\b.*$/i, '').trim() || text;
      const date = /tomorrow/i.test(text)
        ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const res = await api.post('/tasks/plan', { title, durationMin, date });

      if (res.success) {
        addToast(
          res.data.suggestion
            ? 'Task created — suggested time slot found in your schedule'
            : 'Task created — no free slot found for that day',
          'success'
        );
        setSmartInput('');
        reload();
      }
    } catch (e) {
      addToast('Could not plan that. Try "Study JavaScript for 2 hours tomorrow"', 'error');
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Tasks</h1>
          <p className="text-sm text-slate-500 font-medium">Manage your daily objectives</p>
        </div>
        <Button icon={Plus} onClick={() => openModal()} className="w-full sm:w-auto">Create Task</Button>
      </header>

      {/* Smart Plan Bar */}
      <Card className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm flex-shrink-0">
              <Wand2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="block sm:hidden flex-1 font-bold text-indigo-600 text-sm">Smart Plan</div>
          </div>
          <div className="flex-1 relative w-full">
            <input 
              value={smartInput}
              onChange={(e) => setSmartInput(e.target.value)}
              placeholder='Try "Study JavaScript for 2 hours tomorrow"'
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleSmartPlan()}
            />
          </div>
          <Button variant="ghost" onClick={handleSmartPlan} loading={planning} className="text-indigo-600 font-bold w-full sm:w-auto">
            Plan
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
          {['All', 'Today', 'Upcoming', 'Overdue'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              placeholder="Search tasks..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
            />
          </div>
          <select 
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none dark:text-white"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : filteredTasks.length > 0 ? (
          filteredTasks.map(task => (
            <Card key={task._id} className={`p-4 group hover:border-indigo-200 dark:hover:border-indigo-900 transition-all ${task.status === 'completed' ? 'opacity-75' : ''}`}>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleStatus(task)}
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'}`}
                >
                  {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-slate-900 dark:text-white truncate ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                    {task.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
                      <Flag className={`w-3 h-3 ${task.priority === 'high' ? 'text-rose-500' : task.priority === 'medium' ? 'text-amber-500' : 'text-blue-500'}`} />
                      {task.priority}
                    </div>
                    {task.dueDate && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
                        <Calendar className="w-3 h-3" />
                        {formatDate(task.dueDate, 'MMM d')}
                      </div>
                    )}
                    {task.estimatedMinutes && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
                        <Clock className="w-3 h-3" />
                        {task.estimatedMinutes}m
                      </div>
                    )}
                    <Badge variant="info" className="text-[10px] px-1.5 py-0">{task.category}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(task)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteTask(task._id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState 
            icon={CheckCircle2} 
            title="No tasks found" 
            description="You're all caught up! Or maybe try adjusting your filters."
            action={<Button icon={Plus} onClick={() => openModal()}>Add your first task</Button>}
          />
        )}
      </div>

      {/* Task Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingTask ? 'Edit Task' : 'New Task'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Task Title" placeholder="What needs to be done?" {...register('title')} error={errors.title?.message} />
          <Textarea label="Description" placeholder="Add more details..." {...register('description')} error={errors.description?.message} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select 
              label="Priority" 
              options={[{value:'low', label:'Low'}, {value:'medium', label:'Medium'}, {value:'high', label:'High'}]}
              {...register('priority')}
              error={errors.priority?.message}
            />
            <Input label="Category" placeholder="Work, Home, etc." {...register('category')} error={errors.category?.message} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Due Date" type="date" {...register('dueDate')} error={errors.dueDate?.message} />
            <Input label="Est. Minutes" type="number" {...register('estimatedMinutes', { valueAsNumber: true })} error={errors.estimatedMinutes?.message} />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Task</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
