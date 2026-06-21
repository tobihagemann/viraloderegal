<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PhaseHeader from '../game/PhaseHeader.vue';

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-6">
    <PhaseHeader />
    <div class="flex flex-col items-center gap-8 py-10 text-center">
      <p class="text-xl font-medium text-balance text-neutral-500">{{ t('reveal.sting') }}</p>
      <div class="flex gap-2" aria-hidden="true">
        <span class="size-3 animate-bounce rounded-full bg-red-600 [animation-delay:-300ms]"></span>
        <span class="size-3 animate-bounce rounded-full bg-red-600 [animation-delay:-150ms]"></span>
        <span class="size-3 animate-bounce rounded-full bg-red-600"></span>
      </div>
    </div>
  </div>
</template>
