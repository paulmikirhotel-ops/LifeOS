import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // In dev, /api requests are proxied to the Express server.
      // The axios baseURL can simply be '/api'.
      '/api': 'http://localhost:5000',
    },
  },
});
