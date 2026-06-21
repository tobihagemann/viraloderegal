import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { authClient } from './auth/client.js';
import HomeView from './views/HomeView.vue';
import RoomView from './views/RoomView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/room/:code', name: 'room', component: RoomView, props: true },
  { path: '/admin/login', name: 'adminLogin', component: () => import('./views/AdminLoginView.vue') },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { requiresAuth: true } },
  { path: '/admin/accept-invite/:invitationId', name: 'adminAcceptInvite', component: () => import('./views/AdminInviteAcceptView.vue'), props: true },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Gate /admin behind an authenticated better-auth session. Resolve it via an explicit fetch (the reactive
// store is isPending on first load), and send unauthenticated users to the admin login. Game routes carry no
// requiresAuth meta and stay guard-free.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) {
    return true;
  }
  const { data } = await authClient.getSession();
  return data ? true : { name: 'adminLogin' };
});
