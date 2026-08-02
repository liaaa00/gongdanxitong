import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Keep frontend API calls relative (/api). In dev server, Vite proxies those
// relative requests to the backend running on THIS server machine.
// Do not proxy to a coworker's localhost when they open http://SERVER_IP:5173.
const apiTarget = 'http://127.0.0.1:3000';

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
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
