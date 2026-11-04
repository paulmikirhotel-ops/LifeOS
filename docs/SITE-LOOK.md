# Site-wide look, part 1 (shared pieces + main pages)

Same blue gradient style as Connect, now across LifeOS.

## What changes
- New shared header `SiteHero` (blue gradient card). The old `PageHeader` now uses it, so Focus, Finance, Goals, Habits, Today, Notifications and Analytics get it automatically.
- Dashboard: big header with the floating 3D spheres (only on devices that can show them), greeting, date and the Add Task / Focus buttons in a white chip.
- Tasks and Calendar: slim gradient header (Calendar's month arrows and Today sit in the white chip).
- Stat tiles (`StatCard`): round gradient icons.
- App shell: the open item in the sidebar is a blue gradient pill; bottom bar and "More" sheet use blue, the "More" sheet has rounder corners; avatars are blue gradients.

## Not yet changed (part 2)
Settings, Journal, Community, Radar, My life, Data & offline, Link a device, Assistant, NextStep and the login pages keep their old headers for now.

## Apply (Git Bash)
    cd "/p/TASK  MANAGER APP/LifeOS-fresh"
    unzip -o "/p/New folder (2)/LifeOS-site-look-1.zip"
    cd client
    npx vite build
    cd ..
    git add client docs
    git status --short
    git commit -m "Site look part 1: gradient page headers, stat tiles, app shell"
    git push origin app-update:main

Netlify then deploys by itself. Close and reopen the app (twice if needed).

## Test
Dashboard (header + spheres, stat tiles), Tasks (New task button still opens the drawer), Calendar (arrows and Today work, month text updates),
Focus/Finance/Goals/Habits/Today/Analytics (new header, buttons on the right still work), sidebar/bottom bar, dark mode.

## Files
New: `client/src/components/SiteHero.jsx`, this doc.
Replaced (complete files from your latest commit): `client/src/components/ui.jsx`, `client/src/pages/DashboardPage.jsx`,
`client/src/pages/TasksPage.jsx`, `client/src/pages/CalendarPage.jsx`, `client/src/layouts/AppLayout.jsx`.
