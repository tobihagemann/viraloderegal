import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Dev runs the SPA on :5173 and the API on :3000. Proxy the concrete prefixes the client uses to the API by
// path: REST under /rooms, the curation/auth API under /api, the invite-accept under /admin/invites, and the
// WebSocket under a dedicated /ws. The hub attaches to the bare HTTP server with no path filter, so /ws
// reaches it untouched; a prefixed path keeps the proxy from capturing SPA document/asset requests or
// colliding with Vite's own root HMR socket. Curation lives under /api (not /admin/videos|/admin/sets) so
// those SPA document routes stay served by Vite. Production keeps the same paths same-origin, so dev and prod
// differ only by port.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/rooms': { target: 'http://localhost:3000', changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/admin/invites': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
});
