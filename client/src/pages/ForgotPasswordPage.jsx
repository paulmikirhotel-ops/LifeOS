import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Input } from '../components/ui.jsx';

const forgotSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'),
});

export default function ForgotPasswordPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', data);
      if (res.success) {
        setSent(true);
      } else {
        addToast(res.message, 'error');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold dark:text-white">Check your email</h2>
        <p className="text-sm text-slate-500">We've sent a password reset link to your email address.</p>
        <Link to="/login" className="block text-indigo-600 font-semibold hover:underline">Back to Login</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold dark:text-white">Forgot password?</h2>
        <p className="text-sm text-slate-500 mt-1">Enter your email and we'll send you a reset link</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email Address"
          placeholder="name@example.com"
          {...register('email')}
          error={errors.email?.message}
        />
        <Button type="submit" className="w-full" loading={loading}>
          Send Reset Link
        </Button>
      </form>

      <div className="text-center">
        <Link to="/login" className="text-sm text-slate-500 hover:text-indigo-600 font-medium">Back to Login</Link>
      </div>
    </div>
  );
}
