import React, { useState } from 'react';
import {
  Plus, Wallet, TrendingUp, TrendingDown,
  Download, Trash2, Edit2, Upload,
  PieChart as PieChartIcon, Scale
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import {
  Button, Card, Badge, Modal, Input, Select, StatCard, EmptyState, ErrorState, Skeleton,
  PageHeader, IconButton, ConfirmDialog
} from '../components/ui.jsx';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { formatCurrency, formatDate, todayStr } from '../utils/format.js';

const COLORS = ['#6366f1', '#d946ef', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

function RecordActions({ item, kind, onEdit, onDelete, onUpload }) {
  const evidenceName = item.attachments?.[0]?.storedName || null;
  return (
    <div className="flex items-center justify-end">
      <label className="inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-indigo-500/60" title="Upload receipt">
        <Upload className="w-4 h-4" aria-hidden="true" />
        <span className="sr-only">Upload receipt for {item.description || 'record'}</span>
        <input type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && onUpload(item._id, kind, e.target.files[0])} />
      </label>
      {evidenceName && (
        <a href={`/api/finance/evidence/${encodeURIComponent(evidenceName)}`} target="_blank" rel="noreferrer" aria-label="Download receipt" title="Download receipt" className="inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60">
          <Download className="w-4 h-4" aria-hidden="true" />
        </a>
      )}
      <IconButton icon={Edit2} label={`Edit ${item.description || 'record'}`} onClick={() => onEdit(item)} />
      <IconButton icon={Trash2} tone="danger" label={`Delete ${item.description || 'record'}`} onClick={() => onDelete(item)} />
    </div>
  );
}

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState('income'); // income, expenses, audit
  const [modalType, setModalType] = useState('income'); // income | expense
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [toDelete, setToDelete] = useState(null); // { id, type }
  const [deleting, setDeleting] = useState(false);
  const { addToast } = useToast();

  const { data: summary, loading: summaryLoading, error: summaryError, reload: reloadSummary } = useApi('/finance/summary?range=month');
  const { data: income, loading: incomeLoading, reload: reloadIncome } = useApi('/finance/income');
  const { data: expenses, loading: expenseLoading, reload: reloadExpenses } = useApi('/finance/expenses');
  const { data: categories } = useApi('/finance/categories');

  const stats = {
    totalIncome: 0, totalExpenses: 0, ...(summary || {}),
    dailySeries: Array.isArray(summary?.dailySeries) ? summary.dailySeries : [],
    categorySeries: Array.isArray(summary?.categorySeries) ? summary.categorySeries : [],
  };
  const isIncomeTab = activeTab === 'income';
  const kind = isIncomeTab ? 'income' : 'expense';
  const listData = isIncomeTab ? income : expenses;
  const listLoading = isIncomeTab ? incomeLoading : expenseLoading;
  const records = Array.isArray(listData?.items) ? listData.items : [];
  const net = stats.totalIncome - stats.totalExpenses;

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/finance/${toDelete.type}/${toDelete.id}`);
      addToast('Record deleted');
      reloadSummary();
      toDelete.type === 'income' ? reloadIncome() : reloadExpenses();
      setToDelete(null);
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setDeleting(false);
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

  const edit = (item) => { setEditingItem(item); setModalType(kind); setIsModalOpen(true); };
  const askDelete = (item) => setToDelete({ id: item._id, type: activeTab, label: item.description });

  return (
    <div className="space-y-6 sm:space-y-8 pb-10">
      <PageHeader
        title="Finance"
        description="Track your wealth and spending"
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsCategoryModalOpen(true)} className="flex-1 sm:flex-none">Categories</Button>
            <Button variant="secondary" icon={TrendingDown} className="!text-rose-600 dark:!text-rose-400 flex-1 sm:flex-none" onClick={() => { setEditingItem(null); setModalType('expense'); setIsModalOpen(true); }}>Add Expense</Button>
            <Button icon={TrendingUp} className="flex-1 sm:flex-none" onClick={() => { setEditingItem(null); setModalType('income'); setIsModalOpen(true); }}>Add Income</Button>
          </>
        }
      />

      {summaryError && !summary ? (
        <Card><ErrorState title="Finance summary couldn't load" details={summaryError} onRetry={reloadSummary} /></Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard loading={summaryLoading && !summary} title="Current Balance" value={formatCurrency(summary?.balance ?? net)} icon={Wallet} color="indigo" />
            <StatCard loading={summaryLoading && !summary} title="Income (month)" value={formatCurrency(stats.totalIncome)} icon={TrendingUp} color="emerald" />
            <StatCard loading={summaryLoading && !summary} title="Expenses (month)" value={formatCurrency(stats.totalExpenses)} icon={TrendingDown} color="rose" />
            <StatCard loading={summaryLoading && !summary} title="Net (month)" value={formatCurrency(net)} icon={Scale} color="amber" />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            <Card className="lg:col-span-2 p-5 sm:p-6 min-w-0">
              <div className="flex items-center justify-between mb-5 gap-3">
                <h2 className="font-bold text-slate-900 dark:text-white">Cash Flow Trend</h2>
                <div className="flex items-center gap-3 text-xs text-slate-500" aria-hidden="true">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Income</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" />Expense</span>
                </div>
              </div>
              {summaryLoading && !summary ? (
                <Skeleton className="h-64 sm:h-72 w-full" />
              ) : stats.dailySeries.length === 0 ? (
                <div className="h-64 sm:h-72 flex items-center justify-center text-sm text-slate-500">No activity this month yet.</div>
              ) : (
                <div className="h-64 sm:h-72" role="img" aria-label="Daily income and expenses this month">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.dailySeries}>
                      <defs>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.18}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.18}/>
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
              )}
            </Card>

            <Card className="p-5 sm:p-6 min-w-0">
              <h2 className="font-bold mb-5 text-slate-900 dark:text-white">Top Expenses</h2>
              {summaryLoading && !summary ? (
                <Skeleton className="h-56 w-full" />
              ) : stats.categorySeries.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center text-sm text-slate-500 gap-2">
                  <PieChartIcon className="w-7 h-7 text-slate-300" aria-hidden="true" />No expenses yet.
                </div>
              ) : (
                <>
                  <div className="h-52 relative" role="img" aria-label="Expenses by category">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.categorySeries} innerRadius={58} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                          {stats.categorySeries.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => formatCurrency(val)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <PieChartIcon className="w-6 h-6 text-slate-300" aria-hidden="true" />
                    </div>
                  </div>
                  <ul className="mt-5 space-y-2.5">
                    {stats.categorySeries.slice(0, 4).map((cat, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} aria-hidden="true" />
                          <span className="text-slate-600 dark:text-slate-400 truncate">{cat.name}</span>
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(cat.value)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Records */}
      <Card className="overflow-hidden">
        <header className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50">
          <div className="flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto sm:inline-flex" role="tablist" aria-label="Records">
            {['income', 'expenses', 'audit'].map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 sm:flex-none min-h-9 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${activeTab === tab ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </header>

        {activeTab === 'audit' ? (
          <div className="overflow-x-auto"><AuditLogTable /></div>
        ) : listLoading && !listData ? (
          <div className="p-4 space-y-3" role="status" aria-busy="true"><span className="sr-only">Loading records…</span>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : records.length === 0 ? (
          <EmptyState
            icon={isIncomeTab ? TrendingUp : TrendingDown}
            title={`No ${isIncomeTab ? 'income' : 'expense'} records yet`}
            description="Add one to start tracking your cash flow."
            action={<Button icon={Plus} onClick={() => { setEditingItem(null); setModalType(kind); setIsModalOpen(true); }}>{isIncomeTab ? 'Add income' : 'Add expense'}</Button>}
          />
        ) : (
          <>
            {/* Phones, tablets, small laptops: one card per record (no sideways scrolling) */}
            <ul className="xl:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {records.map((item) => (
                <li key={item._id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">{item.description || '—'}</p>
                      {item.vendor && <p className="text-xs text-slate-400 truncate">{item.vendor}</p>}
                    </div>
                    <p className={`text-sm font-black tabular-nums flex-shrink-0 ${isIncomeTab ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {isIncomeTab ? '+' : '-'}{formatCurrency(item.amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={isIncomeTab ? 'success' : 'error'} className="text-[10px] font-bold max-w-[9rem] truncate">{item.categoryName || item.category}</Badge>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(item.date, 'MMM d, yyyy')}</span>
                    </div>
                    <RecordActions item={item} kind={kind} onEdit={edit} onDelete={askDelete} onUpload={handleFileUpload} />
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">{isIncomeTab ? 'Income' : 'Expense'} records</caption>
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {['Date', 'Category', 'Description'].map((h) => <th key={h} scope="col" className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>)}
                    <th scope="col" className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                    <th scope="col" className="px-6 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {records.map((item) => (
                    <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3.5 text-sm font-medium text-slate-500 whitespace-nowrap">{formatDate(item.date, 'MMM d, yyyy')}</td>
                      <td className="px-6 py-3.5"><Badge variant={isIncomeTab ? 'success' : 'error'} className="text-[10px] font-bold">{item.categoryName || item.category}</Badge></td>
                      <td className="px-6 py-3.5 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-xs">{item.description}</p>
                        {item.vendor && <p className="text-xs text-slate-400 truncate max-w-xs">{item.vendor}</p>}
                      </td>
                      <td className={`px-6 py-3.5 text-sm font-black text-right tabular-nums whitespace-nowrap ${isIncomeTab ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isIncomeTab ? '+' : '-'}{formatCurrency(item.amount)}
                      </td>
                      <td className="px-4 py-2.5"><RecordActions item={item} kind={kind} onEdit={edit} onDelete={askDelete} onUpload={handleFileUpload} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

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

      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title="Manage Categories">
        <CategoryManager categories={categories?.items || []} onSuccess={() => setIsCategoryModalOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this record?"
        description={toDelete?.label ? `"${toDelete.label}" will be removed from your finances. This can't be undone.` : "This record will be removed from your finances. This can't be undone."}
        confirmLabel="Delete record"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
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
      <Input label="Amount" type="number" inputMode="decimal" step="0.01" min="0.01" data-autofocus {...register('amount', { valueAsNumber: true, required: true })} />
      <Select 
        label="Category" 
        options={categories.filter(c => c.type === (isIncome ? 'income' : 'expense')).map(c => ({ value: c.name, label: c.name }))}
        {...register('category', { required: true })}
      />
      <Input label="Date" type="date" {...register('date', { required: true })} />
      <Input label="Description" placeholder={isIncome ? 'Salary, Donation, Business...' : 'Food, Rent, Transport...'} {...register('description')} />
      <Input label={isIncome ? 'Source / Payer' : 'Vendor / Recipient'} placeholder="Optional" {...register('vendor')} />
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
        <Button variant="secondary" type="button" onClick={onSuccess}>Cancel</Button>
        <Button type="submit" loading={loading}>{editing ? 'Save Changes' : isIncome ? 'Add Income' : 'Add Expense'}</Button>
      </div>
    </form>
  );
}

function AuditLogTable() {
  const { data: audit } = useApi('/finance/audit');
  return (
    <table className="w-full text-left border-collapse min-w-[460px] md:min-w-0">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</th>
          <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
          <th className="px-2 sm:px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Details</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {(Array.isArray(audit?.items) ? audit.items : []).map(log => (
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
      <div className="flex flex-col sm:flex-row gap-3">
        <Input aria-label="New category name" placeholder="New category name" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
        <Select aria-label="Category type" options={[{value:'expense', label:'Expense'}, {value:'income', label:'Income'}]} value={newCat.type} onChange={(e) => setNewCat({ ...newCat, type: e.target.value })} />
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
              <IconButton icon={Trash2} tone="danger" label={`Delete category ${c.name}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useForm } from 'react-hook-form';
