import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import HomeView from './views/HomeView.vue';
import RoomView from './views/RoomView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/room/:code', name: 'room', component: RoomView, props: true },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
