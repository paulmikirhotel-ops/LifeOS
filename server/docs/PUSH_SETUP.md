# Alerts when LifeOS is closed (web push) - setup

1. In the server folder run:  npm install web-push
2. Make your keys (once):     npx web-push generate-vapid-keys
3. Put them in server/.env:
     VAPID_PUBLIC_KEY=...the public key...
     VAPID_PRIVATE_KEY=...the private key...
     VAPID_SUBJECT=mailto:you@your-email.com
   On Render, add the same three variables under Environment. Never share the private key. Keep the same keys forever,
   or every device has to turn alerts on again.
4. Restart the server. Open Settings > Notifications > "Alerts on this device" and press Turn on.

Needs HTTPS (Netlify is fine) and the production build or deployed site. iPhone: install the app to the Home Screen first (Safari, iOS 16.4+).
