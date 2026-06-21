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
          <span class="size-2.5 shrink-0 rounded-full bg-red-600" aria-hidden="true"></span>
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
