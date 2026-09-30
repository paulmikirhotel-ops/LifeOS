import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import { Spinner } from '../components/ui.jsx';

// Auth Pages
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../pages/RegisterPage.jsx'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage.jsx'));
const VerifyEmailPage = lazy(() => import('../pages/VerifyEmailPage.jsx'));
const AcceptInvitePage = lazy(() => import('../pages/AcceptInvitePage.jsx'));

// App Pages
const DashboardPage = lazy(() => import('../pages/DashboardPage.jsx'));
const TasksPage = lazy(() => import('../pages/TasksPage.jsx'));
const CalendarPage = lazy(() => import('../pages/CalendarPage.jsx'));
const JournalPage = lazy(() => import('../pages/JournalPage.jsx'));
const FocusPage = lazy(() => import('../pages/FocusPage.jsx'));
const FinancePage = lazy(() => import('../pages/FinancePage.jsx'));
const HabitsPage = lazy(() => import('../pages/HabitsPage.jsx'));
const GoalsPage = lazy(() => import('../pages/GoalsPage.jsx'));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage.jsx'));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage.jsx'));
const SettingsPage = lazy(() => import('../pages/SettingsPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

// Meetings
const MeetingsLayout = lazy(() => import('../pages/meetings/MeetingsLayout.jsx'));
const MeetingDashboardPage = lazy(() => import('../pages/meetings/MeetingDashboardPage.jsx'));
const MeetingCalendarPage = lazy(() => import('../pages/meetings/MeetingCalendarPage.jsx'));
const MeetingHistoryPage = lazy(() => import('../pages/meetings/MeetingHistoryPage.jsx'));
const MeetingActionItemsPage = lazy(() => import('../pages/meetings/MeetingActionItemsPage.jsx'));
const ScheduleMeetingPage = lazy(() => import('../pages/meetings/ScheduleMeetingPage.jsx'));
const MeetingDetailsPage = lazy(() => import('../pages/meetings/MeetingDetailsPage.jsx'));
const LiveMeetingPage = lazy(() => import('../pages/meetings/LiveMeetingPage.jsx'));
const SharedMeetingPage = lazy(() => import('../pages/meetings/SharedMeetingPage.jsx'));

const PageLoader = () => (
  <div className="h-full w-full flex items-center justify-center min-h-[400px]">
    <Spinner size="lg" />
  </div>
);

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
        </Route>

        {/* Public, read-only shared meeting (explicit share link) */}
        <Route path="/shared/:token" element={<SharedMeetingPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/meetings" element={<MeetingsLayout />}>
            <Route index element={<MeetingDashboardPage />} />
            <Route path="calendar" element={<MeetingCalendarPage />} />
            <Route path="history" element={<MeetingHistoryPage />} />
            <Route path="action-items" element={<MeetingActionItemsPage />} />
          </Route>
          <Route path="/meetings/new" element={<ScheduleMeetingPage />} />
          <Route path="/meetings/:id/edit" element={<ScheduleMeetingPage />} />
          <Route path="/meetings/:id/live" element={<LiveMeetingPage />} />
          <Route path="/meetings/:id" element={<MeetingDetailsPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
