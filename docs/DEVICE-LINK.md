# Sign in with QR, several devices, and Linked devices

## What you get

1. **Several devices at once.** Before, signing in on a second device signed the first one out (the server kept only one refresh token per person). Now every device has its own session. Up to 10 devices per account; the one used longest ago is signed out first.
2. **Sign in with QR.** On a computer, the sign-in page has "Sign in with QR code". It shows a QR and a short code like `K7M2-9QXF`. On a phone that is already signed in (the LifeOS app, or LifeOS in the phone's browser) open **Link a device**, scan the code (or type the short code), check the letters match, and tap **Allow**. The computer signs itself in. The phone stays signed in.
3. **Linked devices list.** The same page lists every device signed in to the account, with a Remove button for each.

Only an account with a **verified email** can allow a computer in.

## How it stays safe (in simple words)

- The QR holds a random 48-character code. The server stores only a fingerprint (hash) of it.
- The computer's page also keeps a second secret that never goes in the QR. Only the page that asked can collect the sign-in, so someone who photographs your QR cannot sign in.
- The short code is shown on **both** screens. This stops the trick "scan a stranger's code": the phone shows the computer's name, a shortened network address and the code, with a warning to allow only a code you opened yourself just now.
- A code lasts 2 minutes and works once. An approved sign-in must be collected within 30 seconds.
- Guessing is slowed down: 10 new codes a minute and 90 status checks a minute per address; typing a short code is limited to 8 tries a minute per person.
- A wrong code and an old code give the same answer, so nothing can be probed.
- Changing or resetting a password, or deleting the account, signs out every device.

## Files

New, server: `src/utils/deviceLink.logic.js`, `src/models/deviceLink.model.js`, `src/services/session.service.js`, `src/services/deviceLink.service.js`, `src/controllers/deviceLink.controller.js`, `src/routes/deviceLink.routes.js`, `scripts/apply-devices-patch.mjs`, tests `deviceLink.logic.test.mjs`, `deviceLink.service.test.mjs`, `devices.patch.test.mjs`.

New, client: `src/api/deviceLink.js`, `src/utils/deviceLink.js`, `src/pages/QrSignInPage.jsx`, `src/pages/LinkDevicePage.jsx`, `scripts/apply-devices-patch.mjs`, tests `deviceLink.utils.test.mjs`, `devices.patch.test.mjs`.

Changed by the patch scripts: server `src/services/auth.service.js`, `src/controllers/auth.controller.js`, `src/routes/index.js`; client `src/routes/AppRoutes.jsx`, `src/pages/LoginPage.jsx`, `src/layouts/AppLayout.jsx`. The client also gets two packages: `qrcode` (draws the QR) and `jsqr` (reads it on browsers with no built-in reader).

## Things to know

- **Removing a device is not instant for pages already open.** Access tokens are stateless and last 15 minutes, so a removed device can keep working up to 15 minutes; it cannot renew after that.
- **Signing out** now signs out only that device. Push alerts are switched off only when no device is left.
- **People signed in before this update stay signed in.** Their old single token is adopted into a device session the first time it refreshes.
- **The phone's own camera app** opens the code as a link in the browser, not in the LifeOS app. If the phone browser is signed in it works; otherwise use **Link a device** inside the app, which has its own scanner.
- **Not tested here:** real MongoDB, the camera, and QR drawing/reading in a browser (the sandbox has no browser or those packages). The server logic ran against stand-in tables; please run the checklist below.

## Test checklist (after deploy)

1. Sign in on the computer and on the phone with the same account. Both stay signed in; both show in **Link a device**.
2. Sign out on the computer. The phone is still signed in.
3. Sign out on the computer, open the sign-in page, choose **Sign in with QR code**. A QR and `XXXX-XXXX` appear.
4. On the phone (app) open **Link a device** -> Scan a code. The phone shows "Chrome on Windows wants to sign in" and the same letters. Tap Allow. The computer signs in within about 2 seconds.
5. Repeat but type the code instead of scanning.
6. Repeat and tap Deny: the computer says it was declined.
7. Wait 2 minutes without scanning: the computer says the code is no longer valid and offers a new one.
8. Use an account whose email is not verified: the phone page says to verify first.
9. Remove the computer from the list on the phone; after at most 15 minutes the computer is signed out.
