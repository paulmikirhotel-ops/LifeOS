import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Spinner, Button, Card } from '../components/ui.jsx';
import { Users } from 'lucide-react';

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, refreshMe } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const resolve = async () => {
      try {
        const res = await api.get(`/tenants/invitations/resolve?token=${token}`);
        if (res.success) {
          setInvitation(res.data);
        } else {
          addToast(res.message, 'error');
        }
      } catch (e) {
        addToast('Invalid or expired invitation link', 'error');
      } finally {
        setLoading(false);
      }
    };
    if (token) resolve();
  }, [token, addToast]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await api.post(`/tenants/invitations/accept`, { token });
      if (res.success) {
        addToast(`Welcome to ${invitation.tenantName}!`);
        localStorage.setItem('activeTenantId', invitation.tenantId);
        await refreshMe();
        navigate('/');
      } else {
        addToast(res.message, 'error');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) return <div className="text-center"><Spinner size="lg" /></div>;

  if (!invitation) return (
    <div className="text-center space-y-4">
      <h2 className="text-xl font-bold text-red-600">Invitation not found</h2>
      <p className="text-sm text-slate-500">This link may be invalid or expired.</p>
      <Link to="/" className="text-indigo-600 font-bold hover:underline">Back Home</Link>
    </div>
  );

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
          <Users className="w-8 h-8" />
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold dark:text-white">You're Invited!</h2>
        <p className="text-sm text-slate-500 mt-1">
          You've been invited to join <span className="font-bold text-slate-900 dark:text-white">{invitation.tenantName}</span> as a <span className="font-bold text-indigo-600">{invitation.role}</span>.
        </p>
      </div>

      {user ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Signed in as {user.email}</p>
          <Button onClick={handleAccept} className="w-full" loading={accepting}>
            Accept Invitation
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">Please register or log in to accept this invitation.</p>
          <div className="grid grid-cols-2 gap-4">
            <Link to={`/register?inviteToken=${token}`} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors">Register</Link>
            <Link to={`/login?inviteToken=${token}`} className="bg-slate-100 dark:bg-slate-800 dark:text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Login</Link>
          </div>
        </div>
      )}
    </div>
  );
}
