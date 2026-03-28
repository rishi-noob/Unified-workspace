import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
        /** Avoid scary stack traces when the API is not up yet (browser retries; start API or run `pnpm run dev`). */
        configure: (proxy) => {
          proxy.on('error', (err: Error & { code?: string }) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') return;
            console.error('[vite proxy /socket.io]', err.message);
          });
        },
      },
    },
  },
});
