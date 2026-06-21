<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import CountdownTimer from './CountdownTimer.vue';

const { store } = useGameState();
const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <p v-if="store.round" class="text-sm font-medium text-neutral-500 tabular-nums">
      {{ t('game.round', { current: store.round.roundNo, total: store.round.roundsTotal }) }}
    </p>
    <CountdownTimer v-if="store.phaseEndAt" :phase-end-at="store.phaseEndAt" />
  </div>
</template>
