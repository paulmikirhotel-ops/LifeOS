import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client.js';
import { Spinner } from '../components/ui.jsx';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing verification token.');
      return;
    }

    const verify = async () => {
      try {
        const res = await api.post('/auth/verify-email', { token });
        if (res.success) {
          setStatus('success');
          setMessage('Email verified successfully! You can now access all features.');
        } else {
          setStatus('error');
          setMessage(res.message);
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Verification failed');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="text-center space-y-6">
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500">Verifying your email...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4 animate-in zoom-in-95">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold dark:text-white">Email Verified!</h2>
          <p className="text-sm text-slate-500">{message}</p>
          <Link to="/" className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4 animate-in zoom-in-95">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-2xl font-bold dark:text-white">Verification Failed</h2>
          <p className="text-sm text-slate-500">{message}</p>
          <Link to="/login" className="inline-block text-indigo-600 font-bold hover:underline">
            Back to Login
          </Link>
        </div>
      )}
    </div>
  );
}
