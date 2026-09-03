# LifeOS — User & System Manual

*Version 0.1 · September 2026 · Personal Digital Life Manager*

> A Word version of this manual ships alongside this file as
> `LifeOS-User-Manual.docx` in the same `docs/` folder.

---

## 1. Introduction

LifeOS is a personal digital life manager that brings planning, focus, money and habits into one secure workspace. It runs as a web application in any modern browser and works on desktop, tablet and mobile.

The application is organised around one idea: **one workspace where everything that needs your attention lives** — tasks with due dates, calendar events, a private journal, focus sessions, finance records, habits, goals, and analytics — with a central notification system that tells you, in real time, when something needs attention.

### 1.1 How the system functions — at a glance

- A browser frontend (React) that you interact with.
- An API server (Node.js / Express) that stores and secures your data.
- A database (MongoDB) that keeps every record.
- A real-time channel (Server-Sent Events) that pushes notifications to your browser the moment they are created.
- A reminder engine on the server that checks for due items every minute and raises notifications automatically.

Every module saves its data through the same secured API. When an event worth knowing about happens — a task is created or completed, a calendar event is about to start, a goal deadline passes — the notification engine creates a notification for you. If you are online, the bell updates instantly, a chime plays, and a small popup appears. If you are offline, nothing is lost: the notification is stored, and you see it the next time you open the application.

## 2. Accounts, Workspaces & Security

### 2.1 Your account

You sign in with your email address and password. The server keeps you signed in with secure cookies; you can change your password and manage security settings under **Settings → Security**.

### 2.2 Workspaces (tenants)

Data in LifeOS is organised into **workspaces**. Every user starts with a personal workspace. A workspace can also be shared: a team, a household, or a business can live in one workspace with several members.

You can create or join multiple workspaces and switch between them from the workspace selector at the top of the screen. **Everything you see — tasks, calendars, finance, notifications — belongs to the workspace you are currently in.**

### 2.3 Roles and permissions

Each member of a shared workspace has a role that controls what they can do:

| Role | Typical capabilities |
| --- | --- |
| Owner | Full control of the workspace: settings, members, all modules. |
| Finance Manager | Finance records and reporting, analytics, member viewing. |
| Assistant | Day-to-day operations such as tasks and scheduling. |
| Viewer | Read-only access to the modules shared with them. |

The owner can invite members and remove them under **Settings → Members**. When a member leaves, they no longer see any workspace data.

### 2.4 Data isolation — the security model

LifeOS is multi-tenant. The server decides which workspace you are acting in from your signed-in session — it never trusts a workspace id sent by the browser. Every query the server runs is scoped by **both** your user id and the active workspace id. This means:

- You can never see another user's records, even inside a shared workspace.
- Workspace A can never see workspace B's records, even if the same person belongs to both.
- Notifications you receive are always filtered to the workspace you are currently using.

If you delete your account or a workspace in the **Danger Zone**, the associated data is removed from the system.

## 3. Getting Started & Navigation

### 3.1 First steps

1. Create your account (or accept a workspace invitation you received by email).
2. Complete your profile under **Settings → Profile**.
3. Set up your workspace (name, currency, working hours) under **Settings → Workspace**.
4. Choose your notification preferences under **Settings → Notifications**.

### 3.2 Navigation

- **Desktop:** a sidebar on the left lists every module you can access. Collapse it to a compact rail if you prefer more space.
- **Mobile:** a bottom bar shows your three most important shortcuts; tap **More** to open a sheet with every other module, plus Log out.
- **Top bar (all devices):** workspace selector, theme switch (light/dark), and the **notification bell** with its live unread badge.

### 3.3 Workspace settings

- **Name** — shown in the workspace selector.
- **Currency** — used across the finance module and dashboard.
- **Working hours** — daily start/end used by scheduling views.
- **Opening balance** — the starting figure for your financial balances.

## 4. The Modules

Every module stores its records inside the active workspace. Records you create are private to you and the members of that workspace, according to roles.

### 4.1 Dashboard

Your home screen. It summarises the day: tasks due today and overdue, today's completed tasks, your next schedule blocks, habits completed today, focus minutes, income and expenses for the day, a productivity score for the week, and anything that needs a reminder. Cards link directly into their module.

### 4.2 Tasks

Create tasks with a title, optional due date, priority (urgent / high / medium / low) and subtasks. Tasks move through states — not started, in progress, completed, cancelled. You can filter and sort by status, priority and due date.

Tasks drive several notifications (see Section 5): when a task is created, when it is completed, and — automatically — when it is due within the next hour or becomes overdue.

### 4.3 Calendar

Plan events with start and end times on a monthly calendar view. Events that start within 30 minutes trigger an automatic **"Event starting soon"** reminder.

### 4.4 Journal

A private daily journal where you can record notes for each day. Your entries stay inside your workspace and are shown on the date they belong to.

### 4.5 Focus

Run timed focus sessions with planned durations and short breaks. The timer tracks started/ended sessions and paused time; your focus minutes roll up into the Dashboard and Analytics. Completed sessions are stored so you can see how much focused time you really had.

### 4.6 Finance

Record **income** and **expenses** with amounts, dates and categories in your workspace currency. The module gives you today's and this month's totals plus a running balance; income and expenses appear on the Dashboard and in Analytics.

### 4.7 Habits

Define habits with a target per day and log them each day. The module tracks streaks and completion, and the Dashboard shows how many habits you have completed today. Daily habit reminders can be delivered automatically (Section 5.7).

### 4.8 Goals

Set long-term goals with an optional target date and progress milestones. Completing a goal (or reaching its deadline) raises notifications automatically.

### 4.9 Analytics

A visual overview of the last 30 days: tasks completed and missed per day, focus minutes per day, time tracked by activity, spending by category, and income vs. expenses — plus task/habit/focus/savings summary cards. The page renders its data with small charts that show a friendly "no data yet" state until there is something to plot. Views are scoped to the active workspace and, where relevant, to you.

## 5. The Notification System

LifeOS has one central notification system shared by every module. It has five parts: the **bell**, the **panel**, **sounds**, **popup toasts**, and the **reminder engine** behind them.

### 5.1 The notification bell & badge

The bell sits in the top bar on every screen. A red badge shows the number of **unread** notifications. The badge is live: when a notification arrives while you are using the application, the number increases immediately — no page refresh needed.

### 5.2 The notification panel

Click the bell to open the panel — a dropdown on desktop, a sheet that slides up on mobile. The panel shows your recent notifications with:

- the module icon (task, calendar, habit, finance, goal…);
- a title and short message;
- when it happened ("2m ago", "yesterday"…);
- a clear visual difference between unread (bold, with an unread dot) and read (dimmed).

**Opening a notification marks it read** and takes you straight to the related item — a task reminder opens your tasks, an event reminder opens the calendar, and so on. Read notifications leave the unread count immediately. Use **Mark all read** to clear everything at once.

The full history — read and unread — lives on the **Notifications page** (bell panel → *View all notifications*), with tabs for All / Unread, pagination, and the ability to delete individual notifications.

### 5.3 Read / unread behaviour

Reading is a status flag, never a deletion:

- an unread notification is counted in the badge and highlighted;
- when you click it, it is marked read (`isRead`), the badge decreases, and it no longer appears in the unread view;
- the record stays in your history as read, so you can always look it up later;
- popup toasts never mark notifications read by themselves — only your click does.

### 5.4 Notification sounds

A short, soft two-note chime plays whenever a **new** notification arrives while the application is open. The sound is generated locally in your browser (no audio file is downloaded).

- The chime plays **once per notification** — never twice for the same one.
- Refreshing the page never replays old sounds: only genuinely new notifications make a sound.
- Already-read notifications never play a sound.
- Browsers block automatic audio until you interact with the page at least once; LifeOS unlocks its audio engine on your first click or key press, so sound works from then on. If you prefer silence, turn the sound off in **Settings → Notifications**.

### 5.5 Popup toasts

Each new notification also shows a small toast in the top-right corner (full-width on phones) with the title and message. It slides in smoothly, stays for about five seconds, then disappears on its own. Clicking a toast opens the notification (which marks it read and navigates to the related item). Toasts never mark a notification read on their own.

### 5.6 What generates a notification

| Module | When you get a notification | Example |
| --- | --- | --- |
| Tasks | Created · Completed · Due within 60 minutes · Overdue | "Task "Submit assignment" is due in 30 minutes." |
| Calendar | Event starts within 30 minutes | ""Team sync" starts at 09:30." |
| Habits | Due today (morning reminder) · First completion of the day | "Time for "Exercise" — not logged yet today." |
| Goals | Created · Deadline within 24 h · Deadline passed · Completed | "Goal "Learn Spanish" deadline is tomorrow." |
| Workspace | Invitation to join | "You were invited to a workspace — accept it to join." |

Notifications that would be pure noise are deliberately not created — for example, recording an expense does not notify you that you just recorded it. The reminder engine only raises reminders that make sense for how you use the module.

### 5.7 The reminder engine (scheduler)

The server checks every 60 seconds for things that need a reminder: tasks due in the next hour, tasks that just became overdue, calendar events starting in the next 30 minutes, goal deadlines within the next 24 hours (or already passed), and habit reminders during the morning window.

Every reminder carries a unique fingerprint, so the same reminder can never be created twice — not on page refresh, not after a server restart, and not if several server instances are running. You will never see a duplicate "Task overdue" notification for the same task.

Read notifications older than 90 days are cleaned up automatically to keep your history fast.

### 5.8 Real-time delivery

While the application is open, your browser keeps a lightweight, always-on connection to the server (Server-Sent Events). The moment a notification is created for you, the server pushes it down this channel:

- the bell badge increases;
- the chime plays;
- the toast appears;
- the panel list updates — all without refreshing the page.

If the connection drops (network change, laptop sleep), the application notices and reconnects automatically. While it is reconnecting it quietly re-checks your unread count in the background, so nothing is missed. If you switch to another workspace, your stream follows you and only that workspace's notifications are shown.

### 5.9 Notification preferences

**Settings → Notifications** lets you control everything:

- **Notification sound** — chime on/off.
- **Popup notifications** — toasts on/off.
- **Desktop notifications** — optional system pop-ups when the browser tab is in the background (you grant this once in your browser; if you decline, the application works exactly the same in the foreground).
- **Per-module switches** — turn entire modules on or off (Tasks, Calendar, Journal, Focus, Finance, Habits, Goals, Invitations). Workspace invitations and system alerts are always delivered.

Preferences are saved to your account and follow you across devices. Disabled modules stop producing notifications at the source — nothing is created in the background and later shown to you.

## 6. Working Together in a Workspace

### 6.1 Members and invitations

The owner can invite people by email from **Settings → Members**. Invited people receive an email with an invitation link and join the workspace with the role you chose. You can remove members at any time; removed members lose access immediately.

### 6.2 What each role can do

Roles give members access to the modules their work needs (Section 2.3). The dashboard, tasks and schedules are shared with day-to-day roles, finance and analytics with finance roles, and workspace administration stays with the owner.

### 6.3 Privacy inside a shared workspace

Your notifications belong to you: when another member creates a task in the shared workspace, the notification is addressed to the member who is responsible for it — other members never receive or see your personal notification stream.

## 7. Troubleshooting & FAQ

| Symptom | What to check |
| --- | --- |
| No sound when a notification arrives | Make sure you have clicked anywhere in the page at least once (browsers unlock audio after the first interaction) and that "Notification sound" is on in **Settings → Notifications**. Device volume muted also silences the chime. |
| The bell badge does not update | The badge updates in real time. If the connection dropped (e.g. laptop sleep), it re-syncs automatically within a minute. Refresh the page if you are in a hurry. |
| No popup toast appears | Check "Popup notifications" in **Settings → Notifications**. Toasts appear only while the application tab is open and focused. |
| I don't want desktop pop-ups | Turn "Desktop notifications" off in **Settings → Notifications** — or block them in your browser's site settings. |
| I keep getting task reminders for old tasks | Reminders are created once per task and never duplicated. If a task stays overdue, complete or delete it to stop further reminders. |
| A reminder did not arrive at the exact minute | The server checks every 60 seconds, so a reminder can arrive up to a minute after its threshold (e.g. "due within 60 minutes" may fire slightly before or after the hour mark). |
| I read a notification but it still shows unread | Only clicking the notification marks it read. Use "Mark all read" to clear the badge in one action. |
| Can other members of my workspace see my notifications? | No. Notifications are personal and workspace-scoped — each member sees only their own. |
| The Analytics page is blank | Analytics data comes from `GET /analytics/overview`. The page intentionally shows "no data yet" placeholders when a chart has nothing to plot, and the API client no longer treats cached 304 responses as errors — so if it is still empty, check the browser console / network tab for a request error and that the server is reachable. |
| What happens to notifications when I delete an item (task, event…)? | The notification stays in your history as a record of the event; you can delete individual notifications from the Notifications page. |

### 7.1 Status and support

This manual describes LifeOS version 0.1. The application keeps working if the notification system or its sound cannot run — those features are designed to fail silently rather than interrupt your work.
