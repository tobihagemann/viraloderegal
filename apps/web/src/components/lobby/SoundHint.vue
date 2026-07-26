<script setup lang="ts">
import { ExclamationTriangleIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { useMute } from '../../composables/useMute.js';

const { t } = useI18n();
const muted = useMute();
</script>

<template>
  <div v-if="muted" class="flex flex-col gap-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-600/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <div class="flex items-start gap-2.5">
      <ExclamationTriangleIcon class="mt-0.5 size-4 shrink-0 text-amber-500" />
      <p class="min-w-0 text-sm text-pretty text-amber-800">{{ t('sound.offHint') }}</p>
    </div>
    <button type="button" class="btn btn-secondary shrink-0" @click="muted = false">{{ t('sound.enable') }}</button>
  </div>
</template>
