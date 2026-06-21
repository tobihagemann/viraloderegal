<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useGameState } from '../composables/useGameState.js';

defineProps<{ secondsRemaining: number }>();
const { dismissWarning } = useGameState();
const { t } = useI18n();
</script>

<template>
  <div class="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-600/20">
    <p class="min-w-0 flex-1 text-sm text-amber-800">{{ t('cleanup.warning', { seconds: secondsRemaining }) }}</p>
    <button type="button" class="relative shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100" :aria-label="t('cleanup.dismiss')" @click="dismissWarning">
      <svg viewBox="0 0 16 16" class="size-4 fill-current" aria-hidden="true">
        <path
          d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"
        />
      </svg>
      <span class="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden" aria-hidden="true"></span>
    </button>
  </div>
</template>
