# Site-wide look, part 2 (needs part 1 applied first: it adds components/SiteHero.jsx)

The remaining pages get the same blue gradient header:
Settings (slim bar across the top, tabs below), Community, Opportunity Radar (Refresh / Sources in the white chip), My life, Data and offline,
Link a device, Assistant (usage badge + New chat in the chip), NextStep (AI drafts badge + New goal in the chip), Community reports (admin).
Community's selected tab is now blue like the rest.

Left as they were on purpose: Journal (full-height writing workspace), the login / sign-up / reset pages (own design), the Connect pages (done earlier).

## Apply (Git Bash)
    cd "/p/TASK  MANAGER APP/LifeOS-fresh"
    unzip -o "/p/New folder (2)/LifeOS-site-look-2.zip"
    cd client
    npx vite build
    cd ..
    git add client docs
    git status --short
    git commit -m "Site look part 2: gradient headers on remaining pages"
    git push origin app-update:main

## Test
Open each page: header shows, buttons on the right work (Radar Refresh/Sources, Assistant New chat, NextStep New goal), Settings tabs still switch,
dark mode readable.

## Files (all complete files from your latest commit)
Replaced: `client/src/pages/SettingsPage.jsx`, `CommunityPage.jsx`, `RadarPage.jsx`, `LifePage.jsx`, `DataPage.jsx`, `LinkDevicePage.jsx`,
`AssistantPage.jsx`, `NextStepPage.jsx`, `CommunityReportsPage.jsx` (in `client/src/pages/`). New: this doc.
