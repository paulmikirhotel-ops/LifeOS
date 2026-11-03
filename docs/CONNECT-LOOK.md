# Connect: Facebook-style look and 3D header

## What changes
- Connect header is a blue gradient card with the bell in a white chip. On the Overview page it is taller and has floating 3D spheres (three.js); on the other tabs it is a slim bar.
- Tabs are rounded pills that scroll sideways and keep the open one in view.
- Overview: a row of friends at the top (tap to open the chat, green ring when online, "Add friend" first), 2x2 stat tiles with gradient icons, and Recent conversations / Activity cards with a "See all" link.
- Avatars use soft gradients; chat rows are rounder, unread chats are bold with a gradient badge.
- The 3D part is only loaded on Overview, and never on weak phones, with "reduce motion" or data saver on, or without WebGL. Then the header keeps its plain gradient. It draws at most 30 frames per second and pauses when off screen or in the background.

## Apply (Git Bash)
    cd "/p/TASK  MANAGER APP/LifeOS-fresh"
    unzip -o "/p/New folder (2)/LifeOS-connect-look.zip"
    cd client
    npm install three
    npx vite build
    npx cap sync android
    cd ..
    git add client docs
    git status --short

`npm install three` adds the 3D library to client/package.json and package-lock.json (commit both).
Then commit, push, wait for the Netlify deploy, and in Android Studio: Build > Clean Project, then Run.
(The page code comes from Netlify; the Android steps are only needed if you want to re-sync the app.)

## Test
1. Open Connect > Overview: gradient header with floating spheres, friends row, 2x2 tiles.
2. Tap a friend in the row: that chat opens.
3. Open Chats, Friends, Calls: slim header; tabs scroll and the active one stays visible.
4. Dark mode: everything stays readable.
5. Phone setting "Remove animations" on: header is plain gradient, no 3D.

## Files
New: `client/src/utils/webgl.js`, `client/src/utils/orbScene.js`, `client/src/components/connect/ConnectOrbs.jsx`,
`client/src/components/connect/FriendStories.jsx`, `client/test/connect3d.test.mjs`, this doc.
Replaced (complete files, based on your latest commit): `client/src/pages/connect/ConnectLayout.jsx`, `client/src/pages/connect/ConnectHomePage.jsx`,
`client/src/components/connect/Avatar.jsx`, `client/src/components/connect/ConversationRow.jsx`.
Changed by `npm install three`: `client/package.json`, `client/package-lock.json`.
