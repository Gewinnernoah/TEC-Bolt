// Vite plugin: auto-starts the local PostgreSQL API server alongside the dev server.
// When `npm run dev` runs, this plugin spawns server/postgres-server.mjs as a child process.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function postgresServerPlugin() {
  let serverProcess = null;

  return {
    name: 'postgres-server',
    apply: 'serve', // only during dev, not production build
    configureServer() {
      const serverScript = resolve(__dirname, 'server', 'postgres-server.mjs');

      serverProcess = spawn('node', [serverScript], {
        stdio: 'inherit',
        env: { ...process.env },
        cwd: resolve(__dirname),
      });

      serverProcess.on('error', (err) => {
        console.error('[Vite Plugin] Failed to start PostgreSQL server:', err.message);
      });

      // Shut down the API server when Vite exits
      process.on('exit', () => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill();
        }
      });
    },
  };
}
