import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.AGRO_PREVIEW_HOST ? '127.0.0.1' : 'localhost',
    port: 5173,
    strictPort: true,
    // Somente o host exato do encaminhamento privado, definido pelo launcher.
    allowedHosts: process.env.AGRO_PREVIEW_HOST ? [process.env.AGRO_PREVIEW_HOST] : [],
    proxy: {
      '/api': { target: 'http://127.0.0.1:3333' },
      '/docs': { target: 'http://127.0.0.1:3333' },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
