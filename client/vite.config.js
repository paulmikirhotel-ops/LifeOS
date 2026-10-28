import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Camera and microphone only work on a SECURE origin (https://… or http://localhost). A phone that opens
 * http://192.168.x.x:5173 can join a meeting and listen, but the browser hides navigator.mediaDevices, so it can
 * never turn its camera or microphone on. To test from a phone over Wi-Fi, the dev server therefore serves HTTPS
 * (self-signed certificate: the phone shows a one-time warning - choose "Advanced -> continue").
 *
 *   npm install            (installs @vitejs/plugin-basic-ssl)
 *   npm run dev            -> https://localhost:5173  and  https://<your-LAN-IP>:5173
 *   HTTPS=false npm run dev  -> plain http (the old behaviour; the phone's camera/mic will not work)
 *
 * /api is still proxied to the Express server over http on this computer, so the backend needs no certificate.
 */
export default defineConfig(async () => {
  const plugins = [react(), tailwindcss()];
  if (process.env.HTTPS !== 'false') {
    try {
      // The plugin switches the dev server to HTTPS with a self-signed certificate.
      const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
      plugins.push(basicSsl());
    } catch {
      console.warn('[vite] @vitejs/plugin-basic-ssl is not installed - serving plain http. Run "npm install" so a phone on your Wi-Fi can use its camera and microphone.');
    }
  }
  return {
    plugins,
    server: {
      port: 5173,
      host: true, // listen on the LAN too, so a phone can open it
      allowedHosts: true, // dev only: also accept a tunnel address (ngrok / Cloudflare Tunnel), which Vite 6 otherwise blocks
      proxy: {
        // In dev, /api requests are proxied to the Express server.
        // The axios baseURL can simply be '/api'.
        '/api': 'http://localhost:5000',
      },
    },
  };
});
