import React, { useState } from 'react';
import { Download, Mail, LogOut, AlertTriangle } from 'lucide-react';
import api from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Card, Input } from '../ui.jsx';

const blue = '!bg-blue-600 hover:!bg-blue-700 !text-white';

function Block({ icon: Icon, title, desc, danger, children }) {
  return (
    <div className={`rounded-2xl border p-5 ${danger ? 'border-red-200 dark:border-red-900/30 bg-red-50/60 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${danger ? 'text-red-600' : 'text-blue-600'}`} />
        <div className="min-w-0 flex-1">
          <h4 className={`text-sm font-bold ${danger ? 'text-red-800 dark:text-red-400' : 'dark:text-white'}`}>{title}</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
          <div className="mt-4 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function AccountTools({ logout }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState('');
  const [email, setEmail] = useState({ newEmail: '', password: '' });
  const [del, setDel] = useState({ password: '', confirm: '' });

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      addToast(e?.message || 'Something went wrong', 'error');
    } finally {
      setBusy('');
    }
  };

  const exportData = () =>
    run('export', async () => {
      const blob = await api.get('/account/export', { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifeos-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast('Your data file was downloaded');
    });

  const changeEmail = (e) => {
    e.preventDefault();
    return run('email', async () => {
      const res = await api.post('/account/change-email', email);
      if (res.success) {
        addToast('Check your new email for a confirmation link');
        setEmail({ newEmail: '', password: '' });
      }
    });
  };

  const signOutAll = () => {
    if (!confirm('Sign out of every device, including this one?')) return;
    return run('all', async () => {
      await api.post('/account/sign-out-everywhere');
      addToast('Signed out of all devices');
      logout();
    });
  };

  const deleteAccount = (e) => {
    e.preventDefault();
    return run('delete', async () => {
      const res = await api.post('/account/delete', del);
      if (res.success) {
        addToast('Your account was deleted');
        logout();
      }
    });
  };

  return (
    <Card className="p-6 sm:p-8 space-y-5">
      <div>
        <h3 className="text-xl font-bold dark:text-white">Account tools</h3>
        <p className="text-sm text-slate-500">Download your data, change your email, end sessions, or delete your account.</p>
      </div>

      <Block icon={Download} title="Download my data" desc="A JSON file with your account details and the tasks, notes, habits, goals, finance records, meetings and other items you created. Files such as recordings are not included.">
        <Button size="sm" className={blue} onClick={exportData} loading={busy === 'export'}>Download my data</Button>
      </Block>

      <Block icon={Mail} title="Change email" desc="We send a confirmation link to the new address. Your email only changes after you open it, and you will need to sign in again.">
        <form onSubmit={changeEmail} className="space-y-3">
          <Input label="New email" type="email" required value={email.newEmail} onChange={(e) => setEmail({ ...email, newEmail: e.target.value })} />
          <Input label="Current password" type="password" required autoComplete="current-password" value={email.password} onChange={(e) => setEmail({ ...email, password: e.target.value })} />
          <Button size="sm" type="submit" className={blue} loading={busy === 'email'}>Send confirmation</Button>
        </form>
      </Block>

      <Block icon={LogOut} title="Sign out everywhere" desc="Ends every session on every phone and computer, including this one. Use it if you lost a device or think someone else has access.">
        <Button size="sm" variant="outline" onClick={signOutAll} loading={busy === 'all'}>Sign out of all devices</Button>
      </Block>

      <Block danger icon={AlertTriangle} title="Delete my account" desc="Permanently deletes your personal workspace content and anonymises your profile. This cannot be undone. Messages you sent to other people in Connect stay visible to them under “Deleted user”. If you own a team workspace with other members, transfer it first.">
        <form onSubmit={deleteAccount} className="space-y-3">
          <Input label="Password" type="password" required autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          <Input label="Type DELETE to confirm" required value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
          <Button size="sm" type="submit" variant="danger" disabled={del.confirm !== 'DELETE' || !del.password} loading={busy === 'delete'}>Delete my account</Button>
        </form>
      </Block>
    </Card>
  );
}
