<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/16/solid';
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
      <XMarkIcon class="size-4" />
      <span class="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden" aria-hidden="true"></span>
    </button>
  </div>
</template>
