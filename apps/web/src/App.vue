<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import MuteToggle from './components/MuteToggle.vue';

const { t } = useI18n();
</script>

<template>
  <div class="isolate flex min-h-dvh flex-col">
    <header class="sticky top-0 z-10 border-b border-neutral-950/10 bg-white/90 backdrop-blur">
      <div class="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <RouterLink to="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
          <svg class="size-7 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <g class="fill-neutral-400">
              <rect x="6" y="42" width="8" height="12" rx="4" />
              <rect x="17" y="32" width="8" height="22" rx="4" />
              <rect x="39" y="32" width="8" height="22" rx="4" />
              <rect x="50" y="42" width="8" height="12" rx="4" />
            </g>
            <rect x="28" y="12" width="8" height="42" rx="4" class="fill-red-600" />
          </svg>
          {{ t('app.title') }}
        </RouterLink>
        <MuteToggle />
      </div>
    </header>
    <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <RouterView />
    </main>
  </div>
</template>
