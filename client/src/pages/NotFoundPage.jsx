import React from 'react';
import { Link } from 'react-router-dom';
import { Home, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui.jsx';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 rounded-3xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-8">
        <AlertCircle className="w-12 h-12 text-indigo-600" />
      </div>
      <h1 className="text-6xl font-black dark:text-white mb-4">404</h1>
      <h2 className="text-2xl font-bold dark:text-white mb-2">Page Not Found</h2>
      <p className="text-slate-500 max-w-md mb-10">
        The page you are looking for doesn't exist or has been moved. 
        Let's get you back on track.
      </p>
      <Link to="/">
        <Button icon={Home} size="lg" className="px-8 rounded-2xl">
          Back to Home
        </Button>
      </Link>
    </div>
  );
}
