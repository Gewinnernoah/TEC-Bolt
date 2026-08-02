import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'spa-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          if (!url.includes('.') && url !== '/') {
            req.url = '/index.html';
          }
          next();
        });
      },
    },
  ],
  base: '/TEC-Bolt/', // Passend zu deinem Repository "TEC-Bolt"
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
