import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Input } from '../components/ui.jsx';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  workspaceType: z.enum(['personal', 'organization']),
  organizationName: z.string().optional(),
}).refine((data) => {
  if (data.workspaceType === 'organization' && !data.organizationName) {
    return false;
  }
  return true;
}, {
  message: "Organization name is required for organization accounts",
  path: ["organizationName"],
});

export default function RegisterPage() {
  const { register: authRegister } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      workspaceType: 'personal',
    }
  });

  const workspaceType = watch('workspaceType');

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await authRegister(data);
      if (res.success) {
        addToast('Account created successfully!');
        navigate('/');
      } else {
        addToast(res.message || 'Registration failed', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold dark:text-white">Create your account</h2>
        <p className="text-sm text-slate-500 mt-1">Start managing your digital life today</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name"
          placeholder="John Doe"
          {...register('name')}
          error={errors.name?.message}
        />
        <Input
          label="Email Address"
          type="email"
          placeholder="john@example.com"
          {...register('email')}
          error={errors.email?.message}
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          error={errors.password?.message}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Workspace Type</label>
          <div className="grid grid-cols-2 gap-4">
            <label className={`
              flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all
              ${workspaceType === 'personal' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800'}
            `}>
              <input type="radio" value="personal" className="hidden" {...register('workspaceType')} />
              <span className="text-sm font-bold dark:text-white">Personal</span>
              <span className="text-[10px] text-slate-500">Just for me</span>
            </label>
            <label className={`
              flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition-all
              ${workspaceType === 'organization' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800'}
            `}>
              <input type="radio" value="organization" className="hidden" {...register('workspaceType')} />
              <span className="text-sm font-bold dark:text-white">Organization</span>
              <span className="text-[10px] text-slate-500">For teams</span>
            </label>
          </div>
        </div>

        {workspaceType === 'organization' && (
          <Input
            label="Organization Name"
            placeholder="Acme Inc."
            {...register('organizationName')}
            error={errors.organizationName?.message}
          />
        )}

        <Button type="submit" className="w-full" loading={loading}>
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="text-indigo-600 hover:text-indigo-500 font-semibold transition-colors">
          Sign In
        </Link>
      </p>
    </div>
  );
}
