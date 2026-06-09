import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend target for the dev proxy. Defaults to :3000, but can be overridden
// (e.g. VITE_PROXY_TARGET=http://localhost:3002) to point the dev frontend at a
// separate dev backend without colliding with a PM2/prod backend on :3000.
const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/api': {
        target: PROXY_TARGET,
        changeOrigin: true,
      },
      '/socket.io': {
        target: PROXY_TARGET,
        ws: true,
        changeOrigin: true,
      },
      // Uploaded files (message attachments, profile images, etc.) are served
      // by the backend. Without this, /uploads/* hits the SPA fallback (index.html)
      // → broken images and "clicking an attachment lands on the home screen".
      '/uploads': {
        target: PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  // Allow existing process.env.NODE_ENV checks to keep working
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
