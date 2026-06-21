import { adminClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

// Same-origin: the API serves the SPA and mounts better-auth under /api/auth. The admin + organization client
// plugins mirror the server plugins so sign-in, the reactive session store, and invite calls share one typed
// client. The route guard reads the session via an explicit `authClient.getSession()` (not the reactive
// `useSession()` store, which is isPending on first load and can't be read synchronously in a guard).
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  plugins: [adminClient(), organizationClient()],
});
