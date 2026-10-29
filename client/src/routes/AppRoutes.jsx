import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import { Spinner } from '../components/ui.jsx';

// Auth Pages
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const QrSignInPage = lazy(() => import('../pages/QrSignInPage.jsx'));
const LinkDevicePage = lazy(() => import('../pages/LinkDevicePage.jsx'));
const RegisterPage = lazy(() => import('../pages/RegisterPage.jsx'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage.jsx'));
const VerifyEmailPage = lazy(() => import('../pages/VerifyEmailPage.jsx'));
const AcceptInvitePage = lazy(() => import('../pages/AcceptInvitePage.jsx'));

// App Pages
const DashboardPage = lazy(() => import('../pages/DashboardPage.jsx'));
const TodayPage = lazy(() => import('../pages/TodayPage.jsx'));
const TasksPage = lazy(() => import('../pages/TasksPage.jsx'));
const CalendarPage = lazy(() => import('../pages/CalendarPage.jsx'));
const JournalPage = lazy(() => import('../pages/JournalPage.jsx'));
const FocusPage = lazy(() => import('../pages/FocusPage.jsx'));
const FinancePage = lazy(() => import('../pages/FinancePage.jsx'));
const HabitsPage = lazy(() => import('../pages/HabitsPage.jsx'));
const GoalsPage = lazy(() => import('../pages/GoalsPage.jsx'));
const LifePage = lazy(() => import('../pages/LifePage.jsx'));
const DataPage = lazy(() => import('../pages/DataPage.jsx'));
const CommunityPage = lazy(() => import('../pages/CommunityPage.jsx'));
const CommunityReportsPage = lazy(() => import('../pages/CommunityReportsPage.jsx'));
const RadarPage = lazy(() => import('../pages/RadarPage.jsx'));
const NextStepPage = lazy(() => import('../pages/NextStepPage.jsx'));
const AssistantPage = lazy(() => import('../pages/AssistantPage.jsx'));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage.jsx'));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage.jsx'));
const SettingsPage = lazy(() => import('../pages/SettingsPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));
const PrivacyPage = lazy(() => import('../pages/legal/PrivacyPage.jsx'));
const TermsPage = lazy(() => import('../pages/legal/TermsPage.jsx'));
const HelpPage = lazy(() => import('../pages/legal/HelpPage.jsx'));

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
const MeetingInvitePage = lazy(() => import('../pages/meetings/MeetingInvitePage.jsx'));
const MeetingMinutesPage = lazy(() => import('../pages/meetings/MeetingMinutesPage.jsx'));
const GuestRoomPage = lazy(() => import('../pages/meetings/GuestRoomPage.jsx'));
const MeetingRoomPage = lazy(() => import('../pages/meetings/MeetingRoomPage.jsx'));

// Connect
const ConnectLayout = lazy(() => import('../pages/connect/ConnectLayout.jsx'));
const ConnectHomePage = lazy(() => import('../pages/connect/ConnectHomePage.jsx'));
const ChatsPage = lazy(() => import('../pages/connect/ChatsPage.jsx'));
const GroupsPage = lazy(() => import('../pages/connect/GroupsPage.jsx'));
const FriendsPage = lazy(() => import('../pages/connect/FriendsPage.jsx'));
const FilesPage = lazy(() => import('../pages/connect/FilesPage.jsx'));
const ConnectReportsPage = lazy(() => import('../pages/admin/ConnectReportsPage.jsx'));
const CallsPage = lazy(() => import('../pages/connect/CallsPage.jsx'));
const CallPage = lazy(() => import('../pages/connect/CallPage.jsx'));
const ConnectSoonPage = lazy(() => import('../pages/connect/ConnectSoonPage.jsx'));

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
          <Route path="/login/qr" element={<QrSignInPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
        </Route>

        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/help" element={<HelpPage />} />

        {/* Public, read-only shared meeting (explicit share link) */}
        <Route path="/shared/:token" element={<SharedMeetingPage />} />

        {/* Public meeting invitation link (shared via WhatsApp etc.; password protected) */}
        <Route path="/meet/:token" element={<MeetingInvitePage />} />
        <Route path="/meet/:token/room" element={<GuestRoomPage />} />
        <Route path="/meet/:token/minutes" element={<MeetingMinutesPage />} />
        <Route path="/minutes/:key" element={<MeetingMinutesPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/today" element={<TodayPage />} />
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
          <Route path="/meetings/:id/room" element={<MeetingRoomPage />} />
          <Route path="/meetings/:id" element={<MeetingDetailsPage />} />
          <Route path="/connect/call/:id" element={<CallPage />} />
          <Route path="/admin/reports" element={<ConnectReportsPage />} />
          <Route path="/connect" element={<ConnectLayout />}>
            <Route index element={<ConnectHomePage />} />
            <Route path="chats" element={<ChatsPage />} />
            <Route path="chats/:id" element={<ChatsPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="calls" element={<CallsPage />} />
          </Route>
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/life" element={<LifePage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/admin/community-reports" element={<CommunityReportsPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/nextstep" element={<NextStepPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/link" element={<LinkDevicePage />} />
          <Route path="/link/:code" element={<LinkDevicePage />} />
        </Route>

        {/* Catch-all */}
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
