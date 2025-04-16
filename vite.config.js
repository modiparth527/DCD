// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // Set the root directory (where index.html is)
  // Since your HTML is in 'public', Vite might find it automatically,
  // but it's often better to move index.html to the root or be explicit.
  // Let's assume for now index.html stays in public - Vite might need help.

  // Option A: If index.html is moved to the ROOT (DAILY_CODING_DOSE/)
  // root: '.', // Default is project root
  // publicDir: 'public', // Serve static assets from 'public' BUT NOT index.html

  // Option B: If index.html stays in 'public/' (More likely your current setup)
  // Vite might struggle finding the entry point automatically.
  // It's often cleaner to have index.html in the root.
  // BUT, we can try telling vite where the root and entry is:
   root: 'public', // Treat 'public' as the source root
   publicDir: '../public_assets', // Use a different dir for other static assets if needed, or disable
   build: {
       // Output the build files to a 'dist' directory relative to the project root
       outDir: '../dist',
       emptyOutDir: true, // Clear the directory before building
       // Tell Vite where the actual HTML entry point is relative to the root specified above
       rollupOptions: {
          input: '/index.html' // Relative to the 'root' which is 'public'
       }
   },


  server: {
    port: 5173, // Port for the Vite frontend dev server (default is 5173)
    strictPort: true, // Fail if port is already in use
    proxy: {
      // Proxy API requests (/api/*) to your backend Node.js server
      // Assumes backend runs on port 3000
      '/api': {
        target: 'http://localhost:3000', // Your backend server URL
        changeOrigin: true, // Needed for virtual hosted sites
        // secure: false, // Uncomment if backend uses self-signed HTTPS cert
        // rewrite: (path) => path.replace(/^\/api/, '/api') // Usually not needed if backend route starts with /api
      }
    }
  }
});