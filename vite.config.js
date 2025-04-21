// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  publicDir: 'public', // default; only needed if you're changing it

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        problemsAll: path.resolve(__dirname, 'problems-all.html'),
      },
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
});
