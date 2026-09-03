import React, { useState } from 'react';
import { 
  Plus, Wallet, TrendingUp, TrendingDown, 
  Search, Filter, MoreVertical, FileText, 
  Download, Trash2, Edit2, Upload, X,
  PieChart as PieChartIcon
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { 
  Button, Card, Badge, Spinner, Modal, 
  Input, Select, StatCard, EmptyState 
} from '../components/ui.jsx';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { formatCurrency, formatDate, todayStr } from '../utils/format.js';

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState('income'); // income, expenses, audit
  const [modalType, setModalType] = useState('income'); // income | expense
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const { activeTenant } = useTenant();
  const { addToast } = useToast();

  const { data: summary, loading: summaryLoading, reload: reloadSummary } = useApi('/finance/summary?range=month');
  const { data: income, loading: incomeLoading, reload: reloadIncome } = useApi('/finance/income');
  const { data: expenses, loading: expenseLoading, reload: reloadExpenses } = useApi('/finance/expenses');
  const { data: categories } = useApi('/finance/categories');

  const stats = summary || { totalIncome: 0, totalExpenses: 0, dailySeries: [], categorySeries: [] };
  const COLORS = ['#6366f1', '#d946ef', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  const handleDelete = async (id, type) => {
    if (!confirm('Delete this record?')) return;
    try {
      await api.delete(`/finance/${type}/${id}`);
      addToast('Record deleted');
      reloadSummary();
      type === 'income' ? reloadIncome() : reloadExpenses();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleFileUpload = async (id, type, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('recordId', id);
    formData.append('recordType', type);
    try {
      const res = await api.post('/finance/evidence/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.success) {
        addToast('Receipt uploaded');
        type === 'income' ? reloadIncome() : reloadExpenses();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Finance</h1>
          <p className="text-sm text-slate-500 font-medium">Track your wealth and spending</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setIsCategoryModalOpen(true)} className="flex-1 sm:flex-none">Categories</Button>
          <Button variant="secondary" icon={TrendingDown} className="!text-rose-600 dark:!text-rose-400 flex-1 sm:flex-none" onClick={() => { setEditingItem(null); setModalType('expense'); setIsModalOpen(true); }}>Add Expense</Button>
          <Button icon={TrendingUp} className="!text-emerald-600 dark:!text-emerald-400 flex-1 sm:flex-none" onClick={() => { setEditingItem(null); setModalType('income'); setIsModalOpen(true); }}>Add Income</Button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Current Balance" value={formatCurrency(summary?.balance ?? (stats.totalIncome - stats.totalExpenses))} icon={Wallet} color="indigo" />
        <StatCard title="Income (month)" value={formatCurrency(stats.totalIncome)} icon={TrendingUp} color="emerald" />
        <StatCard title="Expenses (month)" value={formatCurrency(stats.totalExpenses)} icon={TrendingDown} color="rose" />
        <StatCard title="Net (month)" value={formatCurrency(stats.totalIncome - stats.totalExpenses)} icon={Plus} color="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Trend Chart */}
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-bold mb-6 dark:text-white">Cash Flow Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.dailySeries}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val) => formatCurrency(val)}
                />
                <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExpense)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Categories Pie */}
        <Card className="p-6">
          <h3 className="font-bold mb-6 dark:text-white">Top Expenses</h3>
          <div className="h-56 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.categorySeries}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.categorySeries.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <PieChartIcon className="w-6 h-6 text-slate-300" />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {stats.categorySeries.slice(0, 4).map((cat, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-500 font-medium">{cat.name}</span>
                </div>
                <span className="font-bold dark:text-white">{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card className="overflow-hidden">
        <header className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1 rounded-xl">
            {['income', 'expenses', 'audit'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>

        <div className="overflow-x-auto min-w-0">
          {activeTab === 'audit' ? (
            <AuditLogTable />
          ) : (
            <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</th>
                  <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                  <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Amount</th>
                  <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(activeTab === 'income' ? income : expenses)?.items?.map(item => {
                  const evidenceName = item.attachments?.[0]?.storedName || null;
                  return (
                  <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-2 sm:px-6 py-4 text-xs font-bold text-slate-500">{formatDate(item.date, 'MMM d, yyyy')}</td>
                    <td className="px-2 sm:px-6 py-4">
                      <Badge variant={activeTab === 'income' ? 'success' : 'error'} className="text-[10px] font-bold">{item.categoryName || item.category}</Badge>
                    </td>
                    <td className="px-2 sm:px-6 py-4 min-w-0">
                      <p className="text-sm font-bold dark:text-white truncate max-w-[120px] sm:max-w-none">{item.description}</p>
                      {item.vendor && <p className="text-[10px] text-slate-400 truncate max-w-[120px] sm:max-w-none">{item.vendor}</p>}
                    </td>
                    <td className={`px-2 sm:px-6 py-4 text-sm font-black text-right ${activeTab === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {activeTab === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                    </td>
                    <td className="px-2 sm:px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <label className="p-2 text-slate-400 hover:text-indigo-600 cursor-pointer rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                          <Upload className="w-4 h-4" />
                          <input type="file" className="hidden" onChange={(e) => handleFileUpload(item._id, activeTab === 'income' ? 'income' : 'expense', e.target.files[0])} />
                        </label>
                        {evidenceName && (
                          <a href={`/api/finance/evidence/${encodeURIComponent(evidenceName)}`} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20">
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={() => { setEditingItem(item); setModalType(activeTab === 'income' ? 'income' : 'expense'); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(item._id, activeTab)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {((activeTab === 'income' ? income : expenses)?.items?.length === 0) && (
            <div className="py-20 flex justify-center"><p className="text-sm text-slate-500">No records found.</p></div>
          )}
        </div>
      </Card>

      {/* Add / Edit Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingItem ? `Edit ${modalType === 'income' ? 'Income' : 'Expense'}` : `Add ${modalType === 'income' ? 'Income' : 'Expense'}`}
      >
        <TransactionForm 
          key={editingItem?._id || `new-${modalType}`}
          type={modalType} 
          editing={editingItem}
          categories={categories?.items || []} 
          onSuccess={() => { setIsModalOpen(false); reloadIncome(); reloadExpenses(); reloadSummary(); }} 
        />
      </Modal>

      {/* Category Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title="Manage Categories">
        <CategoryManager categories={categories?.items || []} onSuccess={() => setIsCategoryModalOpen(false)} />
      </Modal>
    </div>
  );
}

function TransactionForm({ type, categories, editing, onSuccess }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const isIncome = type === 'income';
  const { register, handleSubmit } = useForm({
    defaultValues: editing
      ? {
          amount: editing.amount,
          category: editing.category,
          date: String(editing.date || todayStr()).split('T')[0],
          description: editing.description || '',
          vendor: editing.source || editing.vendor || '',
        }
      : { date: todayStr() },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      // Income stores the counterpart as `source`; expenses as `vendor`.
      const payload = {
        amount: data.amount,
        category: data.category,
        date: data.date || todayStr(),
        description: data.description || '',
      };
      if (isIncome) payload.source = data.vendor;
      else payload.vendor = data.vendor;

      const path = isIncome ? '/finance/income' : '/finance/expenses';
      const res = editing
        ? await api.patch(`${path}/${editing._id}`, payload)
        : await api.post(path, payload);
      if (res.success) {
        addToast(editing ? 'Transaction updated' : isIncome ? 'Income added' : 'Expense added');
        onSuccess();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input label="Amount" type="number" step="0.01" min="0.01" {...register('amount', { valueAsNumber: true, required: true })} />
      <Select 
        label="Category" 
        options={categories.filter(c => c.type === (isIncome ? 'income' : 'expense')).map(c => ({ value: c.name, label: c.name }))}
        {...register('category', { required: true })}
      />
      <Input label="Date" type="date" {...register('date', { required: true })} />
      <Input label="Description" placeholder={isIncome ? 'Salary, Donation, Business...' : 'Food, Rent, Transport...'} {...register('description')} />
      <Input label={isIncome ? 'Source / Payer' : 'Vendor / Recipient'} placeholder="Optional" {...register('vendor')} />
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="secondary" type="button" onClick={onSuccess}>Cancel</Button>
        <Button type="submit" loading={loading}>{editing ? 'Save Changes' : isIncome ? 'Add Income' : 'Add Expense'}</Button>
      </div>
    </form>
  );
}

function AuditLogTable() {
  const { data: audit } = useApi('/finance/audit');
  return (
    <table className="w-full text-left border-collapse min-w-[500px] md:min-w-0">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</th>
          <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
          <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Details</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {audit?.items?.map(log => (
          <tr key={log._id}>
            <td className="px-2 sm:px-6 py-4 text-xs font-medium text-slate-500">{formatDate(log.createdAt, 'MMM d, h:mm a')}</td>
            <td className="px-2 sm:px-6 py-4">
              <Badge variant="info" className="text-[10px] uppercase">{log.action}</Badge>
            </td>
            <td className="px-2 sm:px-6 py-4 text-xs dark:text-slate-300 min-w-0 truncate">
              {log.resource}{log.resourceId ? ` #${String(log.resourceId).slice(-6)}` : ''}
              {log.details?.amount != null ? ` — ${log.details.amount}${log.details.category ? ` ${log.details.category}` : ''}` : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CategoryManager({ categories, onSuccess }) {
  const { addToast } = useToast();
  const [newCat, setNewCat] = useState({ name: '', type: 'expense' });
  const { reload } = useApi('/finance/categories', { manual: true });

  const handleAdd = async () => {
    try {
      const res = await api.post('/finance/categories', newCat);
      if (res.success) {
        addToast('Category added');
        setNewCat({ name: '', type: 'expense' });
        onSuccess();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Input placeholder="New category name" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
        <Select options={[{value:'expense', label:'Expense'}, {value:'income', label:'Income'}]} value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value })} />
        <Button onClick={handleAdd}>Add</Button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {categories.map(c => (
          <div key={c._id} className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Badge variant={c.type === 'income' ? 'success' : 'error'} className="w-2 h-2 p-0 rounded-full" />
              <span className="text-sm font-bold dark:text-white">{c.name}</span>
            </div>
            {c.isSystem ? <Badge variant="info" className="text-[8px]">System</Badge> : (
              <button className="text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useForm } from 'react-hook-form';
