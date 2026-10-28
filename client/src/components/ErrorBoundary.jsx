import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Catches a crash in any page so the user sees a calm message instead of a blank white screen.
 * Resets itself when the user navigates to another page.
 */
class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong on this page</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Your data is safe. Try again, or reload the page. If it keeps happening, tell us what you were doing.
          </p>
          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="min-h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
