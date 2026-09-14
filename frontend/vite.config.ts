import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Keep frontend API calls relative (/api). In dev server, Vite proxies those
// relative requests to the backend running on THIS server machine.
// Do not proxy to a coworker's localhost when they open http://SERVER_IP:5173.
// Port numbers are injected by config/env.ps1 (single source of truth) through
// the environment; the literals below are only fallbacks for bare `npm run dev`.
const backendPort = Number(process.env.VITE_BACKEND_PORT ?? 3000);
const frontendPort = Number(process.env.VITE_PORT ?? 5173);
const apiTarget = process.env.VITE_API_TARGET ?? `http://127.0.0.1:${backendPort}`;

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    // strictPort: when 5173 is taken, fail loudly instead of silently drifting to
    // 5178 (coworkers bookmarks http://SERVER_IP:5173 and would get a dead page).
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/events': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
      '/socket.io': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      less: { javascriptEnabled: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor': ['antd', '@ant-design/icons', '@ant-design/pro-components', 'dayjs'],
          'data-vendor': ['zustand', 'axios'],
        },
      },
    },
    chunkSizeWarningLimit: 2500,
  },
}));
