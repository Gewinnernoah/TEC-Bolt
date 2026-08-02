import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { postgresServerPlugin } from './vite-plugin-postgres';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), postgresServerPlugin()],
  base: '/TEC-Bolt/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
