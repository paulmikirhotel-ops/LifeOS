import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';

/** Opened from the link in the "confirm your new email" message. */
export default function ConfirmEmailChangePage() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'working', message: '' });

  useEffect(() => {
    const token = params.get('token');
    if (!token) return setState({ status: 'error', message: 'This link is missing its token.' });
    let live = true;
    api
      .post('/account/confirm-email-change', { token })
      .then(() => live && setState({ status: 'ok', message: 'Your email was updated. Please sign in again.' }))
      .catch((e) => live && setState({ status: 'error', message: e?.message || 'This link is invalid or has expired.' }));
    return () => {
      live = false;
    };
  }, [params]);

  return (
    <div className="text-center space-y-4" role="status">
      <h2 className="text-xl font-bold dark:text-white">
        {state.status === 'working' ? 'Confirming…' : state.status === 'ok' ? 'Email confirmed' : 'Could not confirm'}
      </h2>
      {state.message && <p className="text-sm text-slate-500">{state.message}</p>}
      {state.status !== 'working' && (
        <Link to="/login" className="inline-block rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5">
          Go to sign in
        </Link>
      )}
    </div>
  );
}
