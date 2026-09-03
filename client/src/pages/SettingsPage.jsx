import React, { useState, useEffect } from 'react';
import { 
  User, Shield, Users, Bell, 
  Trash2, Save, Key, UserPlus, 
  Check, X, AlertTriangle, Building
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { 
  Button, Card, Input, Select, 
  Badge, Spinner, Modal 
} from '../components/ui.jsx';
import { useForm } from 'react-hook-form';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const { user, memberships, logout, refreshMe } = useAuth();
  const { activeTenant, can } = useTenant();
  const { addToast } = useToast();

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User, show: true },
    { id: 'workspace', label: 'Workspace', icon: Building, show: can('settings.manage') },
    { id: 'members', label: 'Members', icon: Users, show: can('users.view') },
    { id: 'security', label: 'Security', icon: Shield, show: true },
    { id: 'notifications', label: 'Notifications', icon: Bell, show: true },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle, show: true },
  ].filter(t => t.show);

  return (
    <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 animate-in fade-in duration-500 pb-20">
      {/* Sidebar Tabs */}
      <aside className="w-full md:w-64 space-y-2">
        <h1 className="text-2xl font-bold dark:text-white mb-6">Settings</h1>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </aside>

      {/* Content Area */}
      <main className="flex-1 min-w-0 space-y-8">
        {activeTab === 'profile' && <ProfileSettings user={user} refreshMe={refreshMe} />}
        {activeTab === 'workspace' && <WorkspaceSettings activeTenant={activeTenant} refreshMe={refreshMe} />}
        {activeTab === 'members' && <MemberSettings />}
        {activeTab === 'security' && <SecuritySettings />}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'danger' && <DangerZone logout={logout} />}
      </main>
    </div>
  );
}

function ProfileSettings({ user, refreshMe }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: { name: user?.name, email: user?.email }
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.patch('/auth/me', data);
      if (res.success) {
        addToast('Profile updated');
        await refreshMe();
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 space-y-8">
      <div>
        <h3 className="text-xl font-bold dark:text-white">Profile Information</h3>
        <p className="text-sm text-slate-500">Update your personal details and how others see you.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 relative group">
            <User className="w-12 h-12" />
            <button type="button" className="absolute inset-0 bg-black/50 text-white text-[10px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex items-center justify-center">Change</button>
          </div>
          <div className="flex-1 space-y-4 w-full">
            <Input label="Full Name" {...register('name', { required: true })} />
            <Input label="Email Address" type="email" {...register('email', { required: true })} disabled />
            <p className="text-[10px] text-slate-400">Email cannot be changed directly for security reasons.</p>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-6">
          <Button type="submit" loading={loading} icon={Save}>Save Changes</Button>
        </div>
      </form>
    </Card>
  );
}

const toMinutes = (time) => {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const toTimeString = (min) => {
  if (min == null || !Number.isFinite(min)) return '09:00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function WorkspaceSettings({ activeTenant, refreshMe }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  // Workspace routes operate on the ACTIVE workspace (no tenantId in the URL).
  const { data: settings, reload } = useApi('/tenants/settings');
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    if (settings) {
      reset({
        name: settings.name || activeTenant?.name || '',
        currency: settings.currency || 'USD',
        workingHoursStart: toTimeString(settings.workingHours?.startMin),
        workingHoursEnd: toTimeString(settings.workingHours?.endMin),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, activeTenant]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.patch('/tenants/settings', {
        name: data.name,
        currency: data.currency,
        workingHours: {
          startMin: toMinutes(data.workingHoursStart),
          endMin: toMinutes(data.workingHoursEnd),
        },
      });
      if (res.success) {
        addToast('Workspace updated');
        await refreshMe();
        reload();
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 space-y-8">
      <div>
        <h3 className="text-xl font-bold dark:text-white">Workspace Configuration</h3>
        <p className="text-sm text-slate-500">Manage your workspace settings and defaults.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Input label="Workspace Name" {...register('name', { required: true })} />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Default Currency"
            options={[
              {value:'USD', label:'USD ($)'},
              {value:'EUR', label:'EUR (€)'},
              {value:'GBP', label:'GBP (£)'},
              {value:'JPY', label:'JPY (¥)'}
            ]}
            {...register('currency')}
          />
        </div>
        <div className="space-y-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Working Hours</label>
          <div className="grid grid-cols-2 gap-4">
            <Input type="time" label="Start" {...register('workingHoursStart')} />
            <Input type="time" label="End" {...register('workingHoursEnd')} />
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-6">
          <Button type="submit" loading={loading} icon={Save}>Update Workspace</Button>
        </div>
      </form>
    </Card>
  );
}

const ROLE_LABELS = {
  owner: 'Owner',
  finance_manager: 'Finance Manager',
  assistant: 'Assistant',
  viewer: 'Viewer',
};

function MemberSettings() {
  const { addToast } = useToast();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { data: members, reload } = useApi('/tenants/members');

  const removeMember = async (member) => {
    if (!confirm(`Remove ${member.name || 'this member'} from the workspace?`)) return;
    try {
      const res = await api.delete(`/tenants/members/${member.userId}`);
      if (res.success) {
        addToast('Member removed');
        reload();
      }
    } catch (e) {
      addToast(e.message, 'error');
    }
  };

  return (
    <Card className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold dark:text-white">Team Members</h3>
          <p className="text-sm text-slate-500">Invite and manage people in this workspace.</p>
        </div>
        <Button size="sm" icon={UserPlus} onClick={() => setIsInviteModalOpen(true)}>Invite Member</Button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {members?.items?.map(member => (
          <div key={member.userId || member.id} className="py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-400 flex-shrink-0">
                {member.name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold dark:text-white truncate">{member.name || 'Pending User'}</p>
                <p className="text-xs text-slate-500 truncate">{member.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Badge variant={member.role === 'owner' ? 'success' : 'info'} className="text-[10px] uppercase font-black">{ROLE_LABELS[member.role] || member.role}</Badge>
              {member.role !== 'owner' && (
                <button
                  className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                  onClick={() => removeMember(member)}
                  title="Remove member"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invite Team Member">
        <InviteForm onSuccess={() => { setIsInviteModalOpen(false); reload(); }} />
      </Modal>
    </Card>
  );
}

function InviteForm({ onSuccess }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/tenants/invitations', data);
      if (res.success) {
        addToast('Invitation sent successfully');
        onSuccess();
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input label="Email Address" type="email" placeholder="colleague@example.com" {...register('email', { required: true })} />
      <Select
        label="Role"
        options={[
          {value:'viewer', label:'Viewer'},
          {value:'assistant', label:'Assistant'},
          {value:'finance_manager', label:'Finance Manager'},
          {value:'owner', label:'Owner (full access)'}
        ]}
        {...register('role')}
      />
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="secondary" onClick={() => onSuccess()}>Cancel</Button>
        <Button type="submit" loading={loading}>Send Invite</Button>
      </div>
    </form>
  );
}

function SecuritySettings() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/change-password', data);
      if (res.success) {
        addToast('Password changed successfully');
        reset();
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 space-y-8">
      <div>
        <h3 className="text-xl font-bold dark:text-white">Security</h3>
        <p className="text-sm text-slate-500">Ensure your account is protected with a strong password.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Input label="Current Password" type="password" {...register('currentPassword', { required: true })} />
        <Input label="New Password" type="password" {...register('newPassword', { required: true })} />
        <Input label="Confirm New Password" type="password" {...register('confirmPassword', { required: true })} />
        <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-6">
          <Button type="submit" loading={loading} icon={Key}>Update Password</Button>
        </div>
      </form>
    </Card>
  );
}

function DangerZone({ logout }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDeleteAccount = async () => {
    if (!confirm('Are you absolutely sure? This action is IRREVERSIBLE. All your data will be permanently deleted.')) return;
    setLoading(true);
    try {
      const res = await api.delete('/auth/account');
      if (res.success) {
        addToast('Account deleted. We are sorry to see you go.');
        logout();
      }
    } catch (e) {
      addToast(e.message, 'error');
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 space-y-8 border-red-200 dark:border-red-900/30">
      <div>
        <h3 className="text-xl font-bold text-red-600">Danger Zone</h3>
        <p className="text-sm text-slate-500">Irreversible actions that affect your entire account.</p>
      </div>

      <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-red-900 dark:text-red-400">Delete Account</h4>
          <p className="text-xs text-red-700 dark:text-red-500 mt-1 leading-relaxed">
            Deleting your account will remove all your workspaces, tasks, financial records, and personal data. This cannot be undone.
          </p>
          <Button variant="danger" size="sm" className="mt-4" onClick={handleDeleteAccount} loading={loading}>Delete Everything</Button>
        </div>
      </div>
    </Card>
  );
}

const MODULE_OPTIONS = [
  { key: 'task', label: 'Tasks', desc: 'Task created, completed, due & overdue reminders' },
  { key: 'calendar', label: 'Calendar', desc: 'Upcoming events and "starting soon" reminders' },
  { key: 'schedule', label: 'Schedule', desc: 'Planned schedule blocks' },
  { key: 'journal', label: 'Journal', desc: 'Journal reminders' },
  { key: 'focus', label: 'Focus', desc: 'Focus session events' },
  { key: 'finance', label: 'Finance', desc: 'Income, expenses and financial reminders' },
  { key: 'habit', label: 'Habits', desc: 'Daily habit reminders and completions' },
  { key: 'goal', label: 'Goals', desc: 'Deadlines, milestones and completions' },
  { key: 'invitation', label: 'Invitations', desc: 'Workspace invites' },
];

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-bold dark:text-white">{label}</p>
        {desc && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

function NotificationSettings() {
  const { addToast } = useToast();
  const { prefs, updatePrefs } = useNotification();
  const [browserEnabled, setBrowserEnabled] = useState(() => {
    try {
      return localStorage.getItem('lifeos.browserNotif') === 'on';
    } catch {
      return false;
    }
  });
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const change = async (patch) => {
    const updated = await updatePrefs(patch);
    if (updated) addToast('Notification settings saved');
    else addToast('Could not save settings', 'error');
  };

  const setModule = (key) => (next) => {
    change({ modules: { [key]: next } });
  };

  const toggleBrowser = async () => {
    const willEnable = !browserEnabled;
    if (willEnable && permission !== 'granted') {
      if (permission === 'unsupported') {
        addToast('Desktop notifications are not supported by this browser', 'error');
        return;
      }
      if (permission === 'denied') {
        addToast('Notifications are blocked in your browser settings', 'error');
        return;
      }
      try {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          addToast('Permission denied — the app works fine without it', 'error');
          return;
        }
      } catch {
        addToast('Could not request permission', 'error');
        return;
      }
    }
    setBrowserEnabled(willEnable);
    try {
      localStorage.setItem('lifeos.browserNotif', willEnable ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    addToast(willEnable ? 'Desktop notifications enabled' : 'Desktop notifications disabled');
  };

  return (
    <Card className="p-6 sm:p-8 space-y-8">
      <div>
        <h3 className="text-xl font-bold dark:text-white">Notifications</h3>
        <p className="text-sm text-slate-500 mt-1">Choose what reaches you, how it sounds, and where it pops up.</p>
      </div>

      {/* Global switches */}
      <section className="border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">General</h4>
        <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
          <ToggleRow
            label="Notification sound"
            desc="Play a short chime when a new notification arrives"
            checked={prefs.sound !== false}
            onChange={() => change({ sound: prefs.sound === false })}
          />
          <ToggleRow
            label="Popup notifications"
            desc="Show a temporary toast when a new notification arrives"
            checked={prefs.toast !== false}
            onChange={() => change({ toast: prefs.toast === false })}
          />
          <ToggleRow
            label="Desktop notifications"
            desc="Also show a system pop-up when the tab is in the background"
            checked={browserEnabled}
            onChange={toggleBrowser}
          />
        </div>
      </section>

      {/* Module switches */}
      <section>
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Modules</h4>
        <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {MODULE_OPTIONS.map((m) => (
            <ToggleRow
              key={m.key}
              label={m.label}
              desc={m.desc}
              checked={prefs.modules[m.key] !== false}
              onChange={() => setModule(m.key)(prefs.modules[m.key] === false)}
            />
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
          Turning a module off stops reminders for it — invitations and system alerts are always delivered.
        </p>
      </section>
    </Card>
  );
}
